import { useCallback, useEffect, useState } from "react";
import type { CaptureRecord, SeenSpecies } from "../types";
import { addCapture, listCaptures, listSeenSpecies, markSeenSpecies } from "../store/collection";

export function useCollection() {
  const [captures, setCaptures] = useState<CaptureRecord[]>([]);
  const [seenSpecies, setSeenSpecies] = useState<SeenSpecies[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [nextCaptures, nextSeen] = await Promise.all([listCaptures(), listSeenSpecies()]);
      setCaptures(nextCaptures);
      setSeenSpecies(nextSeen);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  const saveCapture = useCallback(async (capture: CaptureRecord) => {
    await addCapture(capture);
    await refresh();
  }, [refresh]);
  const saveSeen = useCallback(async (species: SeenSpecies[]) => {
    await markSeenSpecies(species);
    setSeenSpecies(await listSeenSpecies());
  }, []);
  return { captures, seenSpecies, loading, saveCapture, saveSeen, refresh };
}
