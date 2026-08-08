import { API_BASE_URL } from "./config";
import type { EbirdObservation, IdentificationResult } from "./types";

interface RawEbirdObservation {
  lat?: number;
  lng?: number;
  comName?: string;
  sciName?: string;
  speciesCode: string;
  locId?: string;
  locName?: string;
  obsDt?: string;
  howMany?: number;
  imageUrl?: string;
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
  return request<RawEbirdObservation[]>(`/api/birds/recent?lat=${latitude}&lng=${longitude}&dist=15&back=14`)
    .then((observations) => observations.flatMap((observation) => mapObservation(observation)));
}

export function fetchNotableBirds(latitude: number, longitude: number): Promise<EbirdObservation[]> {
  return request<RawEbirdObservation[]>(`/api/birds/notable?lat=${latitude}&lng=${longitude}&dist=25&detail=full`)
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
    howMany: raw.howMany,
    imageUrl: raw.imageUrl,
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
