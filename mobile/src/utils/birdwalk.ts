import type { Coordinates, EbirdObservation } from "../types";
import { distanceKm, observationMarkerId } from "./skyfriends";
import { speciesKeyAliases } from "./progression";

export interface BirdwalkStop extends Coordinates {
  id: string;
  commonName: string;
  speciesCode?: string;
  sciName?: string;
  virtual: boolean;
  capturedCount: number;
  distanceKm: number;
  legDistanceKm?: number;
}

export interface BirdwalkPlan {
  stops: BirdwalkStop[];
  totalDistanceKm: number;
}

export interface BirdwalkState {
  stops: BirdwalkStop[];
  index: number;
  skippedIds?: string[];
}

const MAX_STOP_DISTANCE_KM = 1.2;
const CANDIDATE_LIMIT = 8;
const CORRIDOR_WIDTH_KM = 0.24;

function captureCountFor(bird: EbirdObservation, captureCounts: Record<string, number>): number {
  if (bird.virtual) return 0;
  return Math.max(0, ...speciesKeyAliases(bird.speciesCode, bird.comName, bird.sciName, bird.canonicalKey).map((key) => captureCounts[key] ?? 0));
}

function speciesIdentity(bird: EbirdObservation): string {
  return speciesKeyAliases(bird.speciesCode, bird.comName, bird.sciName, bird.canonicalKey)[0]
    ?? `${bird.virtual ? "virtual" : "real"}:${bird.speciesCode}:${bird.comName ?? "bird"}`.toLowerCase();
}

function priority(stop: BirdwalkStop): number {
  return stop.distanceKm + (stop.capturedCount ? 0.55 : 0) + (stop.virtual ? 0.25 : 0) - (!stop.virtual && !stop.capturedCount ? 0.2 : 0);
}

function anchorPriority(stop: BirdwalkStop): number {
  return stop.distanceKm + (stop.capturedCount ? 0.45 : 0) - (!stop.capturedCount ? 0.25 : 0);
}

function totalDistance(location: Coordinates, stops: BirdwalkStop[]): number {
  let total = 0;
  let previous = location;
  stops.forEach((stop) => {
    total += distanceKm(previous, stop);
    previous = stop;
  });
  return total;
}

function finishPlan(location: Coordinates, stops: BirdwalkStop[]): BirdwalkPlan {
  let previous = location;
  const withLegs = stops.map((stop) => {
    const legDistanceKm = distanceKm(previous, stop);
    previous = stop;
    return { ...stop, legDistanceKm };
  });
  const distance = totalDistance(location, withLegs);
  return {
    stops: withLegs,
    totalDistanceKm: distance,
  };
}

function greedyStops(location: Coordinates, candidates: BirdwalkStop[], maxStops: number): BirdwalkStop[] {
  const pool = candidates.slice(0, CANDIDATE_LIMIT);
  const stops: BirdwalkStop[] = [];
  let currentLocation = location;
  while (pool.length && stops.length < maxStops) {
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    pool.forEach((stop, index) => {
      const distance = distanceKm(currentLocation, stop);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    const [next] = pool.splice(nearestIndex, 1);
    stops.push({ ...next, distanceKm: distanceKm(location, next) });
    currentLocation = next;
  }
  return stops;
}

function corridorIntermediateStops(location: Coordinates, anchor: BirdwalkStop, candidates: BirdwalkStop[], maxIntermediate: number): BirdwalkStop[] {
  const anchorDistance = Math.max(0.001, distanceKm(location, anchor));
  const anchorX = anchor.longitude - location.longitude;
  const anchorY = anchor.latitude - location.latitude;
  const scored = candidates.flatMap((stop) => {
    if (stop.id === anchor.id) return [];
    const x = stop.longitude - location.longitude;
    const y = stop.latitude - location.latitude;
    const rawProjection = (x * anchorX + y * anchorY) / (anchorX * anchorX + anchorY * anchorY);
    const projectionKm = rawProjection * anchorDistance;
    const closestX = rawProjection * anchorX;
    const closestY = rawProjection * anchorY;
    const lateralDegrees = Math.sqrt((x - closestX) ** 2 + (y - closestY) ** 2);
    const approximateKmPerDegree = 111;
    const lateralKm = lateralDegrees * approximateKmPerDegree;
    const veryCloseStart = stop.distanceKm <= 0.08 && rawProjection > -0.15;
    const inCorridor = projectionKm > 0.03 && projectionKm < anchorDistance * 0.9 && lateralKm <= CORRIDOR_WIDTH_KM;
    if (!veryCloseStart && !inCorridor) return [];
    return [{ stop, projectionKm: Math.max(0, projectionKm), priority: priority(stop) }];
  });
  const byId = new Map<string, { stop: BirdwalkStop; projectionKm: number; priority: number }>();
  scored.forEach((entry) => {
    const current = byId.get(entry.stop.id);
    if (!current || entry.priority < current.priority) byId.set(entry.stop.id, entry);
  });
  return [...byId.values()]
    .sort((left, right) => left.projectionKm - right.projectionKm || left.priority - right.priority)
    .slice(0, maxIntermediate)
    .map(({ stop }) => stop);
}

export function buildBirdwalkPlan(location: Coordinates, birds: EbirdObservation[], captureCounts: Record<string, number>, maxStops = 3): BirdwalkPlan {
  const bestBySpecies = new Map<string, BirdwalkStop>();
  birds.forEach((bird) => {
    if (!bird.comName) return;
    const distance = distanceKm(location, bird);
    if (!Number.isFinite(distance) || distance > MAX_STOP_DISTANCE_KM) return;
    const stop: BirdwalkStop = {
      id: observationMarkerId(bird),
      latitude: bird.latitude,
      longitude: bird.longitude,
      commonName: bird.comName,
      speciesCode: bird.speciesCode,
      sciName: bird.sciName,
      virtual: Boolean(bird.virtual),
      capturedCount: captureCountFor(bird, captureCounts),
      distanceKm: distance,
    };
    const key = speciesIdentity(bird);
    const current = bestBySpecies.get(key);
    if (!current || priority(stop) < priority(current)) bestBySpecies.set(key, stop);
  });

  const candidates = [...bestBySpecies.values()].sort((left, right) => priority(left) - priority(right));
  const realAnchor = candidates
    .filter((stop) => !stop.virtual)
    .sort((left, right) => anchorPriority(left) - anchorPriority(right))[0];
  const stops = realAnchor
    ? [...corridorIntermediateStops(location, realAnchor, candidates, maxStops - 1), realAnchor]
    : greedyStops(location, candidates, maxStops);
  return finishPlan(location, stops.slice(0, maxStops));
}

export function xpForBirdwalk(stopCount: number): number {
  return stopCount >= 3 ? 50 : stopCount === 2 ? 40 : 30;
}
