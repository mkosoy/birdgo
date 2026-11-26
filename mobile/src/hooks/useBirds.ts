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
      const notableBirds = [...notableByKey.values()];
      setBirds(mergedBirds);
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
        setBirds(mergedBirds.map(annotate));
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
