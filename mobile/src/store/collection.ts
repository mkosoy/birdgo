import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CaptureRecord, SeenSpecies } from "../types";

const CAPTURES_KEY = "birdgo.captures";
const SEEN_KEY = "birdgo.seen";

export async function listCaptures(): Promise<CaptureRecord[]> {
  const raw = await AsyncStorage.getItem(CAPTURES_KEY);
  return raw ? (JSON.parse(raw) as CaptureRecord[]) : [];
}

export async function addCapture(capture: CaptureRecord): Promise<void> {
  const captures = await listCaptures();
  await AsyncStorage.setItem(CAPTURES_KEY, JSON.stringify([capture, ...captures]));
}

export async function listSeenSpecies(): Promise<SeenSpecies[]> {
  const raw = await AsyncStorage.getItem(SEEN_KEY);
  return raw ? (JSON.parse(raw) as SeenSpecies[]) : [];
}

export async function markSeenSpecies(species: SeenSpecies[]): Promise<void> {
  const current = new Map(species.map((item) => [item.speciesCode, item]));
  await AsyncStorage.setItem(SEEN_KEY, JSON.stringify([...current.values()]));
}
