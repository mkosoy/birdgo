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

export function buildSkyfriendSpawns(realBirds: EbirdObservation[], userLocation: Coordinates, now = new Date()): EbirdObservation[] {
  const nearbyRealCount = realBirds.filter((bird) => !bird.virtual && distanceKm(bird, userLocation) <= 0.35).length;
  const targetCount = Math.max(0, Math.min(4, 4 - nearbyRealCount));
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

  const cellSize = 0.004;
  const gridLat = `${Math.floor((userLocation.latitude + 90) / cellSize)}`;
  const gridLng = `${Math.floor((userLocation.longitude + 180) / cellSize)}`;
  const day = now.toISOString().slice(0, 10);
  const totalWeight = pool.reduce((total, entry) => total + entry.weight, 0);
  const usedSpecies = new Set<string>();
  const spawns: EbirdObservation[] = [];

  for (let index = 0; index < targetCount && usedSpecies.size < pool.length; index += 1) {
    const seed = `${gridLat}:${gridLng}:${day}:${index}`;
    let ticket = (hash(`${seed}:species`) % 1000) / 1000 * totalWeight;
    let selected = pool[0];
    for (const entry of pool) {
      ticket -= entry.weight;
      if (ticket <= 0) {
        selected = entry;
        break;
      }
    }
    if (usedSpecies.has(selected.bird.speciesCode)) {
      selected = pool.find((entry) => !usedSpecies.has(entry.bird.speciesCode)) ?? selected;
    }
    usedSpecies.add(selected.bird.speciesCode);
    const bearing = hash(`${seed}:bearing`) % 360;
    const distance = 70 + (hash(`${seed}:distance`) % 260);
    const coordinates = destination(userLocation, bearing, distance);
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
    });
  }
  return spawns;
}
