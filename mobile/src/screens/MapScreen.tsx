import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, AppState, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect, useIsFocused, useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SF_COORDS } from "../config";
import { BirdMap } from "../components/BirdMap";
import { SkyfriendWatch } from "../components/SkyfriendWatch";
import type { BirdMapMode } from "../components/BirdMap";
import { useBirds } from "../hooks/useBirds";
import { useCollection } from "../hooks/useCollection";
import { useWeather } from "../hooks/useWeather";
import { useTrainerProfile } from "../hooks/useTrainerProfile";
import type { Coordinates, EbirdObservation, SeenSpecies } from "../types";
import { rarityForSpecies, speciesKeyAliases } from "../utils/progression";
import { buildSkyfriendSpawns, distanceKm, loadSkyfriendFled, loadSkyfriendSpecies, markSkyfriendFled, SKYFRIEND_COLLECT_KM, observationMarkerId, saveSkyfriendSpecies, skyfriendCellKeysAround } from "../utils/skyfriends";

type TrackTarget = Coordinates & { name: string; id?: string; speciesCode?: string };
let persistentTrackTarget: TrackTarget | undefined;

export function MapScreen({ onCapture, targetCapture }: { onCapture?: (hint?: SeenSpecies) => void; targetCapture?: { speciesCode?: string; commonName: string; sciName?: string | null; encounterId?: string; timestamp: number } }) {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const wasFocused = useRef(false);
  const insets = useSafeAreaInsets();
  const [location, setLocation] = useState<Coordinates>(SF_COORDS);
  const [center, setCenter] = useState<Coordinates>(SF_COORDS);
  const [mode, setMode] = useState<BirdMapMode>("adventure");
  const [firstPerson, setFirstPerson] = useState(true);
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
  const [rareDismissed, setRareDismissed] = useState(false);
  const { birds, notable, loading, error, loadedArea, refresh } = useBirds(center.latitude, center.longitude);
  const weather = useWeather(location);
  const { trainer, refresh: refreshTrainer } = useTrainerProfile();
  const { saveSeen, captures, skyfriends, saveSkyfriend, refresh: refreshCollection } = useCollection();
  const collectingSkyfriends = useRef(new Set<string>());
  const [spawnSpeciesAssignments, setSpawnSpeciesAssignments] = useState<Record<string, string[]> | null>(null);
  const [fledSkyfriends, setFledSkyfriends] = useState<Record<string, number>>({});
  const [watchTarget, setWatchTarget] = useState<EbirdObservation | undefined>();
  useFocusEffect(useCallback(() => {
    void refreshCollection();
    void refreshTrainer();
    void loadSkyfriendFled().then(setFledSkyfriends).catch(() => undefined);
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
  useEffect(() => {
    if (!targetCapture || processedTargetCapture.current === targetCapture.timestamp) return;
    processedTargetCapture.current = targetCapture.timestamp;
    if (!activeTrackTarget) return;
    const targetName = activeTrackTarget.name.trim().toLowerCase().replace(/\s+/g, " ");
    const captureName = targetCapture.commonName.trim().toLowerCase().replace(/\s+/g, " ");
    const sameSpecies = Boolean(
      (activeTrackTarget.speciesCode && targetCapture.speciesCode && activeTrackTarget.speciesCode === targetCapture.speciesCode)
      || (targetName && captureName && targetName === captureName)
    );
    const sameEncounter = activeTrackTarget.id
      ? targetCapture.encounterId === activeTrackTarget.id
      : sameSpecies;
    if (!sameSpecies || !sameEncounter) return;
    setCompletionNotice(`Encounter complete: ${targetCapture.commonName}!`);
    setActiveTrackTarget(undefined);
    setTracking(false);
    setStopTrackRequest((request) => request + 1);
  }, [targetCapture, activeTrackTarget]);

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
  const skyfriendCellsKey = useMemo(() => skyfriendCellKeysAround(location).join("|"), [location]);
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
        spawns: buildSkyfriendSpawns(birds, location, new Date(), spawnSpeciesAssignments[cellKey] ?? [], cellKey),
      }))
      : [],
    [birds, location, skyfriendCells, spawnSpeciesAssignments],
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
      const prioritized = available.sort((left, right) => {
        const leftTracked = activeTrackTarget?.id === observationMarkerId(left) ? 0 : 1;
        const rightTracked = activeTrackTarget?.id === observationMarkerId(right) ? 0 : 1;
        return leftTracked - rightTracked;
      });
      const spaced: EbirdObservation[] = [];
      prioritized.forEach((bird) => {
        if (spaced.length >= 3) return;
        if (activeTrackTarget?.id === observationMarkerId(bird) || spaced.every((other) => distanceKm(bird, other) >= 0.07)) spaced.push(bird);
      });
      return spaced;
    },
    [skyfriendSpawns, collectedSkyfriendIds, activeTrackTarget, fledSkyfriends],
  );
  const mapBirds = useMemo(() => [...birds, ...activeSkyfriendSpawns], [birds, activeSkyfriendSpawns]);

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
      });
      setCompletionNotice(`Skyfriend collected: ${commonName}!`);
      clearTrackedSkyfriend(encounterId);
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
  const topMessage = completionNotice
    ? { text: completionNotice, onPress: () => setCompletionNotice(null) }
    : locationNotice
    ? { text: locationNotice, onPress: () => setLocationRetry((request) => request + 1) }
    : error
      ? { text: "Couldn’t load birds. Tap to retry.", onPress: () => void refresh() }
      : notable.length > 0 && !rareDismissed && !toastOpen
          ? { text: `Rare bird nearby: ${notable[0].comName ?? "Unknown"}!`, onPress: () => setRareDismissed(true) }
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
        setFirstPerson(true);
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
            const destination = `${target.latitude},${target.longitude}`;
            const url = Platform.OS === "ios"
              ? `https://maps.apple.com/?daddr=${destination}&dirflg=w`
              : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=walking`;
            void Linking.openURL(url);
            return;
          }
          setActiveTrackTarget(target);
          setTrackRequest(target);
        }}
        onAbout={({ speciesCode, comName }) => {
          const url = speciesCode.startsWith("inat-")
            ? `https://www.inaturalist.org/taxa/${speciesCode.slice(5)}`
            : speciesCode
            ? `https://ebird.org/species/${speciesCode}`
            : `https://ebird.org/search?q=${encodeURIComponent(comName)}`;
          void Linking.openURL(url);
        }}
        onPopupChange={setPopupOpen}
        onToastChange={setToastOpen}
        onNearbyStateChange={setNearbyState}
        onFollowChange={setFollowPaused}
        onTrackingChange={(open, target) => {
          setTracking(open);
          if (open && target) setActiveTrackTarget(target);
          if (!open) setActiveTrackTarget(undefined);
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
        {topMessage && !popupOpen && (
          <Pressable style={[styles.topMessage, toastOpen && styles.topMessageBelowToast]} onPress={topMessage.onPress}>
            <Text style={styles.topMessageText}>{topMessage.text}</Text>
            <Text style={styles.topMessageDismiss}>×</Text>
          </Pressable>
        )}
        {loading && <ActivityIndicator color="#fff" />}
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
});
