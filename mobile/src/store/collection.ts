import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Coordinates, CaptureRecord, SeenSpecies } from "../types";
import { speciesKey, xpForCapture } from "../utils/progression";

const CAPTURES_KEY = "birdgo.captures";
const SEEN_KEY = "birdgo.seen";
const SEEN_AREA_KEY = "birdgo.seen-area";
const XP_KEY = "birdgo.xp";
const XP_MIGRATION_KEY = "birdgo.xp-migrated-v1";
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

async function readXp(): Promise<number> {
  const raw = await AsyncStorage.getItem(XP_KEY);
  const xp = raw ? Number(raw) : 0;
  return Number.isFinite(xp) ? xp : 0;
}

async function writeXp(xp: number): Promise<void> {
  await AsyncStorage.setItem(XP_KEY, `${Math.max(0, Math.round(xp))}`);
}

function captureKey(capture: CaptureRecord): string {
  return speciesKey(capture.speciesCode, capture.commonName);
}

export async function addCapture(capture: CaptureRecord): Promise<CaptureRecord> {
  const captures = await listCaptures();
  const isNewSpecies = !captures.some((existing) => captureKey(existing) === captureKey(capture));
  const xpAwarded = capture.xpAwarded ?? xpForCapture(capture, isNewSpecies);
  const record = { ...capture, xpAwarded };
  await AsyncStorage.setItem(CAPTURES_KEY, JSON.stringify([record, ...captures]));
  await writeXp(await readXp() + xpAwarded);
  return record;
}

export async function getCollectionXp(): Promise<number> {
  const migrated = await AsyncStorage.getItem(XP_MIGRATION_KEY);
  if (!migrated) {
    const captures = await listCaptures();
    const seenKeys = new Set<string>();
    const migratedXp = captures.reduce((total, capture) => {
      const key = captureKey(capture);
      const isNewSpecies = !seenKeys.has(key);
      seenKeys.add(key);
      return total + (capture.xpAwarded ?? xpForCapture(capture, isNewSpecies));
    }, 0);
    await Promise.all([
      writeXp(Math.max(await readXp(), migratedXp)),
      AsyncStorage.setItem(XP_MIGRATION_KEY, "1"),
    ]);
  }
  return readXp();
}

export function captureMatchesSpecies(
  capture: CaptureRecord,
  speciesCode?: string,
  commonName?: string,
): boolean {
  const normalizedName = commonName?.trim().toLowerCase().replace(/\s+/g, " ");
  if (normalizedName && typeof capture.commonName === "string") {
    return capture.commonName.trim().toLowerCase().replace(/\s+/g, " ") === normalizedName;
  }
  return Boolean(capture.speciesCode && speciesCode && capture.speciesCode === speciesCode);
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
