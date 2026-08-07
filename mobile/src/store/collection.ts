import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Coordinates, CaptureRecord, SeenSpecies } from "../types";

const CAPTURES_KEY = "birdgo.captures";
const SEEN_KEY = "birdgo.seen";
const SEEN_AREA_KEY = "birdgo.seen-area";
const SEEN_SCOPE_KM = 25;

function distanceKm(first: Coordinates, second: Coordinates): number {
  const radians = Math.PI / 180;
  const lat1 = first.latitude * radians;
  const lat2 = second.latitude * radians;
  const dLat = lat2 - lat1;
  const dLon = (second.longitude - first.longitude) * radians;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function listCaptures(): Promise<CaptureRecord[]> {
  const raw = await AsyncStorage.getItem(CAPTURES_KEY);
  return raw ? (JSON.parse(raw) as CaptureRecord[]) : [];
}

export async function addCapture(capture: CaptureRecord): Promise<void> {
  const captures = await listCaptures();
  await AsyncStorage.setItem(CAPTURES_KEY, JSON.stringify([capture, ...captures]));
}

export function captureMatchesSpecies(
  capture: CaptureRecord,
  speciesCode?: string,
  commonName?: string,
): boolean {
  const normalizedName = commonName?.trim().toLowerCase();
  const matchesCode = Boolean(speciesCode && capture.speciesCode === speciesCode);
  const matchesName = Boolean(
    normalizedName
    && capture.commonName.trim().toLowerCase() === normalizedName,
  );
  return matchesCode || matchesName;
}

export async function releaseSpecies(speciesCode?: string, commonName?: string): Promise<void> {
  const captures = await listCaptures();
  const remaining = captures.filter((capture) => !captureMatchesSpecies(capture, speciesCode, commonName));
  await AsyncStorage.setItem(CAPTURES_KEY, JSON.stringify(remaining));
}

export async function listSeenSpecies(): Promise<SeenSpecies[]> {
  const raw = await AsyncStorage.getItem(SEEN_KEY);
  return raw ? (JSON.parse(raw) as SeenSpecies[]) : [];
}

export async function markSeenSpecies(species: SeenSpecies[], area: Coordinates): Promise<void> {
  const existing = await listSeenSpecies();
  const previousAreaRaw = await AsyncStorage.getItem(SEEN_AREA_KEY);
  const previousArea = previousAreaRaw ? JSON.parse(previousAreaRaw) as Coordinates : undefined;
  const areaChanged = !previousArea || distanceKm(previousArea, area) > SEEN_SCOPE_KM;
  const retained = existing.filter((item) =>
    !areaChanged
    && item.location
    && distanceKm(item.location, area) <= SEEN_SCOPE_KM
  );
  const current = new Map(retained.map((item) => [item.speciesCode, item]));
  species.forEach((item) => current.set(item.speciesCode, { ...item, location: area }));
  await Promise.all([
    AsyncStorage.setItem(SEEN_KEY, JSON.stringify([...current.values()])),
    AsyncStorage.setItem(SEEN_AREA_KEY, JSON.stringify(area)),
  ]);
}
