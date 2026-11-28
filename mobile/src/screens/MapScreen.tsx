import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, AppState, Image, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useIsFocused, useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fetchSpeciesGuide } from "../api";
import { SF_COORDS } from "../config";
import { BirdMap } from "../components/BirdMap";
import { SkyfriendWatch } from "../components/SkyfriendWatch";
import { BirdwalkPlanner } from "../components/BirdwalkPlanner";
import { SpeciesGuide } from "../components/SpeciesGuide";
import type { BirdMapMode } from "../components/BirdMap";
import { useBirds } from "../hooks/useBirds";
import { useCollection } from "../hooks/useCollection";
import { useWeather } from "../hooks/useWeather";
import { useTrainerProfile } from "../hooks/useTrainerProfile";
import { claimDailyBonusXp, hasDailyBonus } from "../store/collection";
import type { Coordinates, EbirdObservation, SeenSpecies } from "../types";
import { observationTimeMs } from "../utils/observationTime";
import { RARITY_ORDER, rarityForSpecies, speciesKeyAliases } from "../utils/progression";
import { buildBirdwalkPlan, xpForBirdwalk, type BirdwalkState, type BirdwalkStop } from "../utils/birdwalk";
import { findFreshHotspots } from "../utils/hotspots";
import { buildSkyfriendSpawns, distanceKm, loadSkyfriendFled, loadSkyfriendSpecies, markSkyfriendFled, SKYFRIEND_COLLECT_KM, observationMarkerId, saveSkyfriendSpecies, skyfriendCellKeysAround, skyfriendCellKeyFromEncounterId } from "../utils/skyfriends";

type TrackTarget = Coordinates & { name: string; id?: string; speciesCode?: string; kind?: "hotspot" | "rare"; frequency?: number; abundanceCount?: number; canonicalKey?: string; sciName?: string; imageUrl?: string; obsValid?: boolean };
type GuideTarget = { speciesCode: string; comName: string; sciName?: string };
let persistentTrackTarget: TrackTarget | undefined;
const MAP_PREFERENCES_KEY = "birdgo.map-preferences-v1";
const DISMISSED_RARE_HUNTS_KEY = "birdgo.dismissed-rare-hunts-v1";
const DISMISSED_HOTSPOTS_KEY = "birdgo.dismissed-hotspots-v1";

function externalSpeciesUrl(target: GuideTarget): string {
  return target.speciesCode.startsWith("inat-")
    ? `https://www.inaturalist.org/taxa/${target.speciesCode.slice(5)}`
    : target.speciesCode && !target.speciesCode.startsWith("bw-")
    ? `https://ebird.org/species/${target.speciesCode}`
    : `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(target.comName)}`;
}

function formatObservationAge(obsDt: string | undefined, source?: string, longitude?: number, latitude?: number): string {
  const verb = source === "birdweather" ? "detected" : "reported";
  if (!obsDt) return `recently ${verb}`;
  const observedAt = observationTimeMs(obsDt, longitude, latitude);
  if (observedAt == null) return `recently ${verb}`;
  const hours = Math.max(0, (Date.now() - observedAt) / 3_600_000);
  if (hours < 1) return `${verb} within the hour`;
  if (hours < 24) return `${verb} ${Math.round(hours)}h ago`;
  return `${verb} ${Math.round(hours / 24)}d ago`;
}


function rareHuntInstanceId(bird: EbirdObservation): string {
  return `${observationMarkerId(bird)}:${bird.obsDt ?? "unknown"}`;
}

function openWalkingDirections(latitude: number, longitude: number): void {
  const destination = `${latitude},${longitude}`;
  const url = Platform.OS === "ios"
    ? `https://maps.apple.com/?daddr=${destination}&dirflg=w`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=walking`;
  void Linking.openURL(url);
}

export function MapScreen({ onCapture, targetCapture }: { onCapture?: (hint?: SeenSpecies) => void; targetCapture?: { speciesCode?: string; commonName: string; sciName?: string | null; encounterId?: string; timestamp: number } }) {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const wasFocused = useRef(false);
  const insets = useSafeAreaInsets();
  const [location, setLocation] = useState<Coordinates>(SF_COORDS);
  const [center, setCenter] = useState<Coordinates>(SF_COORDS);
  const [mode, setMode] = useState<BirdMapMode>("adventure");
  const [firstPerson, setFirstPerson] = useState(true);
  const [mapPreferencesLoaded, setMapPreferencesLoaded] = useState(false);
  const [heading, setHeading] = useState<number | undefined>();
  const [recenterRequest, setRecenterRequest] = useState(0);
  const [overviewRequest, setOverviewRequest] = useState(0);
  const [trackRequest, setTrackRequest] = useState<TrackTarget | undefined>();
  const [stopTrackRequest, setStopTrackRequest] = useState(0);
  const [closePopupRequest, setClosePopupRequest] = useState(0);
  const processedTargetCapture = useRef(0);
  const [activeTrackTarget, setActiveTrackTargetState] = useState<TrackTarget | undefined>(persistentTrackTarget);
  const setActiveTrackTarget = (target?: TrackTarget) => {
    persistentTrackTarget = target;
    setActiveTrackTargetState(target);
  };
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const [completionNotice, setCompletionNotice] = useState<string | null>(null);
  const [popupOpen, setPopupOpen] = useState(false);
  const [toastOpen, setToastOpen] = useState(false);
  const [nearbyState, setNearbyState] = useState<"peek" | "half">("peek");
  const [tracking, setTracking] = useState(false);
  const [followPaused, setFollowPaused] = useState(false);
  const [locationRetry, setLocationRetry] = useState(0);
  const hasRealLocation = useRef(false);
  const fallbackActive = useRef(true);
  const [dismissedRareHuntIds, setDismissedRareHuntIds] = useState<string[]>([]);
  const [dismissedHotspotKeys, setDismissedHotspotKeys] = useState<string[]>([]);
  const [rareHuntImageUrl, setRareHuntImageUrl] = useState<string>();
  const rareDismissalsLoaded = useRef(false);
  const hotspotDismissalsLoaded = useRef(false);
  const { birds, notable, loading, error, loadedArea, refresh } = useBirds(center.latitude, center.longitude);
  const weather = useWeather(location);
  const { trainer, refresh: refreshTrainer } = useTrainerProfile();
  const { saveSeen, captures, skyfriends, saveSkyfriend, refresh: refreshCollection } = useCollection();
  const collectingSkyfriends = useRef(new Set<string>());
  const [spawnSpeciesAssignments, setSpawnSpeciesAssignments] = useState<Record<string, string[]> | null>(null);
  const [fledSkyfriends, setFledSkyfriends] = useState<Record<string, number>>({});
  const [watchTarget, setWatchTarget] = useState<EbirdObservation | undefined>();
  const [birdwalk, setBirdwalk] = useState<BirdwalkState | undefined>();
  const [birdwalkBonusClaimed, setBirdwalkBonusClaimed] = useState(false);
  const [guideTarget, setGuideTarget] = useState<GuideTarget | undefined>();

  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(DISMISSED_RARE_HUNTS_KEY).then((raw) => {
      if (cancelled) return;
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as unknown;
          if (Array.isArray(parsed)) setDismissedRareHuntIds(parsed.filter((id): id is string => typeof id === "string").slice(-20));
        } catch {
          // Ignore corrupt dismissal state.
        }
      }
      rareDismissalsLoaded.current = true;
    }).catch(() => {
      rareDismissalsLoaded.current = true;
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!rareDismissalsLoaded.current) return;
    void AsyncStorage.setItem(DISMISSED_RARE_HUNTS_KEY, JSON.stringify(dismissedRareHuntIds)).catch(() => undefined);
  }, [dismissedRareHuntIds]);

  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(DISMISSED_HOTSPOTS_KEY).then((raw) => {
      if (cancelled) return;
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as unknown;
          if (Array.isArray(parsed)) setDismissedHotspotKeys(parsed.filter((id): id is string => typeof id === "string").slice(-12));
        } catch {
          // Ignore corrupt dismissal state.
        }
      }
      hotspotDismissalsLoaded.current = true;
    }).catch(() => {
      hotspotDismissalsLoaded.current = true;
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!hotspotDismissalsLoaded.current) return;
    void AsyncStorage.setItem(DISMISSED_HOTSPOTS_KEY, JSON.stringify(dismissedHotspotKeys)).catch(() => undefined);
  }, [dismissedHotspotKeys]);
  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(MAP_PREFERENCES_KEY).then((raw) => {
      if (cancelled) return;
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as { mode?: unknown; firstPerson?: unknown };
          if (parsed.mode === "classic" || parsed.mode === "adventure") setMode(parsed.mode);
          if (typeof parsed.firstPerson === "boolean") setFirstPerson(parsed.firstPerson);
        } catch {
          // Ignore corrupt preferences and keep defaults.
        }
      }
      setMapPreferencesLoaded(true);
    }).catch(() => {
      if (!cancelled) setMapPreferencesLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!mapPreferencesLoaded) return;
    void AsyncStorage.setItem(MAP_PREFERENCES_KEY, JSON.stringify({ mode, firstPerson })).catch(() => undefined);
  }, [firstPerson, mapPreferencesLoaded, mode]);

  useFocusEffect(useCallback(() => {
    void refreshCollection();
    void refreshTrainer();
    void loadSkyfriendFled().then(setFledSkyfriends).catch(() => undefined);
    void hasDailyBonus("birdwalk").then(setBirdwalkBonusClaimed).catch(() => undefined);
    return () => setClosePopupRequest((request) => request + 1);
  }, [refreshCollection, refreshTrainer]));
  useEffect(() => {
    const now = Date.now();
    const nextExpiry = Math.min(...Object.values(fledSkyfriends).filter((until) => until > now));
    if (!Number.isFinite(nextExpiry)) return undefined;
    const timeout = setTimeout(() => {
      const expiryNow = Date.now();
      setFledSkyfriends((current) => {
        const entries = Object.entries(current).filter(([, until]) => until > expiryNow);
        return entries.length === Object.keys(current).length ? current : Object.fromEntries(entries);
      });
    }, nextExpiry - now + 50);
    return () => clearTimeout(timeout);
  }, [fledSkyfriends]);
  const trackBirdwalkStop = (stop: BirdwalkStop) => {
    const target = {
      latitude: stop.latitude,
      longitude: stop.longitude,
      name: stop.commonName,
      id: stop.id,
      speciesCode: stop.speciesCode,
    };
    setActiveTrackTarget(target);
    setTrackRequest(target);
  };

  const stopBirdwalkTracking = (stops?: BirdwalkStop[]) => {
    if (stops?.some((stop) => stop.id === activeTrackTarget?.id)) {
      setActiveTrackTarget(undefined);
      setTracking(false);
      setStopTrackRequest((request) => request + 1);
    }
  };

  const advanceBirdwalk = (completedId: string, completedName: string): boolean => {
    if (!birdwalk) return false;
    const currentStop = birdwalk.stops[birdwalk.index];
    if (!currentStop || currentStop.id !== completedId) return false;
    const nextIndex = birdwalk.index + 1;
    if (nextIndex >= birdwalk.stops.length) {
      const completedStopCount = birdwalk.stops.length - (birdwalk.skippedIds?.length ?? 0);
      const rewardXp = xpForBirdwalk(Math.max(1, completedStopCount));
      setBirdwalk(undefined);
      setActiveTrackTarget(undefined);
      setTracking(false);
      setStopTrackRequest((request) => request + 1);
      void claimDailyBonusXp("birdwalk", rewardXp).then((awarded) => {
        if (awarded) {
          setBirdwalkBonusClaimed(true);
          void refreshCollection();
        }
        setCompletionNotice(`Birdwalk complete — ${completedName} was the final stop!${awarded ? ` +${rewardXp} XP` : ""}`);
      }).catch(() => setCompletionNotice(`Birdwalk complete — ${completedName} was the final stop!`));
      return true;
    }
    const nextState = { ...birdwalk, index: nextIndex };
    const nextStop = nextState.stops[nextIndex];
    setBirdwalk(nextState);
    setCompletionNotice(`${completedName} complete. Next stop: ${nextStop.commonName}.`);
    trackBirdwalkStop(nextStop);
    return true;
  };

  const skipBirdwalkStop = () => {
    if (!birdwalk) return;
    const currentStop = birdwalk.stops[birdwalk.index];
    const nextIndex = birdwalk.index + 1;
    if (nextIndex >= birdwalk.stops.length) {
      stopBirdwalkTracking([currentStop]);
      setBirdwalk(undefined);
      setCompletionNotice("Birdwalk ended.");
      return;
    }
    const nextState = { ...birdwalk, index: nextIndex, skippedIds: [...(birdwalk.skippedIds ?? []), currentStop.id] };
    setBirdwalk(nextState);
    setCompletionNotice(`Skipped ${currentStop.commonName}. Next stop: ${nextState.stops[nextIndex].commonName}.`);
    trackBirdwalkStop(nextState.stops[nextIndex]);
  };

  const endBirdwalk = () => {
    if (!birdwalk) return;
    stopBirdwalkTracking(birdwalk.stops);
    setBirdwalk(undefined);
    setCompletionNotice("Birdwalk ended.");
  };

  useEffect(() => {
    if (!targetCapture || processedTargetCapture.current === targetCapture.timestamp) return;
    processedTargetCapture.current = targetCapture.timestamp;
    const captureName = targetCapture.commonName.trim().toLowerCase().replace(/\s+/g, " ");
    const matchesCapture = (target: TrackTarget) => {
      const targetName = target.name.trim().toLowerCase().replace(/\s+/g, " ");
      const sameSpecies = Boolean(
        (target.speciesCode && targetCapture.speciesCode && target.speciesCode === targetCapture.speciesCode)
        || (targetName && captureName && targetName === captureName)
      );
      if (target.kind === "rare") return sameSpecies;
      const sameEncounter = target.id
        ? targetCapture.encounterId === target.id
        : sameSpecies;
      return sameSpecies && sameEncounter;
    };
    const walkStop = birdwalk?.stops[birdwalk.index];
    if (walkStop && matchesCapture({
      latitude: walkStop.latitude,
      longitude: walkStop.longitude,
      name: walkStop.commonName,
      id: walkStop.id,
      speciesCode: walkStop.speciesCode,
    }) && advanceBirdwalk(walkStop.id, targetCapture.commonName)) return;
    const completionTarget = activeTrackTarget;
    if (!completionTarget || !matchesCapture(completionTarget)) return;
    if (completionTarget.kind === "rare") {
      const rewardXp = 25;
      void claimDailyBonusXp("rare-hunt", rewardXp).then((awarded) => {
        if (awarded) void refreshCollection();
        setCompletionNotice(`Rare hunt complete: ${targetCapture.commonName}!${awarded ? ` +${rewardXp} XP` : ""}`);
      }).catch(() => setCompletionNotice(`Rare hunt complete: ${targetCapture.commonName}!`));
    } else {
      if (completionTarget.id && advanceBirdwalk(completionTarget.id, targetCapture.commonName)) return;
      setCompletionNotice(`Encounter complete: ${targetCapture.commonName}!`);
    }
    setActiveTrackTarget(undefined);
    setTracking(false);
    setStopTrackRequest((request) => request + 1);
  }, [targetCapture, activeTrackTarget, birdwalk, refreshCollection]);

  useEffect(() => {
    if (!completionNotice || !isFocused) return;
    const timeout = setTimeout(() => setCompletionNotice(null), 6000);
    return () => clearTimeout(timeout);
  }, [completionNotice, isFocused]);

  useEffect(() => {
    if (isFocused && !wasFocused.current && activeTrackTarget) setTrackRequest({ ...activeTrackTarget });
    wasFocused.current = isFocused;
  }, [isFocused, activeTrackTarget]);
  const captureCounts = useMemo(() => captures.reduce<Record<string, number>>((counts, capture) => {
    speciesKeyAliases(capture.speciesCode, capture.commonName, capture.sciName, capture.canonicalKey).forEach((key) => {
      counts[key] = (counts[key] ?? 0) + 1;
    });
    return counts;
  }, {}), [captures]);
  const trackedSkyfriendCellKey = skyfriendCellKeyFromEncounterId(activeTrackTarget?.id);
  const skyfriendCellsKey = useMemo(() => {
    const keys = skyfriendCellKeysAround(location);
    if (trackedSkyfriendCellKey && !keys.includes(trackedSkyfriendCellKey)) keys.push(trackedSkyfriendCellKey);
    return keys.join("|");
  }, [location, trackedSkyfriendCellKey]);
  const skyfriendCells = useMemo(() => skyfriendCellsKey.split("|"), [skyfriendCellsKey]);
  useEffect(() => {
    let active = true;
    setSpawnSpeciesAssignments(null);
    void Promise.all(skyfriendCells.map(async (cellKey) => [cellKey, await loadSkyfriendSpecies(cellKey)] as const)).then((entries) => {
      if (active) setSpawnSpeciesAssignments(Object.fromEntries(entries));
    }).catch(() => {
      if (active) setSpawnSpeciesAssignments({});
    });
    return () => { active = false; };
  }, [skyfriendCells, skyfriendCellsKey]);
  const skyfriendSpawnGroups = useMemo(
    () => spawnSpeciesAssignments
      ? skyfriendCells.map((cellKey) => ({
        cellKey,
        spawns: buildSkyfriendSpawns(birds, spawnSpeciesAssignments[cellKey] ?? [], cellKey),
      }))
      : [],
    [birds, location, skyfriendCells, spawnSpeciesAssignments, trackedSkyfriendCellKey],
  );
  const skyfriendSpawns = useMemo(
    () => skyfriendSpawnGroups.flatMap((group) => group.spawns)
      .filter((bird) => distanceKm(location, bird) <= 0.55)
      .sort((left, right) => distanceKm(location, left) - distanceKm(location, right)),
    [location, skyfriendSpawnGroups],
  );
  useEffect(() => {
    if (!spawnSpeciesAssignments) return;
    skyfriendSpawnGroups.forEach((group) => {
      if (!group.spawns.length) return;
      const existing = spawnSpeciesAssignments[group.cellKey] ?? [];
      const speciesCodes = group.spawns.map((bird) => bird.speciesCode);
      const mergedCodes = speciesCodes.map((speciesCode, index) => existing[index] ?? speciesCode);
      const changed = mergedCodes.some((speciesCode, index) => existing[index] !== speciesCode);
      if (changed) void saveSkyfriendSpecies(group.cellKey, mergedCodes).catch(() => undefined);
    });
  }, [skyfriendSpawnGroups, spawnSpeciesAssignments]);
  const collectedSkyfriendIds = useMemo(() => new Set(skyfriends.map((record) => record.encounterId).filter(Boolean)), [skyfriends]);
  const activeSkyfriendSpawns = useMemo(
    () => {
      const available = skyfriendSpawns.filter((bird) => {
        const encounterId = observationMarkerId(bird);
        return !collectedSkyfriendIds.has(encounterId) && (fledSkyfriends[encounterId] ?? 0) <= Date.now();
      });
      const realInReach = birds.filter((bird) => !bird.virtual && distanceKm(location, bird) <= SKYFRIEND_COLLECT_KM).length;
      const targetVirtualCount = Math.max(0, 2 - realInReach);
      const trackedBird = activeTrackTarget
        ? available.find((bird) => observationMarkerId(bird) === activeTrackTarget.id)
        : undefined;
      const nearest = available
        .filter((bird) => bird !== trackedBird)
        .sort((left, right) => distanceKm(location, left) - distanceKm(location, right));
      const trackedCountsTowardTarget = Boolean(trackedBird && distanceKm(location, trackedBird) <= SKYFRIEND_COLLECT_KM);
      const nearestCount = Math.max(0, targetVirtualCount - (trackedCountsTowardTarget ? 1 : 0));
      return [...(trackedBird ? [trackedBird] : []), ...nearest.slice(0, nearestCount)].slice(0, 3);
    },
    [birds, location, skyfriendSpawns, collectedSkyfriendIds, activeTrackTarget, fledSkyfriends],
  );
  const mapBirds = useMemo(() => [...birds, ...activeSkyfriendSpawns], [birds, activeSkyfriendSpawns]);
  const birdwalkPlan = useMemo(() => buildBirdwalkPlan(location, mapBirds, captureCounts), [location, mapBirds, captureCounts]);

  const startBirdwalk = () => {
    const nextState = birdwalk ?? { stops: birdwalkPlan.stops, index: 0 };
    const nextStop = nextState.stops[nextState.index];
    if (!nextStop) return;
    setBirdwalk(nextState);
    trackBirdwalkStop(nextStop);
  };

  const clearTrackedSkyfriend = (encounterId: string) => {
    if (activeTrackTarget?.id !== encounterId) return;
    setActiveTrackTarget(undefined);
    setTracking(false);
    setStopTrackRequest((request) => request + 1);
  };

  const collectSkyfriend = (bird: EbirdObservation) => {
    if (distanceKm(location, bird) > SKYFRIEND_COLLECT_KM) {
      setCompletionNotice("Get closer to collect this Skyfriend.");
      return;
    }
    setCompletionNotice(null);
    setWatchTarget(bird);
  };

  const completeSkyfriendCollection = async (bird: EbirdObservation) => {
    const encounterId = observationMarkerId(bird);
    if (collectingSkyfriends.current.has(encounterId)) return;
    collectingSkyfriends.current.add(encounterId);
    try {
      const commonName = bird.comName ?? "Skyfriend";
      await saveSkyfriend({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        encounterId,
        speciesCode: bird.speciesCode,
        commonName,
        sciName: bird.sciName,
        canonicalKey: bird.canonicalKey,
        timestamp: new Date().toISOString(),
        location: { latitude: bird.latitude, longitude: bird.longitude },
        rarity: rarityForSpecies(bird.speciesCode, commonName, bird.isNotable, bird.sciName, bird.canonicalKey, bird.frequency, bird.abundanceCount),
        imageUrl: bird.imageUrl,
        ...(bird.prismatic ? { variant: "prismatic" as const } : {}),
      });
      setCompletionNotice(bird.prismatic ? `Prismatic Skyfriend collected: ${commonName}!` : `Skyfriend collected: ${commonName}!`);
      if (!advanceBirdwalk(encounterId, commonName)) clearTrackedSkyfriend(encounterId);
    } finally {
      collectingSkyfriends.current.delete(encounterId);
    }
  };

  const escapeSkyfriend = async (bird: EbirdObservation) => {
    const encounterId = observationMarkerId(bird);
    const until = Date.now() + 5 * 60 * 1000;
    setFledSkyfriends((current) => ({ ...current, [encounterId]: until }));
    await markSkyfriendFled(encounterId, until).catch(() => undefined);
    setCompletionNotice(`${bird.comName ?? "The Skyfriend"} slipped away. It may return soon.`);
    clearTrackedSkyfriend(encounterId);
  };
  const hasCapturedSpecies = (bird: EbirdObservation) => speciesKeyAliases(bird.speciesCode, bird.comName, bird.sciName, bird.canonicalKey).some((key) => (captureCounts[key] ?? 0) > 0);
  const rareHuntCandidates = new Map<string, EbirdObservation>();
  notable.forEach((bird) => rareHuntCandidates.set(observationMarkerId(bird), bird));
  birds.filter((bird) => bird.source === "birdweather").forEach((bird) => {
    const id = observationMarkerId(bird);
    if (!rareHuntCandidates.has(id)) rareHuntCandidates.set(id, bird);
  });
  const rareHunt = [...rareHuntCandidates.values()]
    .filter((bird) => !dismissedRareHuntIds.includes(rareHuntInstanceId(bird)))
    .filter((bird) => {
      if (bird.virtual || !bird.comName || distanceKm(location, bird) > 15) return false;
      const observedAt = observationTimeMs(bird.obsDt, bird.longitude, bird.latitude);
      const ageHours = observedAt == null ? 24 : Math.max(0, (Date.now() - observedAt) / 3_600_000);
      if (!Number.isFinite(ageHours) || ageHours > 72) return false;
      return RARITY_ORDER.indexOf(rarityForSpecies(bird.speciesCode, bird.comName, Boolean(bird.isNotable), bird.sciName, bird.canonicalKey, bird.frequency, bird.abundanceCount)) >= RARITY_ORDER.indexOf("rare");
    })
    .sort((a, b) => {
      const scoreOf = (bird: EbirdObservation) => {
        const observedAt = observationTimeMs(bird.obsDt, bird.longitude, bird.latitude);
        const ageHours = observedAt == null ? 24 : (Date.now() - observedAt) / 3_600_000;
        const rarityRank = RARITY_ORDER.indexOf(rarityForSpecies(bird.speciesCode, bird.comName, Boolean(bird.isNotable), bird.sciName, bird.canonicalKey, bird.frequency, bird.abundanceCount));
        const corroborationBonus = Math.min(Math.max((bird.evidenceCount ?? 1) - 1, 0), 4) * 30;
        const unconfirmedPenalty = bird.obsValid === false && (bird.evidenceCount ?? 1) < 3 ? 50 : 0;
        return rarityRank * 40 + corroborationBonus + (hasCapturedSpecies(bird) ? 0 : 35) - ageHours * 3 - distanceKm(location, bird) * 4 - unconfirmedPenalty;
      };
      return scoreOf(b) - scoreOf(a);
    })[0];
  const dismissRareHunt = (id: string) => {
    setDismissedRareHuntIds((current) => current.includes(id) ? current : [...current, id].slice(-20));
  };
  const startRareHunt = (bird: EbirdObservation) => {
    const target = { latitude: bird.latitude, longitude: bird.longitude, name: bird.comName ?? "Rare bird", id: observationMarkerId(bird), speciesCode: bird.speciesCode, kind: "rare" as const, frequency: bird.frequency, abundanceCount: bird.abundanceCount, canonicalKey: bird.canonicalKey, sciName: bird.sciName, imageUrl: bird.imageUrl, obsValid: bird.obsValid };
    if (mode === "classic") {
      openWalkingDirections(target.latitude, target.longitude);
      setActiveTrackTarget(target);
    } else {
      setActiveTrackTarget(target);
      setTrackRequest(target);
    }
    dismissRareHunt(rareHuntInstanceId(bird));
  };
  const visibleRareHunt = rareHunt && !dismissedRareHuntIds.includes(rareHuntInstanceId(rareHunt)) && !popupOpen && !tracking && (!birdwalk || mode === "classic") && !completionNotice && !locationNotice && !error ? rareHunt : undefined;
  const visibleRareHuntIsNew = visibleRareHunt ? !hasCapturedSpecies(visibleRareHunt) : false;
  const visibleRareHuntReportLabel = visibleRareHunt && visibleRareHunt.source !== "birdweather"
    ? (visibleRareHunt.evidenceCount ?? 1) > 4 ? "5+ reports" : `${visibleRareHunt.evidenceCount ?? 1} report${(visibleRareHunt.evidenceCount ?? 1) === 1 ? "" : "s"}`
    : "";
  const visibleRareHuntInstanceId = visibleRareHunt ? rareHuntInstanceId(visibleRareHunt) : undefined;
  useEffect(() => {
    if (!visibleRareHunt) {
      setRareHuntImageUrl(undefined);
      return;
    }
    if (visibleRareHunt.imageUrl) {
      setRareHuntImageUrl(visibleRareHunt.imageUrl);
      return;
    }
    let cancelled = false;
    setRareHuntImageUrl(undefined);
    void fetchSpeciesGuide({ commonName: visibleRareHunt.comName, sciName: visibleRareHunt.sciName })
      .then((guide) => {
        if (!cancelled) setRareHuntImageUrl(guide.imageUrl);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [visibleRareHuntInstanceId]);
  const freshHotspots = useMemo(() => findFreshHotspots(birds, location).filter((hotspot) => !dismissedHotspotKeys.includes(hotspot.key)), [birds, dismissedHotspotKeys, location]);
  const rareHuntHotspotKey = visibleRareHunt ? visibleRareHunt.locId ?? `${visibleRareHunt.latitude.toFixed(3)}:${visibleRareHunt.longitude.toFixed(3)}` : undefined;
  const freshHotspot = freshHotspots.find((hotspot) => hotspot.score >= 60 && hotspot.key !== rareHuntHotspotKey);
  const visibleHotspot = freshHotspot && !popupOpen && !tracking && (!birdwalk || mode === "classic") && !completionNotice && !locationNotice && !error ? freshHotspot : undefined;
  const dismissHotspot = (key: string) => {
    setDismissedHotspotKeys((current) => current.includes(key) ? current : [...current, key].slice(-12));
  };
  const startHotspotScout = (hotspot: NonNullable<typeof visibleHotspot>) => {
    const target = { latitude: hotspot.latitude, longitude: hotspot.longitude, name: hotspot.name, id: hotspot.key, kind: "hotspot" as const };
    if (mode === "classic") openWalkingDirections(target.latitude, target.longitude);
    else {
      setActiveTrackTarget(target);
      setTrackRequest(target);
    }
    dismissHotspot(hotspot.key);
  };
  const topMessage = completionNotice
    ? { text: completionNotice, onPress: () => setCompletionNotice(null) }
    : locationNotice
    ? { text: locationNotice, onPress: () => setLocationRetry((request) => request + 1) }
    : error
      ? { text: error, onPress: () => void refresh() }
      : null;
  const handleRegionChange = (next: Coordinates) => {
    if (
      hasRealLocation.current
      && Math.abs(next.latitude - SF_COORDS.latitude) < 0.01
      && Math.abs(next.longitude - SF_COORDS.longitude) < 0.01
    ) return;
    setCenter(next);
  };

  useEffect(() => {
    let mounted = true;
    let subscription: Location.LocationSubscription | undefined;
    let nativeWatchStarting = false;
    let webWatchId: number | undefined;
    let permissionStatus: PermissionStatus | undefined;
    const applyFix = (latitude: number, longitude: number) => {
      if (!mounted || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
      const next = { latitude, longitude };
      const firstFix = !hasRealLocation.current;
      const recoveringFromFallback = fallbackActive.current;
      hasRealLocation.current = true;
      fallbackActive.current = false;
      setLocation(next);
      setLocationNotice(null);
      if (firstFix || recoveringFromFallback) {
        setCenter(next);
        setRecenterRequest((request) => request + 1);
      }
    };
    const handleFailure = () => {
      if (mounted && !hasRealLocation.current) {
        fallbackActive.current = true;
        setLocationNotice("Location unavailable — tap to request access.");
      }
    };
    const startWebWatch = () => {
      if (!mounted || !navigator.geolocation) {
        handleFailure();
        return;
      }
      if (webWatchId !== undefined) navigator.geolocation.clearWatch(webWatchId);
      webWatchId = navigator.geolocation.watchPosition(
        (position) => applyFix(position.coords.latitude, position.coords.longitude),
        handleFailure,
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
      );
      navigator.geolocation.getCurrentPosition(
        (position) => applyFix(position.coords.latitude, position.coords.longitude),
        handleFailure,
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
      );
    };
    const startNativeWatch = async () => {
      if (!mounted || subscription || nativeWatchStarting) return;
      nativeWatchStarting = true;
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        nativeWatchStarting = false;
        handleFailure();
        return;
      }
      try {
        const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        applyFix(current.coords.latitude, current.coords.longitude);
        subscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, distanceInterval: 5 },
          (update) => applyFix(update.coords.latitude, update.coords.longitude),
        );
      } catch {
        handleFailure();
      } finally {
        nativeWatchStarting = false;
      }
    };
    if (Platform.OS === "web") {
      startWebWatch();
      void navigator.permissions?.query({ name: "geolocation" }).then((status) => {
        permissionStatus = status;
        status.onchange = () => {
          if (status.state === "granted") startWebWatch();
          else handleFailure();
        };
      }).catch(() => undefined);
    } else {
      void startNativeWatch();
    }
    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && Platform.OS !== "web") void startNativeWatch();
    });
    return () => {
      mounted = false;
      subscription?.remove();
      if (webWatchId !== undefined) navigator.geolocation?.clearWatch(webWatchId);
      if (permissionStatus) permissionStatus.onchange = null;
      appStateSubscription.remove();
    };
  }, [locationRetry]);

  useEffect(() => {
    if (Platform.OS === "web" || !firstPerson) {
      setHeading(undefined);
      return;
    }
    let mounted = true;
    let subscription: Location.LocationSubscription | undefined;
    void Location.watchHeadingAsync((update) => {
      const nextHeading = update.trueHeading >= 0 ? update.trueHeading : update.magHeading;
      if (Number.isFinite(nextHeading)) setHeading(nextHeading);
    }).then((nextSubscription) => {
      if (mounted) subscription = nextSubscription;
      else nextSubscription.remove();
    }).catch(() => undefined);
    return () => {
      mounted = false;
      subscription?.remove();
    };
  }, [firstPerson]);

  useEffect(() => {
    if (!birds.length || !loadedArea) return;
    const unique = new Map<string, SeenSpecies>();
    birds.forEach((bird) => {
      if (!bird.comName || unique.has(bird.speciesCode)) return;
      unique.set(bird.speciesCode, {
        speciesCode: bird.speciesCode,
        comName: bird.comName,
        sciName: bird.sciName,
        canonicalKey: bird.canonicalKey,
        isNotable: Boolean(bird.isNotable),
        imageUrl: bird.imageUrl,
        frequency: bird.frequency,
        abundanceCount: bird.abundanceCount,
      });
    });
    const species = [...unique.values()];
    void saveSeen(species, loadedArea);
  }, [birds, loadedArea, saveSeen]);

  useEffect(() => {
    if (!notable.length) return;
    void Notifications.getPermissionsAsync().then(async (permission) => {
      if (permission.status === "granted") {
        await Notifications.scheduleNotificationAsync({
          content: { title: "Rare bird nearby", body: `${notable[0].comName ?? "A rare bird"} was spotted.` },
          trigger: null,
        });
      }
    }).catch(() => undefined);
  }, [notable]);

  const toggleMode = () => {
    setActiveTrackTarget(undefined);
    setTrackRequest(undefined);
    setTracking(false);
    setFollowPaused(false);
    setToastOpen(false);
    setNearbyState("peek");
    if (mode === "adventure") {
      setFirstPerson(false);
      setMode("classic");
    } else {
      setFirstPerson(true);
      setMode("adventure");
    }
  };

  return (
    <View style={styles.container}>
      <BirdMap
        center={center}
        userLocation={location}
        safeArea={insets}
        birds={mapBirds}
        captureCounts={captureCounts}
        loading={loading}
        weather={weather}
        trainer={trainer}
        mode={mode}
        firstPerson={firstPerson}
        heading={heading}
        recenterRequest={recenterRequest}
        overviewRequest={overviewRequest}
        trackRequest={trackRequest}
        stopTrackRequest={stopTrackRequest}
        closePopupRequest={closePopupRequest}
        onCapture={(bird) => {
          if (bird.virtual) {
            void collectSkyfriend(bird);
            return;
          }
          onCapture?.({
            speciesCode: bird.speciesCode,
            encounterId: `${bird.speciesCode}:${bird.locId ?? `${bird.latitude}:${bird.longitude}`}`,
            comName: bird.comName ?? "Unknown bird",
            sciName: bird.sciName,
            canonicalKey: bird.canonicalKey,
            isNotable: Boolean(bird.isNotable),
            frequency: bird.frequency,
            abundanceCount: bird.abundanceCount,
            imageUrl: bird.imageUrl,
            virtual: Boolean(bird.virtual),
          });
          navigation.navigate("Capture" as never);
        }}
        onDirections={(target) => {
          if (mode === "classic") {
            openWalkingDirections(target.latitude, target.longitude);
            return;
          }
          setActiveTrackTarget(target);
          setTrackRequest(target);
        }}
        onAbout={setGuideTarget}
        onPopupChange={setPopupOpen}
        onToastChange={setToastOpen}
        onNearbyStateChange={setNearbyState}
        onFollowChange={setFollowPaused}
        onTrackingChange={(open, target) => {
          setTracking(open);
          if (open && target) setActiveTrackTarget(target);
          if (!open) setActiveTrackTarget(undefined);
        }}
        onHotspotArrived={(target) => {
          if (!activeTrackTarget || activeTrackTarget.kind !== "hotspot" || activeTrackTarget.id !== target.id) return;
          const hotspotName = target.name ?? activeTrackTarget.name;
          const rewardXp = 15;
          setActiveTrackTarget(undefined);
          setTracking(false);
          setStopTrackRequest((request) => request + 1);
          void claimDailyBonusXp("hotspot-scout", rewardXp).then((awarded) => {
            if (awarded) void refreshCollection();
            setCompletionNotice(`Scout complete: ${hotspotName}!${awarded ? ` +${rewardXp} XP` : " Scan nearby birds."}`);
          }).catch(() => setCompletionNotice(`Scout complete: ${hotspotName}!`));
        }}
        onRegionChange={handleRegionChange}
      />
      <View pointerEvents="box-none" style={[styles.topOverlay, { paddingTop: insets.top + 8 }]}>
        <View style={styles.controlRail}>
        <Pressable accessibilityLabel={`Current map mode: ${mode === "classic" ? "Classic" : "Adventure"}. Tap to switch.`} style={[styles.modeButton, styles.modeButtonActive]} onPress={toggleMode}>
          <Text style={styles.modeButtonText}>{mode === "classic" ? "2D" : "3D"}</Text>
        </Pressable>
        {mode === "adventure" && (
          <Pressable accessibilityLabel={`Current view: ${firstPerson ? "First-person" : "Overhead"}. Tap to switch.`} style={[styles.modeButton, styles.modeButtonActive]} onPress={() => setFirstPerson((current) => !current)}>
            <Text style={styles.modeButtonText}>{firstPerson ? "Walk" : "Above"}</Text>
          </Pressable>
        )}
        </View>
        {visibleRareHunt ? <View style={[styles.rareCard, toastOpen && styles.rareCardBelowToast]}>
          <Text style={styles.rareEyebrow}>{visibleRareHuntIsNew ? "New rare hunt nearby" : "Rare hunt nearby"}</Text>
          <View style={styles.rareMainRow}>
            {rareHuntImageUrl ? <Image source={{ uri: rareHuntImageUrl }} style={styles.rareImage} /> : null}
            <View style={styles.rareTextWrap}>
              <Text numberOfLines={1} style={styles.rareTitle}>{visibleRareHunt.comName}</Text>
              <Text numberOfLines={2} style={styles.rareCopy}>{distanceKm(location, visibleRareHunt) < 0.05 ? "here" : `${distanceKm(location, visibleRareHunt) < 1 ? `${Math.round(distanceKm(location, visibleRareHunt) * 1000)}m` : `${distanceKm(location, visibleRareHunt).toFixed(1)}km`} away`} · {formatObservationAge(visibleRareHunt.obsDt, visibleRareHunt.source, visibleRareHunt.longitude, visibleRareHunt.latitude)}{visibleRareHuntReportLabel ? ` · ${visibleRareHuntReportLabel}` : ""}{visibleRareHunt.locName ? ` · ${visibleRareHunt.locName}` : ""}</Text>
            </View>
          </View>
          <Text numberOfLines={2} style={styles.rareHint}>{visibleRareHunt.source === "birdweather"
            ? "Fresh audio clue — the bird may be anywhere within earshot of the station."
            : visibleRareHunt.obsValid === false
              ? (visibleRareHunt.evidenceCount ?? 1) >= 3
                ? "Multiple independent fresh reports — a strong lead, but still not a guarantee."
                : "Unconfirmed real-world report — treat this as a lead, not a guarantee."
              : "Recent real-world report — the bird is not guaranteed to still be there."}</Text>
          <View style={styles.rareActions}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Track rare ${visibleRareHunt.comName}`} style={styles.rarePrimary} onPress={() => startRareHunt(visibleRareHunt)}><Text style={styles.rarePrimaryText}>Hunt</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`Open ${visibleRareHunt.comName} field guide`} style={styles.rareSecondary} onPress={() => setGuideTarget({ speciesCode: visibleRareHunt.speciesCode, comName: visibleRareHunt.comName ?? "Unknown bird", sciName: visibleRareHunt.sciName })}><Text style={styles.rareSecondaryText}>Guide</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Dismiss rare hunt" style={styles.rareDismiss} onPress={() => dismissRareHunt(rareHuntInstanceId(visibleRareHunt))}><Text style={styles.rareDismissText}>×</Text></Pressable>
          </View>
        </View> : null}
        {visibleHotspot ? <View style={[styles.scoutStrip, toastOpen && styles.rareCardBelowToast]}>
          <View style={styles.scoutStripCopyWrap}>
            <Text numberOfLines={1} style={styles.scoutStripTitle}>Fresh spot · {visibleHotspot.name}</Text>
            <Text numberOfLines={1} style={styles.scoutStripCopy}>{visibleHotspot.rareSpeciesCount ? `${visibleHotspot.rareSpeciesCount} rare · ` : ""}{visibleHotspot.speciesCount} species in 2d · {visibleHotspot.distanceKm < 0.05 ? "here" : `${visibleHotspot.distanceKm < 1 ? `${Math.round(visibleHotspot.distanceKm * 1000)}m` : `${visibleHotspot.distanceKm.toFixed(1)}km`} away`}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Scout ${visibleHotspot.name}`} style={styles.scoutStripButton} onPress={() => startHotspotScout(visibleHotspot)}><Text style={styles.scoutStripButtonText}>Scout</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Dismiss fresh birding spot" style={styles.scoutStripDismiss} onPress={() => dismissHotspot(visibleHotspot.key)}><Text style={styles.scoutStripDismissText}>×</Text></Pressable>
        </View> : null}
        {topMessage && !popupOpen && (
          <Pressable style={[styles.topMessage, toastOpen && styles.topMessageBelowToast]} onPress={topMessage.onPress}>
            <Text style={styles.topMessageText}>{topMessage.text}</Text>
            <Text style={styles.topMessageDismiss}>×</Text>
          </Pressable>
        )}
        {loading && <ActivityIndicator color="#fff" />}
        {mode === "adventure" && !popupOpen && !topMessage && !toastOpen ? <BirdwalkPlanner
          plan={birdwalkPlan}
          active={birdwalk}
          tracking={Boolean(tracking && birdwalk && activeTrackTarget?.id === birdwalk.stops[birdwalk.index]?.id)}
          rewardClaimed={birdwalkBonusClaimed}
          onStart={startBirdwalk}
          onSkip={skipBirdwalkStop}
          onEnd={endBirdwalk}
        /> : null}
      </View>
      {!loading && !error && birds.length === 0 && <View style={styles.empty}><Text style={styles.emptyText}>No birds spotted nearby — try moving the map.</Text></View>}
      {mode === "adventure" && nearbyState !== "half" && (
        <View pointerEvents="box-none" style={[styles.actionRail, { bottom: insets.bottom + 102 }]}>
          <Pressable accessibilityLabel="See all birds" style={styles.actionButton} onPress={() => setOverviewRequest((request) => request + 1)}><Ionicons name="map" size={23} color="#2878d1" /></Pressable>
          <Pressable accessibilityLabel={followPaused ? "Back to me — camera follow paused" : "Back to me"} style={[styles.actionButton, followPaused && styles.recenterAttention]} onPress={() => setRecenterRequest((request) => request + 1)}><Ionicons name="locate" size={25} color="#2878d1" /></Pressable>
        </View>
      )}
      {mode === "classic" && (
        <Pressable accessibilityLabel="Back to me" style={[styles.actionButton, styles.classicRecenter, { top: insets.top + 112 }]} onPress={() => setRecenterRequest((request) => request + 1)}><Ionicons name="locate" size={27} color="#2878d1" /></Pressable>
      )}
      {watchTarget && (
        <SkyfriendWatch
          bird={watchTarget}
          onSuccess={() => void completeSkyfriendCollection(watchTarget)}
          onEscape={() => void escapeSkyfriend(watchTarget)}
          onClose={() => setWatchTarget(undefined)}
        />
      )}
      {guideTarget && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setGuideTarget(undefined)}>
          <View style={styles.guideBackdrop}>
            <Pressable accessibilityLabel="Close field guide" style={styles.guideBackdropPress} onPress={() => setGuideTarget(undefined)} />
            <View style={styles.guideCard}>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.guideScroll}>
                <View style={styles.guideHeaderRow}>
                  <View style={styles.guideTitleWrap}>
                    <Text style={styles.guideTitle}>{guideTarget.comName}</Text>
                    {guideTarget.sciName ? <Text style={styles.guideScientific}>{guideTarget.sciName}</Text> : null}
                  </View>
                  <Pressable accessibilityLabel="Close field guide" style={styles.guideClose} onPress={() => setGuideTarget(undefined)}><Ionicons name="close" size={22} color="#31513d" /></Pressable>
                </View>
                <SpeciesGuide commonName={guideTarget.comName} sciName={guideTarget.sciName} showImage />
                <Pressable accessibilityRole="link" style={styles.externalGuideButton} onPress={() => void Linking.openURL(externalSpeciesUrl(guideTarget))}>
                  <Text style={styles.externalGuideText}>Open full species page</Text>
                  <Ionicons name="open-outline" size={16} color="#2878d1" />
                </Pressable>
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topOverlay: { position: "absolute", top: 0, left: 16, right: 16, paddingTop: 8, gap: 8 },
  controlRail: { alignSelf: "flex-end", flexDirection: "row", gap: 6 },
  modeButton: { minWidth: 64, height: 44, paddingHorizontal: 5, backgroundColor: "#ffffffee", borderRadius: 14, elevation: 3, alignItems: "center", justifyContent: "center" },
  modeButtonActive: { backgroundColor: "#d9efe1", borderWidth: 2, borderColor: "#2f7d5b" },
  modeButtonText: { color: "#173c2b", fontWeight: "700" },
  rareCard: { maxWidth: 360, alignSelf: "flex-start", backgroundColor: "#fff8df", borderColor: "#e3bc4f", borderWidth: 1, padding: 12, borderRadius: 16, elevation: 4, gap: 4 },
  rareCardBelowToast: { marginTop: 52 },
  scoutStrip: { maxWidth: 360, alignSelf: "flex-start", minHeight: 48, flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "#effbf2f2", borderColor: "#77b98d", borderWidth: 1, paddingVertical: 6, paddingHorizontal: 9, borderRadius: 14, elevation: 3 },
  scoutStripCopyWrap: { flex: 1, minWidth: 0 },
  scoutStripTitle: { color: "#173c2b", fontSize: 13, fontWeight: "900" },
  scoutStripCopy: { color: "#3f654e", fontSize: 11, fontWeight: "700", marginTop: 1 },
  scoutStripButton: { minWidth: 56, minHeight: 36, borderRadius: 11, backgroundColor: "#2f7d5b", alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  scoutStripButtonText: { color: "#fff", fontSize: 12, fontWeight: "900" },
  scoutStripDismiss: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  scoutStripDismissText: { color: "#3f654e", fontSize: 19, lineHeight: 21 },
  rareEyebrow: { color: "#9a6908", fontSize: 11, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.8 },
  rareMainRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  rareImage: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: "#dce8df",
  },
  rareTextWrap: {
    flex: 1,
  },
  rareTitle: { color: "#263816", fontSize: 19, fontWeight: "900" },
  rareCopy: { color: "#46513a", fontSize: 12, fontWeight: "700" },
  rareHint: { color: "#655d45", fontSize: 12, lineHeight: 17, marginTop: 2 },
  rareActions: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  rarePrimary: { minWidth: 78, minHeight: 40, borderRadius: 12, backgroundColor: "#c98d13", alignItems: "center", justifyContent: "center" },
  rarePrimaryText: { color: "#fff", fontWeight: "900" },
  rareSecondary: { minWidth: 72, minHeight: 40, borderRadius: 12, backgroundColor: "#fff", borderWidth: 1, borderColor: "#dfc77d", alignItems: "center", justifyContent: "center" },
  rareSecondaryText: { color: "#7c5a10", fontWeight: "900" },
  rareDismiss: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  rareDismissText: { color: "#7c5a10", fontSize: 22, lineHeight: 24 },
  topMessage: { minHeight: 44, maxWidth: 360, alignSelf: "flex-start", backgroundColor: "#ffffffee", paddingHorizontal: 12, borderRadius: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  topMessageBelowToast: { marginTop: 52 },
  topMessageText: { flex: 1, color: "#173c2b", fontWeight: "700", fontSize: 13 },
  topMessageDismiss: { color: "#173c2b", fontSize: 22, lineHeight: 24 },
  empty: { position: "absolute", top: "42%", left: 35, right: 35, backgroundColor: "#ffffffe8", padding: 16, borderRadius: 12 },
  emptyText: { textAlign: "center", color: "#555" },
  actionRail: { position: "absolute", right: 14, gap: 10, alignItems: "center" },
  actionButton: { width: 46, height: 46, borderRadius: 23, backgroundColor: "#ffffffee", alignItems: "center", justifyContent: "center", elevation: 4 },
  recenterAttention: { borderWidth: 3, borderColor: "#d99d21", backgroundColor: "#fff7df" },
  classicRecenter: { position: "absolute", right: 16 },
  guideBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(12, 31, 22, 0.42)" },
  guideBackdropPress: { ...StyleSheet.absoluteFillObject },
  guideCard: { width: "100%", maxWidth: 540, maxHeight: "84%", alignSelf: "center", backgroundColor: "#fffdf6", borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: "hidden", borderWidth: 1, borderColor: "#e0e8df" },
  guideScroll: { padding: 18, paddingBottom: 26 },
  guideHeaderRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 4 },
  guideTitleWrap: { flex: 1 },
  guideTitle: { color: "#173c2b", fontSize: 24, fontWeight: "900", lineHeight: 29 },
  guideScientific: { color: "#68796f", fontSize: 13, fontStyle: "italic", marginTop: 2 },
  guideClose: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "#edf4ef" },
  externalGuideButton: { marginTop: 12, minHeight: 44, borderRadius: 13, backgroundColor: "#edf5ff", borderWidth: 1, borderColor: "#d2e5f7", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  externalGuideText: { color: "#2878d1", fontSize: 13, fontWeight: "900" },
});
