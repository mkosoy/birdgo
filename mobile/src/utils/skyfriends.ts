import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Coordinates, EbirdObservation } from "../types";

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

export function distanceKm(first: Coordinates, second: Coordinates): number {
  const radians = Math.PI / 180;
  const lat1 = first.latitude * radians;
  const lat2 = second.latitude * radians;
  const a = Math.sin((lat2 - lat1) / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(((second.longitude - first.longitude) * radians) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function destination(origin: Coordinates, bearingDegrees: number, distanceMeters: number): Coordinates {
  const radians = Math.PI / 180;
  const angularDistance = distanceMeters / 6371000;
  const bearing = bearingDegrees * radians;
  const lat1 = origin.latitude * radians;
  const lng1 = origin.longitude * radians;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angularDistance) + Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing));
  const lng2 = lng1 + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
    Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
  );
  return { latitude: lat2 / radians, longitude: ((lng2 / radians + 540) % 360) - 180 };
}

export function observationMarkerId(bird: Pick<EbirdObservation, "speciesCode" | "locId" | "latitude" | "longitude">): string {
  return `${bird.speciesCode}:${bird.locId ?? `${bird.latitude}:${bird.longitude}`}`;
}

export function isPrismaticSkyfriendEncounter(encounterId: string): boolean {
  return hash(`prismatic:${encounterId}`) % 24 === 0;
}

export function skyfriendCellKeyFromEncounterId(encounterId?: string): string | undefined {
  const locId = encounterId?.split(":")[1];
  if (!locId?.startsWith("skyfriend-")) return undefined;
  const parts = locId.split("-");
  if (parts.length < 7) return undefined;
  return `${parts[1]}:${parts[2]}:${parts[3]}-${parts[4]}-${parts[5]}`;
}

const ASSIGNMENTS_KEY = "birdgo.skyfriend-spawn-species-v1";
const FLED_KEY = "birdgo.skyfriend-fled-v1";
const CELL_SIZE_DEGREES = 0.0012;
export const SKYFRIEND_COLLECT_KM = 0.06;

export function skyfriendCellKey(userLocation: Coordinates, now = new Date()): string {
  const gridLat = `${Math.floor((userLocation.latitude + 90) / CELL_SIZE_DEGREES)}`;
  const gridLng = `${Math.floor((userLocation.longitude + 180) / CELL_SIZE_DEGREES)}`;
  return `${gridLat}:${gridLng}:${now.toISOString().slice(0, 10)}`;
}

export function skyfriendCellKeysAround(userLocation: Coordinates, now = new Date()): string[] {
  const day = now.toISOString().slice(0, 10);
  const centerLat = Math.floor((userLocation.latitude + 90) / CELL_SIZE_DEGREES);
  const centerLng = Math.floor((userLocation.longitude + 180) / CELL_SIZE_DEGREES);
  const keys = [`${centerLat}:${centerLng}:${day}`];
  for (const latOffset of [-1, 0, 1]) {
    for (const lngOffset of [-1, 0, 1]) {
      if (!latOffset && !lngOffset) continue;
      keys.push(`${centerLat + latOffset}:${centerLng + lngOffset}:${day}`);
    }
  }
  return keys;
}

async function readAssignments(): Promise<Record<string, string[]>> {
  const raw = await AsyncStorage.getItem(ASSIGNMENTS_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, string[]>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function loadSkyfriendSpecies(cellKey: string): Promise<string[]> {
  return (await readAssignments())[cellKey] ?? [];
}

let assignmentWriteQueue: Promise<void> = Promise.resolve();

export async function saveSkyfriendSpecies(cellKey: string, speciesCodes: string[]): Promise<void> {
  const write = assignmentWriteQueue.then(async () => {
    const assignments = await readAssignments();
    assignments[cellKey] = speciesCodes;
    const entries = Object.entries(assignments).slice(-100);
    await AsyncStorage.setItem(ASSIGNMENTS_KEY, JSON.stringify(Object.fromEntries(entries)));
  });
  assignmentWriteQueue = write.catch(() => undefined);
  return write;
}

export async function loadSkyfriendFled(): Promise<Record<string, number>> {
  const raw = await AsyncStorage.getItem(FLED_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, number>;
    if (!parsed || typeof parsed !== "object") return {};
    const now = Date.now();
    return Object.fromEntries(Object.entries(parsed).filter(([, until]) => typeof until === "number" && until > now));
  } catch {
    return {};
  }
}

export async function markSkyfriendFled(encounterId: string, until: number): Promise<void> {
  const write = assignmentWriteQueue.then(async () => {
    const fled = await loadSkyfriendFled();
    fled[encounterId] = until;
    const entries = Object.entries(fled).slice(-100);
    await AsyncStorage.setItem(FLED_KEY, JSON.stringify(Object.fromEntries(entries)));
  });
  assignmentWriteQueue = write.catch(() => undefined);
  return write;
}

export function buildSkyfriendSpawns(realBirds: EbirdObservation[], userLocation: Coordinates, now = new Date(), preferredSpecies: (string | undefined)[] = [], cellKeyOverride?: string, forceWhenRealNearby = false): EbirdObservation[] {
  const nearbyRealCount = realBirds.filter((bird) => !bird.virtual && distanceKm(bird, userLocation) <= 0.12).length;
  const targetCount = nearbyRealCount && !forceWhenRealNearby ? 0 : 1;
  if (!targetCount) return [];

  const speciesPool = new Map<string, { bird: EbirdObservation; weight: number }>();
  realBirds.forEach((bird) => {
    if (bird.virtual || !bird.comName || !bird.speciesCode) return;
    const current = speciesPool.get(bird.speciesCode);
    speciesPool.set(bird.speciesCode, {
      bird,
      weight: (current?.weight ?? 0) + (bird.isNotable ? 0.45 : 1),
    });
  });
  const pool = [...speciesPool.values()];
  if (!pool.length) return [];

  const cellKey = cellKeyOverride ?? skyfriendCellKey(userLocation, now);
  const [gridLat, gridLng, day] = cellKey.split(":");
  const usedSpecies = new Set<string>();
  const spawns: EbirdObservation[] = [];

  for (let index = 0; index < targetCount && usedSpecies.size < pool.length; index += 1) {
    const seed = `${gridLat}:${gridLng}:${day}:${index}`;
    const preferredCode = preferredSpecies[index];
    const preferred = preferredCode ? pool.find((entry) => entry.bird.speciesCode === preferredCode && !usedSpecies.has(entry.bird.speciesCode)) : undefined;
    const selected = preferred ?? pool
      .filter((entry) => !usedSpecies.has(entry.bird.speciesCode))
      .map((entry) => ({
        entry,
        score: (hash(`${seed}:${entry.bird.speciesCode}`) / 4294967295) * (entry.bird.isNotable
          ? 0.22
          : (entry.bird.abundanceCount ?? 1) >= 25
            ? 1.15
            : (entry.bird.abundanceCount ?? 1) >= 5
              ? 0.9
              : (entry.bird.abundanceCount ?? 1) >= 2
                ? 0.55
                : 0.4),
      }))
      .sort((left, right) => right.score - left.score)[0]?.entry;
    if (!selected) continue;
    usedSpecies.add(selected.bird.speciesCode);
    const bearing = hash(`${seed}:bearing`) % 360;
    const distance = 20 + (hash(`${seed}:distance`) % 65);
    const anchor = {
      latitude: Number(gridLat) * CELL_SIZE_DEGREES - 90 + CELL_SIZE_DEGREES / 2,
      longitude: Number(gridLng) * CELL_SIZE_DEGREES - 180 + CELL_SIZE_DEGREES / 2,
    };
    const coordinates = destination(anchor, bearing, distance);
    const locId = `skyfriend-${gridLat}-${gridLng}-${day}-${selected.bird.speciesCode}-${index}`;
    spawns.push({
      ...selected.bird,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      locId,
      locName: "Skyfriend habitat",
      obsDt: undefined,
      howMany: 1,
      source: "virtual",
      virtual: true,
      prismatic: isPrismaticSkyfriendEncounter(locId),
    });
  }
  return spawns;
}
