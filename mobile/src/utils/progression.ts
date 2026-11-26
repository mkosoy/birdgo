import type { BirdRarity, CaptureRecord, SeenSpecies } from "../types";

export const RARITY_ORDER: BirdRarity[] = ["common", "uncommon", "rare", "epic", "legendary"];

const RARITY_XP: Record<BirdRarity, number> = {
  common: 25,
  uncommon: 45,
  rare: 80,
  epic: 140,
  legendary: 250,
};

export const RARITY_COLORS: Record<BirdRarity, string> = {
  common: "#6d7f74",
  uncommon: "#2f7d5b",
  rare: "#2878d1",
  epic: "#7b4cc2",
  legendary: "#d99d21",
};

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function speciesKey(speciesCode?: string, commonName?: string, sciName?: string | null, canonicalKey?: string | null): string {
  const normalizedCanonical = canonicalKey?.trim().toLowerCase().replace(/\s+/g, " ");
  if (normalizedCanonical) return normalizedCanonical;
  const normalizedScientific = sciName?.trim().toLowerCase().replace(/\s+/g, " ");
  if (normalizedScientific) return normalizedScientific;
  const normalizedName = commonName?.trim().toLowerCase().replace(/\s+/g, " ");
  if (normalizedName) return normalizedName;
  return speciesCode?.trim().toLowerCase() || "unidentified bird";
}

export function speciesKeyAliases(speciesCode?: string, commonName?: string, sciName?: string | null, canonicalKey?: string | null): string[] {
  return [...new Set([
    speciesKey(speciesCode, commonName, sciName, canonicalKey),
    speciesKey(speciesCode, commonName, sciName),
    speciesKey(speciesCode, commonName),
  ])];
}

export function rarityForSpecies(speciesCode?: string, commonName?: string, isNotable?: boolean, sciName?: string | null, canonicalKey?: string | null, frequency?: number, abundanceCount?: number): BirdRarity {
  const key = speciesKey(speciesCode, commonName, sciName, canonicalKey);
  if (!key || key === "unidentified bird") return "common";
  if (typeof abundanceCount === "number" && Number.isFinite(abundanceCount)) {
    if (isNotable) return abundanceCount <= 2 ? "legendary" : abundanceCount <= 10 ? "epic" : "rare";
    return abundanceCount >= 25 ? "common" : abundanceCount >= 5 ? "uncommon" : "rare";
  }
  if (typeof frequency === "number" && Number.isFinite(frequency)) {
    if (isNotable) return frequency <= 4 ? "legendary" : frequency <= 8 ? "epic" : "rare";
    return frequency >= 9 ? "common" : "uncommon";
  }
  const roll = stableHash(key) % 100;
  if (!isNotable) return roll < 75 ? "common" : "uncommon";
  return roll < 70 ? "rare" : roll < 95 ? "epic" : "legendary";
}

export function isIdentifiedCapture(capture: Pick<CaptureRecord, "speciesCode" | "commonName" | "sciName">): boolean {
  const commonName = capture.commonName?.trim().toLowerCase().replace(/\s+/g, " ");
  return Boolean(capture.speciesCode?.trim() || capture.sciName?.trim() || (commonName && commonName !== "unidentified bird"));
}

export function xpForCapture(capture: Pick<CaptureRecord, "rarity" | "verified" | "speciesCode" | "commonName" | "sciName">, isNewSpecies: boolean): number {
  if (!isIdentifiedCapture(capture)) return 0;
  const rarity = capture.rarity ?? "common";
  return RARITY_XP[rarity] + (capture.verified ? 20 : 0) + (isNewSpecies ? 50 : 0);
}

export function levelForXp(xp: number): { level: number; currentLevelXp: number; nextLevelXp: number; progress: number } {
  let level = 1;
  let floor = 0;
  let next = 100;
  while (xp >= next && level < 50) {
    floor = next;
    level += 1;
    next = floor + level * 100;
  }
  const span = next - floor;
  return {
    level,
    currentLevelXp: xp - floor,
    nextLevelXp: span,
    progress: Math.min(1, Math.max(0, (xp - floor) / span)),
  };
}

export interface SpeciesDexEntry {
  key: string;
  speciesCode?: string;
  commonName: string;
  sciName?: string | null;
  canonicalKey?: string;
  rarity: BirdRarity;
  capturedCount: number;
  seen: boolean;
  firstCapturedAt?: string;
  lastCapturedAt?: string;
  photoUri?: string;
  imageUrl?: string;
  capture?: CaptureRecord;
  bestCapture?: CaptureRecord;
  identified?: boolean;
}



interface SpeciesIdentityFields {
  speciesCode?: string;
  commonName?: string;
  comName?: string;
  sciName?: string | null;
  canonicalKey?: string | null;
}

function normalizedSpeciesName(value?: string | null): string {
  return value?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
}

function isEbirdSpeciesCode(speciesCode?: string): boolean {
  return Boolean(speciesCode && !speciesCode.startsWith("inat-"));
}

function speciesIdentitiesMatch(left: SpeciesIdentityFields, right: SpeciesIdentityFields): boolean {
  const leftCanonical = normalizedSpeciesName(left.canonicalKey);
  const rightCanonical = normalizedSpeciesName(right.canonicalKey);
  if (
    isEbirdSpeciesCode(left.speciesCode)
    && isEbirdSpeciesCode(right.speciesCode)
    && left.speciesCode !== right.speciesCode
  ) return false;
  if (leftCanonical && rightCanonical) return leftCanonical === rightCanonical;
  const leftScientific = normalizedSpeciesName(left.sciName);
  const rightScientific = normalizedSpeciesName(right.sciName);
  if (leftScientific && leftScientific === rightScientific) return true;
  const leftCommon = normalizedSpeciesName(left.commonName ?? left.comName);
  const rightCommon = normalizedSpeciesName(right.commonName ?? right.comName);
  return Boolean(leftCommon && leftCommon === rightCommon);
}

function captureName(capture: CaptureRecord): string {
  return typeof capture.commonName === "string" && capture.commonName.trim() ? capture.commonName.trim() : "Unidentified bird";
}

function captureKey(capture: CaptureRecord): string {
  return speciesKey(capture.speciesCode, captureName(capture), capture.sciName, capture.canonicalKey);
}

function captureMeritScore(capture: CaptureRecord): number {
  const rarity = capture.rarity ?? rarityForSpecies(capture.speciesCode, capture.commonName, undefined, capture.sciName, capture.canonicalKey);
  return RARITY_ORDER.indexOf(rarity) * 10 + (capture.verified ? 4 : 0) + (capture.photoUri ? 2 : 0);
}

function collisionFreeEntryKey(entries: Map<string, SpeciesDexEntry>, baseKey: string, identity: SpeciesIdentityFields): string {
  if (!entries.has(baseKey)) return baseKey;
  const source = normalizedSpeciesName(identity.speciesCode)
    || normalizedSpeciesName(identity.commonName ?? identity.comName)
    || "species";
  const slug = source.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "species";
  let candidate = `${baseKey}#${slug}`;
  let index = 2;
  while (entries.has(candidate)) {
    candidate = `${baseKey}#${slug}-${index}`;
    index += 1;
  }
  return candidate;
}

export function buildSpeciesDex(captures: CaptureRecord[], seenSpecies: SeenSpecies[]): SpeciesDexEntry[] {
  const entries = new Map<string, SpeciesDexEntry>();
  captures.forEach((capture) => {
    const commonName = captureName(capture);
    const key = captureKey(capture);
    const direct = entries.get(key);
    const existing = (direct && speciesIdentitiesMatch(direct, { ...capture, commonName }) ? direct : undefined)
      ?? [...entries.values()].find((entry) => speciesIdentitiesMatch(entry, { ...capture, commonName }));
    const timestamp = typeof capture.timestamp === "string" ? capture.timestamp : "";
    if (!existing) {
      const entryKey = collisionFreeEntryKey(entries, key, { ...capture, commonName });
      entries.set(entryKey, {
        key: entryKey,
        speciesCode: capture.speciesCode,
        commonName,
        sciName: capture.sciName,
        canonicalKey: capture.canonicalKey,
        rarity: capture.rarity ?? rarityForSpecies(capture.speciesCode, commonName, undefined, capture.sciName, capture.canonicalKey),
        capturedCount: 1,
        seen: true,
        firstCapturedAt: timestamp,
        lastCapturedAt: timestamp,
        photoUri: capture.photoUri,
        capture,
        bestCapture: capture,
        identified: isIdentifiedCapture(capture),
      });
      return;
    }
    existing.capturedCount += 1;
    const currentBest = existing.bestCapture ?? existing.capture;
    if (!currentBest || captureMeritScore(capture) > captureMeritScore(currentBest)) {
      existing.bestCapture = capture;
      existing.rarity = capture.rarity ?? rarityForSpecies(capture.speciesCode, capture.commonName, undefined, capture.sciName, capture.canonicalKey);
    }
    if (!existing.photoUri && capture.photoUri) {
      existing.photoUri = capture.photoUri;
      existing.capture = capture;
    }
    if (timestamp && (!existing.firstCapturedAt || timestamp < existing.firstCapturedAt)) existing.firstCapturedAt = timestamp;
    if (timestamp && (!existing.lastCapturedAt || timestamp > existing.lastCapturedAt)) {
      existing.lastCapturedAt = timestamp;
      if (capture.photoUri) {
        existing.photoUri = capture.photoUri;
        existing.capture = capture;
      }
    }
    if (!existing.sciName && capture.sciName) existing.sciName = capture.sciName;
    if (!existing.canonicalKey && capture.canonicalKey) existing.canonicalKey = capture.canonicalKey;
  });
  seenSpecies.forEach((species) => {
    const key = speciesKey(species.speciesCode, species.comName, species.sciName, species.canonicalKey);
    const direct = entries.get(key);
    const existing = (direct && speciesIdentitiesMatch(direct, species) ? direct : undefined)
      ?? [...entries.values()].find((entry) => speciesIdentitiesMatch(entry, species));
    if (existing) {
      existing.seen = true;
      if (!existing.speciesCode && species.speciesCode) existing.speciesCode = species.speciesCode;
      if (!existing.sciName && species.sciName) existing.sciName = species.sciName;
      if (!existing.canonicalKey && species.canonicalKey) existing.canonicalKey = species.canonicalKey;
      if (!existing.imageUrl && species.imageUrl) existing.imageUrl = species.imageUrl;
      return;
    }
    const entryKey = collisionFreeEntryKey(entries, key, species);
    entries.set(entryKey, {
      key: entryKey,
      speciesCode: species.speciesCode,
      commonName: species.comName,
      sciName: species.sciName,
      canonicalKey: species.canonicalKey,
      rarity: rarityForSpecies(species.speciesCode, species.comName, species.isNotable, species.sciName, species.canonicalKey, species.frequency, species.abundanceCount),
      capturedCount: 0,
      seen: true,
      imageUrl: species.imageUrl,
    });
  });
  return [...entries.values()].sort((left, right) =>
    Number(right.capturedCount > 0) - Number(left.capturedCount > 0)
    || RARITY_ORDER.indexOf(right.rarity) - RARITY_ORDER.indexOf(left.rarity)
    || right.capturedCount - left.capturedCount
    || left.commonName.localeCompare(right.commonName)
  );
}
