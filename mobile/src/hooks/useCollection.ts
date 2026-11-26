import { useCallback, useEffect, useState } from "react";
import type { Coordinates, CaptureRecord, SeenSpecies, SkyfriendRecord } from "../types";
import { addCapture, addSkyfriend, getCollectionXp, listCaptures, listSeenSpecies, listSkyfriends, markSeenSpecies } from "../store/collection";

export function useCollection() {
  const [captures, setCaptures] = useState<CaptureRecord[]>([]);
  const [seenSpecies, setSeenSpecies] = useState<SeenSpecies[]>([]);
  const [xp, setXp] = useState(0);
  const [skyfriends, setSkyfriends] = useState<SkyfriendRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [nextCaptures, nextSeen, nextXp, nextSkyfriends] = await Promise.all([listCaptures(), listSeenSpecies(), getCollectionXp(), listSkyfriends()]);
      setCaptures(nextCaptures);
      setSeenSpecies(nextSeen);
      setXp(nextXp);
      setSkyfriends(nextSkyfriends);
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
  const saveSkyfriend = useCallback(async (record: SkyfriendRecord) => {
    const saved = await addSkyfriend(record);
    await refresh();
    return saved;
  }, [refresh]);
  const saveSeen = useCallback(async (species: SeenSpecies[], area: Coordinates) => {
    await markSeenSpecies(species, area);
    setSeenSpecies(await listSeenSpecies());
  }, []);
  return { captures, seenSpecies, skyfriends, xp, loading, saveCapture, saveSkyfriend, saveSeen, refresh };
}
