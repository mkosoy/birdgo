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

function evidenceTimeMs(obsDt?: string): number {
  const trimmed = obsDt?.trim();
  if (!trimmed) return Number.NaN;
  return Date.parse(trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T"));
}


export function filterRecentLocalObservations(
  observations: EbirdObservation[],
  maxAgeHours = 75,
  now = Date.now(),
): EbirdObservation[] {
  return observations.filter((observation) => {
    const trimmed = observation.obsDt?.trim();
    if (!trimmed) return false;
    const hasTimezone = /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(trimmed);
    const normalized = hasTimezone ? trimmed : `${trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T")}Z`;
    const naiveUtc = Date.parse(normalized);
    if (!Number.isFinite(naiveUtc)) return false;
    const approximateOffsetHours = typeof observation.lng === "number" && Number.isFinite(observation.lng)
      ? Math.max(-12, Math.min(14, observation.lng / 15))
      : 0;
    const ageHours = (now - (naiveUtc - approximateOffsetHours * 3_600_000)) / 3_600_000;
    return ageHours <= maxAgeHours;
  });
}

export function deduplicateObservations(
  observations: EbirdObservation[],
): EbirdObservation[] {
  const byKey = new Map<string, { observation: EbirdObservation; evidence: Map<string, number> }>();
  for (const observation of observations.filter(isSpeciesObservation)) {
    const locationKey = observation.locId ?? `${observation.lat ?? ""}:${observation.lng ?? ""}`;
    const key = `${observation.speciesCode}:${locationKey}`;
    const time = evidenceTimeMs(observation.obsDt);
    const hasTimeOfDay = Boolean(observation.obsDt?.trim().match(/(?:\s|T)\d{1,2}:\d{2}/));
    // Shared or simultaneous timed checklists are one birding event, not independent corroboration.
    const evidenceKey = Number.isFinite(time) && hasTimeOfDay
      ? `time:${Math.round(time / 60000)}`
      : observation.subId ?? observation.obsId ?? "unknown";
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { observation, evidence: new Map([[evidenceKey, time]]) });
      continue;
    }
    existing.evidence.set(evidenceKey, time);
    if (
      new Date(observation.obsDt ?? 0).getTime() >
        new Date(existing.observation.obsDt ?? 0).getTime()
    ) {
      existing.observation = observation;
    }
  }
  return [...byKey.values()].map(({ observation, evidence }) => {
    const times = [...evidence.values()].filter(Number.isFinite);
    const newest = times.length ? Math.max(...times) : Number.NaN;
    const freshCount = Number.isFinite(newest)
      ? [...evidence.values()].filter((time) => Number.isFinite(time) && newest - time <= 72 * 3_600_000).length
      : evidence.size;
    return {
      ...observation,
      ...(freshCount > 1 ? { evidenceCount: freshCount } : {}),
    };
  });
}
