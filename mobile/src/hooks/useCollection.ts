import { useCallback, useEffect, useState } from "react";
import type { Coordinates, CaptureRecord, SeenSpecies } from "../types";
import { addCapture, getCollectionXp, listCaptures, listSeenSpecies, markSeenSpecies } from "../store/collection";

export function useCollection() {
  const [captures, setCaptures] = useState<CaptureRecord[]>([]);
  const [seenSpecies, setSeenSpecies] = useState<SeenSpecies[]>([]);
  const [xp, setXp] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [nextCaptures, nextSeen, nextXp] = await Promise.all([listCaptures(), listSeenSpecies(), getCollectionXp()]);
      setCaptures(nextCaptures);
      setSeenSpecies(nextSeen);
      setXp(nextXp);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  const saveCapture = useCallback(async (capture: CaptureRecord) => {
    const record = await addCapture(capture);
    await refresh();
    return record;
  }, [refresh]);
  const saveSeen = useCallback(async (species: SeenSpecies[], area: Coordinates) => {
    await markSeenSpecies(species, area);
    setSeenSpecies(await listSeenSpecies());
  }, []);
  return { captures, seenSpecies, xp, loading, saveCapture, saveSeen, refresh };
}
