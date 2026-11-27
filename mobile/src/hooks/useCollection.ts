import { useCallback, useEffect, useState } from "react";
import type { Coordinates, CaptureRecord, SeenSpecies, SkyfriendRecord } from "../types";
import type { SpeciesCountGroup } from "../utils/progression";
import { addCapture, addSkyfriend, claimQuestXp, getCollectionXp, listCaptures, listQuestRewardIds, listSeenSpecies, listSkyfriends, listSpeciesCaptureCounts, markSeenSpecies } from "../store/collection";

export function useCollection() {
  const [captures, setCaptures] = useState<CaptureRecord[]>([]);
  const [seenSpecies, setSeenSpecies] = useState<SeenSpecies[]>([]);
  const [xp, setXp] = useState(0);
  const [skyfriends, setSkyfriends] = useState<SkyfriendRecord[]>([]);
  const [questRewards, setQuestRewards] = useState<string[]>([]);
  const [speciesCaptureCounts, setSpeciesCaptureCounts] = useState<SpeciesCountGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [nextCaptures, nextSeen, nextXp, nextSkyfriends, nextQuestRewards, nextSpeciesCaptureCounts] = await Promise.all([listCaptures(), listSeenSpecies(), getCollectionXp(), listSkyfriends(), listQuestRewardIds(), listSpeciesCaptureCounts()]);
      setCaptures(nextCaptures);
      setSeenSpecies(nextSeen);
      setXp(nextXp);
      setSkyfriends(nextSkyfriends);
      setQuestRewards(nextQuestRewards);
      setSpeciesCaptureCounts(nextSpeciesCaptureCounts);
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
  const claimQuest = useCallback(async (questId: string, xpReward: number) => {
    const claimed = await claimQuestXp(questId, xpReward);
    if (claimed) await refresh();
    return claimed;
  }, [refresh]);
  return { captures, seenSpecies, skyfriends, xp, questRewards, speciesCaptureCounts, loading, saveCapture, saveSkyfriend, saveSeen, claimQuest, refresh };
}
