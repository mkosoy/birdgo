import { useCallback, useEffect, useRef, useState } from "react";
import { canonicalizeSpecies, fetchNotableBirds, fetchRecentBirds } from "../api";
import type { Coordinates, EbirdObservation } from "../types";

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
      const [recent, rare] = await Promise.all([
        fetchRecentBirds(latitude, longitude),
        fetchNotableBirds(latitude, longitude),
      ]);
      const merged = new Map(recent.map((bird) => [`${bird.speciesCode}:${bird.locId ?? `${bird.latitude}:${bird.longitude}`}`, bird]));
      for (const bird of rare) {
        const key = `${bird.speciesCode}:${bird.locId ?? `${bird.latitude}:${bird.longitude}`}`;
        merged.set(key, { ...merged.get(key), ...bird, isNotable: true });
      }
      if (currentRequest !== requestId.current) return;
      const notableByKey = new Map(rare.map((bird) => [`${bird.speciesCode}:${bird.locId ?? `${bird.latitude}:${bird.longitude}`}`, bird]));
      const mergedBirds = [...merged.values()];
      const reportsBySpecies = new Map<string, number>();
      const individualsBySpecies = new Map<string, number>();
      mergedBirds.forEach((bird) => {
        reportsBySpecies.set(bird.speciesCode, (reportsBySpecies.get(bird.speciesCode) ?? 0) + 1);
        individualsBySpecies.set(bird.speciesCode, (individualsBySpecies.get(bird.speciesCode) ?? 0) + Math.max(1, bird.howMany ?? 1));
      });
      const withFrequency = (bird: EbirdObservation): EbirdObservation => {
        const reportCount = reportsBySpecies.get(bird.speciesCode) ?? 1;
        const individuals = individualsBySpecies.get(bird.speciesCode) ?? 1;
        return {
          ...bird,
          frequency: reportCount * 2 + Math.log10(individuals + 1) * 2,
          reportCount,
        };
      };
      const notableBirds = [...notableByKey.values()].map(withFrequency);
      const frequencyMergedBirds = mergedBirds.map(withFrequency);
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
        const annotate = (bird: EbirdObservation): EbirdObservation => {
          const identity = bySpeciesCode.get(bird.speciesCode);
          return {
            ...bird,
            sciName: identity?.canonicalSciName ?? bird.sciName,
            canonicalKey: identity?.canonicalKey,
          };
        };
        setBirds(frequencyMergedBirds.map(annotate));
        setNotable(notableBirds.map(annotate));
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
