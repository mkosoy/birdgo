const EBIRD_BASE_URL = "https://api.ebird.org/v2";

export interface EbirdObservation {
  speciesCode: string;
  comName?: string;
  sciName?: string;
  locId?: string;
  locName?: string;
  lat?: number;
  lng?: number;
  obsDt?: string;
  imageUrl?: string;
  audioUrl?: string;
  audioStartTime?: number;
  audioEndTime?: number;
  evidenceCount?: number;
  subId?: string;
  obsId?: string;
  source?: string;
  [key: string]: unknown;
}

export class EbirdError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "EbirdError";
  }
}

export async function ebirdGet<T>(
  path: string,
  token: string | undefined,
): Promise<T> {
  if (!token) {
    throw new EbirdError(503, "eBird API token is not configured");
  }
  const response = await fetch(`${EBIRD_BASE_URL}${path}`, {
    headers: { "X-eBirdApiToken": token, Accept: "application/json" },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new EbirdError(
      response.status,
      detail || `eBird request failed with status ${response.status}`,
    );
  }
  return (await response.json()) as T;
}

export function isSpeciesObservation(observation: EbirdObservation): boolean {
  const name = `${observation.comName ?? ""} ${observation.sciName ?? ""}`.trim();
  if (!name || /\b(?:sp|spp)\.?\b/i.test(name) || name.includes("/") || /\bhybrid\b/i.test(name)) return false;
  return !/\b(?:unknown|unidentified)\b/i.test(name);
}

export function deduplicateObservations(
  observations: EbirdObservation[],
): EbirdObservation[] {
  const byKey = new Map<string, { observation: EbirdObservation; evidence: Set<string> }>();
  for (const observation of observations.filter(isSpeciesObservation)) {
    const locationKey = observation.locId ?? `${observation.lat ?? ""}:${observation.lng ?? ""}`;
    const key = `${observation.speciesCode}:${locationKey}`;
    const evidenceKey = observation.subId ?? observation.obsId ?? "unknown";
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { observation, evidence: new Set([evidenceKey]) });
      continue;
    }
    existing.evidence.add(evidenceKey);
    if (
      new Date(observation.obsDt ?? 0).getTime() >
        new Date(existing.observation.obsDt ?? 0).getTime()
    ) {
      existing.observation = observation;
    }
  }
  return [...byKey.values()].map(({ observation, evidence }) => ({
    ...observation,
    ...(evidence.size > 1 ? { evidenceCount: evidence.size } : {}),
  }));
}
