import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import { canonicalizeSpecies, fetchBirdAbundance, fetchNotableBirds, fetchRecentBirds } from "../api";
import type { BirdAbundance, Coordinates, EbirdObservation } from "../types";
import { rarityForSpecies } from "../utils/progression";
import { observationTimeMs } from "../utils/observationTime";


const BIRD_CACHE_KEY = "birdgo.nearby-birds-cache-v1";
const BIRD_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const BIRD_CACHE_MAX_DISTANCE_KM = 25;
const BIRD_CACHE_MAX_AREAS = 8;

interface BirdCachePayload {
  savedAt: number;
  area: Coordinates;
  birds: EbirdObservation[];
  notable: EbirdObservation[];
}

function distanceKm(first: Coordinates, second: Coordinates): number {
  const radians = Math.PI / 180;
  const lat1 = first.latitude * radians;
  const lat2 = second.latitude * radians;
  const a = Math.sin((lat2 - lat1) / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(((second.longitude - first.longitude) * radians) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function cacheAreaKey(area: Coordinates): string {
  return `${Math.round(area.latitude * 10) / 10}:${Math.round(area.longitude * 10) / 10}`;
}

function validCachePayload(value: unknown): value is BirdCachePayload {
  const candidate = value as BirdCachePayload | undefined;
  return Boolean(
    candidate
    && Array.isArray(candidate.birds)
    && Array.isArray(candidate.notable)
    && Number.isFinite(candidate.savedAt)
    && Number.isFinite(candidate.area?.latitude)
    && Number.isFinite(candidate.area?.longitude)
  );
}

async function readBirdCacheEntries(): Promise<BirdCachePayload[]> {
  const raw = await AsyncStorage.getItem(BIRD_CACHE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { entries?: unknown } | BirdCachePayload;
    const entries = Array.isArray((parsed as { entries?: unknown }).entries)
      ? (parsed as { entries: unknown[] }).entries
      : validCachePayload(parsed) ? [parsed] : [];
    return entries.filter(validCachePayload);
  } catch {
    return [];
  }
}

async function writeBirdCacheEntries(entries: BirdCachePayload[]): Promise<void> {
  if (!entries.length) {
    await AsyncStorage.removeItem(BIRD_CACHE_KEY).catch(() => undefined);
    return;
  }
  await AsyncStorage.setItem(BIRD_CACHE_KEY, JSON.stringify({ entries: entries.slice(0, BIRD_CACHE_MAX_AREAS) })).catch(() => undefined);
}

async function readBirdCache(latitude: number, longitude: number): Promise<BirdCachePayload | undefined> {
  try {
    const target = { latitude, longitude };
    const now = Date.now();
    return (await readBirdCacheEntries())
      .filter((entry) => now - entry.savedAt <= BIRD_CACHE_MAX_AGE_MS && distanceKm(target, entry.area) <= BIRD_CACHE_MAX_DISTANCE_KM)
      .sort((left, right) => distanceKm(target, left.area) - distanceKm(target, right.area))[0];
  } catch {
    return undefined;
  }
}

async function writeBirdCache(area: Coordinates, birds: EbirdObservation[], notable: EbirdObservation[]): Promise<void> {
  const entries = await readBirdCacheEntries().catch(() => [] as BirdCachePayload[]);
  const key = cacheAreaKey(area);
  const remaining = entries.filter((entry) => cacheAreaKey(entry.area) !== key);
  const payload: BirdCachePayload = { savedAt: Date.now(), area, birds: birds.slice(0, 250), notable: notable.slice(0, 50) };
  await writeBirdCacheEntries([payload, ...remaining]);
}

function normalizedIdentity(value?: string | null): string {
  return value?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
}

function speciesLevelName(value?: string | null): string {
  const normalized = normalizedIdentity(value);
  const parts = normalized.split(" ").filter(Boolean);
  if (parts.includes("x") || parts.includes("×")) return normalized;
  return parts.length >= 2 ? parts.slice(0, 2).join(" ") : normalized;
}

function prevalenceKey(bird: EbirdObservation): string {
  return speciesLevelName(bird.sourceSciName ?? bird.sciName) || normalizedIdentity(bird.canonicalKey) || bird.speciesCode.trim().toLowerCase();
}

function buildPrevalenceAnnotator(allBirds: EbirdObservation[], abundance: BirdAbundance[] | null = null): (bird: EbirdObservation) => EbirdObservation {
  const reportsBySpecies = new Map<string, number>();
  const individualsBySpecies = new Map<string, number>();
  const countedSightings = new Set<string>();
  const abundanceBySpecies = new Map<string, number>();
  (abundance ?? []).forEach((entry) => {
    const key = speciesLevelName(entry.scientificName);
    abundanceBySpecies.set(key, (abundanceBySpecies.get(key) ?? 0) + entry.count);
  });
  allBirds.forEach((bird) => {
    const key = prevalenceKey(bird);
    const locationKey = `${bird.latitude.toFixed(4)}:${bird.longitude.toFixed(4)}`;
    const sightingKey = `${key}:${locationKey}`;
    if (countedSightings.has(sightingKey)) return;
    countedSightings.add(sightingKey);
    reportsBySpecies.set(key, (reportsBySpecies.get(key) ?? 0) + 1);
    individualsBySpecies.set(key, (individualsBySpecies.get(key) ?? 0) + Math.max(1, bird.howMany ?? 1));
  });
  return (bird) => {
    const key = prevalenceKey(bird);
    const reportCount = reportsBySpecies.get(key) ?? 1;
    const individuals = individualsBySpecies.get(key) ?? 1;
    return {
      ...bird,
      frequency: reportCount * 2 + Math.log10(individuals + 1) * 2,
      reportCount,
      ...(abundance ? { abundanceCount: abundanceBySpecies.get(key) ?? 0 } : {}),
    };
  };
}

function annotateComputedRarity(bird: EbirdObservation): EbirdObservation {
  return {
    ...bird,
    rarity: rarityForSpecies(bird.speciesCode, bird.comName, Boolean(bird.isNotable), bird.sciName, bird.canonicalKey, bird.frequency, bird.abundanceCount),
  };
}

export function useBirds(latitude: number, longitude: number) {
  const [birds, setBirds] = useState<EbirdObservation[]>([]);
  const [notable, setNotable] = useState<EbirdObservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedArea, setLoadedArea] = useState<Coordinates | null>(null);
  const requestId = useRef(0);
  const refresh = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(null);
    const cached = await readBirdCache(latitude, longitude);
    if (currentRequest === requestId.current) {
      setBirds(cached?.birds ?? []);
      setNotable(cached?.notable ?? []);
      setLoadedArea(cached?.area ?? null);
    }
    try {
      const [recent, rare, abundance] = await Promise.all([
        fetchRecentBirds(latitude, longitude),
        fetchNotableBirds(latitude, longitude),
        fetchBirdAbundance(latitude, longitude).catch(() => null),
      ]);
      const merged = new Map(recent.map((bird) => [`${bird.speciesCode}:${bird.locId ?? `${bird.latitude}:${bird.longitude}`}`, bird]));
      const now = Date.now();
      const freshRare = rare.filter((bird) => {
        if (!bird.obsDt) return true;
        const observedAt = observationTimeMs(bird.obsDt, bird.longitude);
        const ageHours = observedAt == null ? Number.POSITIVE_INFINITY : (now - observedAt) / 3_600_000;
        return Number.isFinite(ageHours) && ageHours <= 72;
      });
      for (const bird of freshRare) {
        const key = `${bird.speciesCode}:${bird.locId ?? `${bird.latitude}:${bird.longitude}`}`;
        merged.set(key, { ...merged.get(key), ...bird, isNotable: true });
      }
      if (currentRequest !== requestId.current) return;
      const notableByKey = new Map(rare.map((bird) => [`${bird.speciesCode}:${bird.locId ?? `${bird.latitude}:${bird.longitude}`}`, bird]));
      const mergedBirds = [...merged.values()];
      const annotatePrevalence = buildPrevalenceAnnotator(mergedBirds, abundance);
      const notableBirds = [...notableByKey.values()].map(annotatePrevalence).map(annotateComputedRarity);
      const frequencyMergedBirds = mergedBirds.map(annotatePrevalence).map(annotateComputedRarity);
      setBirds(frequencyMergedBirds);
      setNotable(notableBirds);
      setLoadedArea({ latitude, longitude });
      void writeBirdCache({ latitude, longitude }, frequencyMergedBirds, notableBirds);
      void (async () => {
        const unique = new Map<string, EbirdObservation>();
        mergedBirds.forEach((bird) => {
          if (!unique.has(bird.speciesCode)) unique.set(bird.speciesCode, bird);
        });
        const inputs = [...unique.values()];
        const canonical = await canonicalizeSpecies(inputs.map((bird) => ({
          speciesCode: bird.speciesCode,
          comName: bird.comName,
          sciName: bird.sciName,
        })));
        if (currentRequest !== requestId.current) return;
        const bySpeciesCode = new Map(inputs.map((bird, index) => [bird.speciesCode, canonical[index]]));
        const canonicalByScientific = new Map<string, string>();
        inputs.forEach((bird, index) => {
          const identity = canonical[index];
          if (!identity?.canonicalKey) return;
          [bird.sciName, identity.canonicalSciName].forEach((name) => {
            const normalized = normalizedIdentity(name);
            if (normalized && !canonicalByScientific.has(normalized)) canonicalByScientific.set(normalized, identity.canonicalKey ?? "");
          });
        });
        const annotate = (bird: EbirdObservation): EbirdObservation => {
          const identity = bySpeciesCode.get(bird.speciesCode);
          return {
            ...bird,
            sciName: identity?.canonicalSciName ?? bird.sciName,
            sourceSciName: bird.sourceSciName ?? bird.sciName,
            canonicalKey: identity?.canonicalKey ?? canonicalByScientific.get(normalizedIdentity(bird.sciName)),
          };
        };
        const canonicalMergedBirds = frequencyMergedBirds.map(annotate);
        const canonicalNotableBirds = notableBirds.map(annotate);
        const annotateCanonicalPrevalence = buildPrevalenceAnnotator(canonicalMergedBirds, abundance);
        const finalBirds = canonicalMergedBirds.map(annotateCanonicalPrevalence).map(annotateComputedRarity);
        const finalNotableBirds = canonicalNotableBirds.map(annotateCanonicalPrevalence).map(annotateComputedRarity);
        setBirds(finalBirds);
        setNotable(finalNotableBirds);
        void writeBirdCache({ latitude, longitude }, finalBirds, finalNotableBirds);
      })().catch(() => undefined);
    } catch (cause) {
      if (currentRequest !== requestId.current) return;
      if (cached?.birds.length || cached?.notable.length) {
        setBirds(cached.birds);
        setNotable(cached.notable);
        setLoadedArea(cached.area);
        setError("Offline — showing your last nearby birds. Tap to retry.");
      } else {
        setError("Couldn’t load birds. Tap to retry.");
      }
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [latitude, longitude]);
  useEffect(() => { void refresh(); }, [refresh]);
  return { birds, notable, loading, error, loadedArea, refresh };
}
