import type { Coordinates, EbirdObservation } from "../types";
import { observationTimeMs } from "./observationTime";
import { RARITY_ORDER, rarityForSpecies } from "./progression";
import { distanceKm } from "./skyfriends";

export interface FreshHotspot {
  key: string;
  name: string;
  latitude: number;
  longitude: number;
  speciesCount: number;
  rareSpeciesCount: number;
  freshestAgeHours: number;
  distanceKm: number;
  representative: EbirdObservation;
  score: number;
}

interface HotspotGroup {
  key: string;
  name: string;
  latitude: number;
  longitude: number;
  species: Map<string, EbirdObservation>;
}

function speciesBinomial(bird: EbirdObservation): string {
  const scientific = bird.sciName?.trim().toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean).slice(0, 2).join(" ");
  if (scientific) return scientific;
  return (bird.comName ?? bird.speciesCode).trim().toLowerCase().replace(/\s+/g, " ");
}

function birdAgeHours(bird: EbirdObservation, now: number): number {
  const observedAt = observationTimeMs(bird.obsDt, bird.longitude, bird.latitude);
  return observedAt == null ? 72 : (now - observedAt) / 3_600_000;
}

function leadScore(bird: EbirdObservation, reference: Coordinates, now: number): number {
  const rarityRank = RARITY_ORDER.indexOf(rarityForSpecies(bird.speciesCode, bird.comName, Boolean(bird.isNotable), bird.sciName, bird.canonicalKey, bird.frequency, bird.abundanceCount));
  return rarityRank * 100 - birdAgeHours(bird, now) * 3 - distanceKm(reference, bird) * 2 - (bird.obsValid === false ? 50 : 0);
}

function groupKey(bird: EbirdObservation): string {
  return bird.locId ?? `${bird.latitude.toFixed(3)}:${bird.longitude.toFixed(3)}`;
}

export function findFreshHotspots(birds: EbirdObservation[], reference: Coordinates, now = Date.now()): FreshHotspot[] {
  const groups = new Map<string, HotspotGroup>();
  for (const bird of birds) {
    if (bird.virtual || bird.source === "birdweather" || bird.locationPrivate || !bird.locId || !bird.comName || !bird.locName?.trim()) continue;
    if (!Number.isFinite(bird.latitude) || !Number.isFinite(bird.longitude)) continue;
    const ageHours = birdAgeHours(bird, now);
    if (!Number.isFinite(ageHours) || ageHours < -2 || ageHours > 48 || distanceKm(reference, bird) > 5) continue;
    const key = groupKey(bird);
    let group = groups.get(key);
    if (!group) {
      group = { key, name: bird.locName.trim(), latitude: bird.latitude, longitude: bird.longitude, species: new Map() };
      groups.set(key, group);
    }
    const speciesKey = speciesBinomial(bird);
    const existing = group.species.get(speciesKey);
    if (!existing || leadScore(bird, reference, now) > leadScore(existing, reference, now)) group.species.set(speciesKey, bird);
  }

  return [...groups.values()].flatMap((group) => {
    const species = [...group.species.values()];
    if (species.length < 3) return [];
    const rareSpeciesCount = species.filter((bird) => RARITY_ORDER.indexOf(rarityForSpecies(bird.speciesCode, bird.comName, Boolean(bird.isNotable), bird.sciName, bird.canonicalKey, bird.frequency, bird.abundanceCount)) >= RARITY_ORDER.indexOf("rare")).length;
    const representative = species.sort((left, right) => leadScore(right, reference, now) - leadScore(left, reference, now))[0];
    const freshestAgeHours = Math.min(...species.map((bird) => birdAgeHours(bird, now)));
    const distance = distanceKm(reference, group);
    const freshnessScore = Math.max(0, 48 - freshestAgeHours) * 0.5;
    const score = species.length * 12 + rareSpeciesCount * 25 + freshnessScore - distance * 15;
    return [{
      key: group.key,
      name: group.name,
      latitude: group.latitude,
      longitude: group.longitude,
      speciesCount: species.length,
      rareSpeciesCount,
      freshestAgeHours,
      distanceKm: distance,
      representative,
      score,
    }];
  }).sort((left, right) => right.score - left.score);
}
