import { useCallback, useEffect, useRef, useState } from "react";
import { fetchNotableBirds, fetchRecentBirds } from "../api";
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
      setBirds([...merged.values()]);
      setNotable([...notableByKey.values()]);
      setLoadedArea({ latitude, longitude });
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
