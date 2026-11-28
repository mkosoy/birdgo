import { API_BASE_URL } from "./config";
import type { BirdAbundance, CanonicalSpeciesResult, EbirdObservation, IdentificationResult, SpeciesGuide } from "./types";

interface RawEbirdObservation {
  lat?: number;
  lng?: number;
  comName?: string;
  sciName?: string;
  speciesCode: string;
  locId?: string;
  locName?: string;
  obsDt?: string;
  obsValid?: boolean;
  obsReviewed?: boolean;
  locationPrivate?: boolean;
  howMany?: number;
  imageUrl?: string;
  audioUrl?: string;
  audioStartTime?: number;
  audioEndTime?: number;
  evidenceCount?: number;
  source?: string;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
  return body;
}

export function fetchRecentBirds(latitude: number, longitude: number): Promise<EbirdObservation[]> {
  return request<RawEbirdObservation[]>(`/api/birds/recent?lat=${latitude}&lng=${longitude}&dist=15&back=2`)
    .then((observations) => observations.flatMap((observation) => mapObservation(observation)));
}

export function fetchBirdAbundance(latitude: number, longitude: number): Promise<BirdAbundance[]> {
  return request<BirdAbundance[]>(`/api/birds/abundance?lat=${latitude}&lng=${longitude}&dist=15`);
}

export function fetchNotableBirds(latitude: number, longitude: number): Promise<EbirdObservation[]> {
  return request<RawEbirdObservation[]>(`/api/birds/notable?lat=${latitude}&lng=${longitude}&dist=25&detail=simple`)
    .then((observations) => observations.flatMap((observation) => mapObservation(observation, true)));
}

function mapObservation(raw: RawEbirdObservation, isNotable = false): EbirdObservation[] {
  if (typeof raw.lat !== "number" || typeof raw.lng !== "number") return [];
  return [{
    latitude: raw.lat,
    longitude: raw.lng,
    speciesCode: raw.speciesCode,
    comName: raw.comName,
    sciName: raw.sciName,
    locId: raw.locId,
    locName: raw.locName,
    obsDt: raw.obsDt,
    obsValid: raw.obsValid,
    obsReviewed: raw.obsReviewed,
    locationPrivate: raw.locationPrivate,
    howMany: raw.howMany,
    imageUrl: raw.imageUrl,
    audioUrl: raw.audioUrl,
    audioStartTime: raw.audioStartTime,
    audioEndTime: raw.audioEndTime,
    evidenceCount: raw.evidenceCount,
    source: raw.source,
    ...(isNotable ? { isNotable: true } : {}),
  }];
}

export function identifyBird(imageBase64: string, hints: string[]): Promise<IdentificationResult> {
  return request("/api/identify", {
    method: "POST",
    body: JSON.stringify({ imageBase64, hints }),
  });
}

export function canonicalizeSpecies(items: Array<{ speciesCode?: string; comName?: string; commonName?: string; sciName?: string | null }>): Promise<CanonicalSpeciesResult[]> {
  return request("/api/species/canonical", {
    method: "POST",
    body: JSON.stringify({ items }),
  });
}

export function fetchSpeciesGuide(input: { sciName?: string | null; commonName?: string | null }): Promise<SpeciesGuide> {
  const params = new URLSearchParams();
  if (input.sciName?.trim()) params.set("sciName", input.sciName.trim());
  if (input.commonName?.trim()) params.set("commonName", input.commonName.trim());
  return request(`/api/species/guide?${params.toString()}`);
}
