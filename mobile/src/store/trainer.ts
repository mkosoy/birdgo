import AsyncStorage from "@react-native-async-storage/async-storage";
import type { TrainerAccessory, TrainerProfile } from "../types";
import { notifyCollectionChanged } from "../utils/collectionEvents";

const TRAINER_KEY = "birdgo.trainer-profile-v1";
const validColors = new Set(["#2f8ee8", "#2f7d5b", "#7d64f2", "#d97941", "#c94f7c", "#263d78"]);
const validAccentColors = new Set(["#ffffff", "#ffd766", "#72e7ff", "#65d184", "#f0a6c1", "#d7ccff"]);
const validAccessories = new Set<TrainerAccessory>(["none", "cap", "visor", "hood"]);

export const defaultTrainerProfile: TrainerProfile = {
  name: "Trainer",
  avatarColor: "#2f8ee8",
  accentColor: "#ffffff",
  accessory: "cap",
};

export function sanitizeTrainerProfile(value?: Partial<TrainerProfile>): TrainerProfile {
  return {
    name: typeof value?.name === "string" && value.name.trim() ? value.name.trim().slice(0, 24) : defaultTrainerProfile.name,
    avatarColor: validColors.has(value?.avatarColor ?? "") ? value?.avatarColor as string : defaultTrainerProfile.avatarColor,
    accentColor: validAccentColors.has(value?.accentColor ?? "") ? value?.accentColor as string : defaultTrainerProfile.accentColor,
    accessory: validAccessories.has(value?.accessory as TrainerAccessory) ? value?.accessory as TrainerAccessory : defaultTrainerProfile.accessory,
  };
}

export async function loadTrainerProfile(): Promise<TrainerProfile> {
  const raw = await AsyncStorage.getItem(TRAINER_KEY);
  if (!raw) return defaultTrainerProfile;
  try {
    return sanitizeTrainerProfile(JSON.parse(raw) as Partial<TrainerProfile>);
  } catch {
    return defaultTrainerProfile;
  }
}

export async function saveTrainerProfile(profile: TrainerProfile): Promise<TrainerProfile> {
  const clean = sanitizeTrainerProfile(profile);
  await AsyncStorage.setItem(TRAINER_KEY, JSON.stringify(clean));
  notifyCollectionChanged();
  return clean;
}
