// eBird observation timestamps are local to the sighting and carry no timezone.
export function observationTimeMs(obsDt: string | undefined, longitude?: number): number | undefined {
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
  if (typeof longitude === "number" && Number.isFinite(longitude)) {
    const approximateOffsetHours = Math.max(-12, Math.min(14, longitude / 15));
    return naiveUtc - approximateOffsetHours * 3_600_000;
  }
  const parsed = Date.parse(isoLocal);
  return Number.isFinite(parsed) ? parsed : undefined;
}
