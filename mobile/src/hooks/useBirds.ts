import { useCallback, useEffect, useState } from "react";
import { fetchNotableBirds, fetchRecentBirds } from "../api";
import type { EbirdObservation } from "../types";

export function useBirds(latitude: number, longitude: number) {
  const [birds, setBirds] = useState<EbirdObservation[]>([]);
  const [notable, setNotable] = useState<EbirdObservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [recent, rare] = await Promise.all([
        fetchRecentBirds(latitude, longitude),
        fetchNotableBirds(latitude, longitude),
      ]);
      const dedupe = new Map(recent.map((bird) => [`${bird.speciesCode}:${bird.locId ?? ""}`, bird]));
      setBirds([...dedupe.values()]);
      setNotable(rare);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load nearby birds");
    } finally {
      setLoading(false);
    }
  }, [latitude, longitude]);
  useEffect(() => { void refresh(); }, [refresh]);
  return { birds, notable, loading, error, refresh };
}
