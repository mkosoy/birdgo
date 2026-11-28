import tzLookup from "@photostructure/tz-lookup";

// eBird observation timestamps are local to the sighting and carry no timezone.
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function timezoneFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
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
  formatterCache.set(timeZone, formatter);
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

function fallbackLongitudeTimeMs(naiveUtcMs: number, longitude?: number): number | undefined {
  if (typeof longitude !== "number" || !Number.isFinite(longitude)) return undefined;
  const approximateOffsetHours = Math.max(-12, Math.min(14, longitude / 15));
  return naiveUtcMs - approximateOffsetHours * 3_600_000;
}

export function observationTimeMs(obsDt: string | undefined, longitude?: number, latitude?: number): number | undefined {
  if (!obsDt) return undefined;
  const trimmed = obsDt.trim();
  if (!trimmed) return undefined;
  const hasTimezone = /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(trimmed);
  if (hasTimezone) {
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  const isoLocal = trimmed.replace(" ", "T");
  const naiveUtc = Date.parse(`${isoLocal}Z`);
  if (!Number.isFinite(naiveUtc)) return undefined;
  if (typeof longitude === "number" && Number.isFinite(longitude) && typeof latitude === "number" && Number.isFinite(latitude)) {
    try {
      return zonedLocalToUtcMs(naiveUtc, tzLookup(latitude, longitude));
    } catch {
      return fallbackLongitudeTimeMs(naiveUtc, longitude);
    }
  }
  return fallbackLongitudeTimeMs(naiveUtc, longitude);
}
