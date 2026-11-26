import { useCallback, useEffect, useState } from "react";
import type { TrainerProfile } from "../types";
import { defaultTrainerProfile, loadTrainerProfile, saveTrainerProfile } from "../store/trainer";

export function useTrainerProfile() {
  const [trainer, setTrainer] = useState<TrainerProfile>(defaultTrainerProfile);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setTrainer(await loadTrainerProfile());
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const saveTrainer = useCallback(async (profile: TrainerProfile) => {
    const saved = await saveTrainerProfile(profile);
    setTrainer(saved);
    return saved;
  }, []);

  return { trainer, loading, saveTrainer, refresh };
}
