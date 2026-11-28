import { find as findTimezones } from "geo-tz";
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


const timezoneFormatterCache = new Map<string, Intl.DateTimeFormat>();

function timezoneFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = timezoneFormatterCache.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  timezoneFormatterCache.set(timeZone, formatter);
  return formatter;
}

function timezoneOffsetMs(timeZone: string, utcMs: number): number {
  const parts = timezoneFormatter(timeZone).formatToParts(new Date(utcMs));
  const values: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  }
  const zonedAsUtc = Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute, values.second);
  return zonedAsUtc - Math.floor(utcMs / 1000) * 1000;
}

function zonedLocalToUtcMs(naiveUtcMs: number, timeZone: string): number {
  const initialOffset = timezoneOffsetMs(timeZone, naiveUtcMs);
  const initialResult = naiveUtcMs - initialOffset;
  const adjustedOffset = timezoneOffsetMs(timeZone, initialResult);
  return adjustedOffset === initialOffset ? initialResult : naiveUtcMs - adjustedOffset;
}

function observationUtcMs(trimmed: string, longitude?: number, latitude?: number): number {
  const hasTimezone = /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(trimmed);
  if (hasTimezone) return Date.parse(trimmed);
  const naiveUtc = Date.parse(`${trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T")}Z`);
  if (!Number.isFinite(naiveUtc)) return Number.NaN;
  if (typeof longitude === "number" && Number.isFinite(longitude) && typeof latitude === "number" && Number.isFinite(latitude)) {
    try {
      return zonedLocalToUtcMs(naiveUtc, findTimezones(latitude, longitude)[0]);
    } catch {
      // Fall through to the longitude approximation.
    }
  }
  const approximateOffsetHours = typeof longitude === "number" && Number.isFinite(longitude)
    ? Math.max(-12, Math.min(14, longitude / 15))
    : 0;
  return naiveUtc - approximateOffsetHours * 3_600_000;
}

export function filterRecentLocalObservations(
  observations: EbirdObservation[],
  maxAgeHours = 75,
  now = Date.now(),
): EbirdObservation[] {
  return observations.filter((observation) => {
    const trimmed = observation.obsDt?.trim();
    if (!trimmed) return false;
    const observedAt = observationUtcMs(trimmed, observation.lng, observation.lat);
    if (!Number.isFinite(observedAt)) return false;
    const ageHours = (now - observedAt) / 3_600_000;
    return ageHours >= -27 && ageHours <= maxAgeHours;
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
