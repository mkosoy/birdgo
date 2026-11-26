import { useCallback, useEffect, useRef, useState } from "react";
import { canonicalizeSpecies, fetchBirdAbundance, fetchNotableBirds, fetchRecentBirds } from "../api";
import type { BirdAbundance, Coordinates, EbirdObservation } from "../types";


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
    try {
      const [recent, rare, abundance] = await Promise.all([
        fetchRecentBirds(latitude, longitude),
        fetchNotableBirds(latitude, longitude),
        fetchBirdAbundance(latitude, longitude).catch(() => null),
      ]);
      const merged = new Map(recent.map((bird) => [`${bird.speciesCode}:${bird.locId ?? `${bird.latitude}:${bird.longitude}`}`, bird]));
      for (const bird of rare) {
        const key = `${bird.speciesCode}:${bird.locId ?? `${bird.latitude}:${bird.longitude}`}`;
        merged.set(key, { ...merged.get(key), ...bird, isNotable: true });
      }
      if (currentRequest !== requestId.current) return;
      const notableByKey = new Map(rare.map((bird) => [`${bird.speciesCode}:${bird.locId ?? `${bird.latitude}:${bird.longitude}`}`, bird]));
      const mergedBirds = [...merged.values()];
      const annotatePrevalence = buildPrevalenceAnnotator(mergedBirds, abundance);
      const notableBirds = [...notableByKey.values()].map(annotatePrevalence);
      const frequencyMergedBirds = mergedBirds.map(annotatePrevalence);
      setBirds(frequencyMergedBirds);
      setNotable(notableBirds);
      setLoadedArea({ latitude, longitude });
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
        setBirds(canonicalMergedBirds.map(annotateCanonicalPrevalence));
        setNotable(canonicalNotableBirds.map(annotateCanonicalPrevalence));
      })().catch(() => undefined);
    } catch (cause) {
      if (currentRequest !== requestId.current) return;
      setError(cause instanceof Error ? cause.message : "Could not load nearby birds");
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [latitude, longitude]);
  useEffect(() => { void refresh(); }, [refresh]);
  return { birds, notable, loading, error, loadedArea, refresh };
}
