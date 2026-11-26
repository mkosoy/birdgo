import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Coordinates, CaptureRecord, SeenSpecies, SkyfriendRecord } from "../types";
import { speciesKey, speciesKeyAliases, xpForCapture } from "../utils/progression";

const CAPTURES_KEY = "birdgo.captures";
const SEEN_KEY = "birdgo.seen";
const SEEN_AREA_KEY = "birdgo.seen-area";
const XP_KEY = "birdgo.xp";
const XP_EVENTS_KEY = "birdgo.xp-events";
const XP_BANK_KEY = "birdgo.xp-bank";
const XP_MIGRATION_KEY = "birdgo.xp-migrated-v2";
const DISCOVERED_KEY = "birdgo.discovered-species";
const SKYFRIENDS_KEY = "birdgo.skyfriends-v1";
const SEEN_SCOPE_KM = 25;
let seenWriteVersion = 0;

interface XpEvent {
  captureId: string;
  xp: number;
}

function distanceKm(first: Coordinates, second: Coordinates): number {
  const radians = Math.PI / 180;
  const lat1 = first.latitude * radians;
  const lat2 = second.latitude * radians;
  const dLat = lat2 - lat1;
  const dLon = (second.longitude - first.longitude) * radians;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}


export async function listSkyfriends(): Promise<SkyfriendRecord[]> {
  const raw = await AsyncStorage.getItem(SKYFRIENDS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as SkyfriendRecord[];
    return Array.isArray(parsed) ? parsed.filter((record) => record && typeof record.id === "string" && typeof record.commonName === "string") : [];
  } catch {
    return [];
  }
}

export async function addSkyfriend(record: SkyfriendRecord): Promise<SkyfriendRecord> {
  const existing = await listSkyfriends();
  if (record.encounterId && existing.some((entry) => entry.encounterId === record.encounterId)) {
    return existing.find((entry) => entry.encounterId === record.encounterId) ?? record;
  }
  await AsyncStorage.setItem(SKYFRIENDS_KEY, JSON.stringify([record, ...existing]));
  return record;
}

export async function listCaptures(): Promise<CaptureRecord[]> {
  const raw = await AsyncStorage.getItem(CAPTURES_KEY);
  return raw ? (JSON.parse(raw) as CaptureRecord[]) : [];
}

async function readNumber(key: string): Promise<number> {
  const raw = await AsyncStorage.getItem(key);
  const value = raw ? Number(raw) : 0;
  return Number.isFinite(value) ? value : 0;
}

async function writeNumber(key: string, value: number): Promise<void> {
  await AsyncStorage.setItem(key, `${Math.max(0, Math.round(value))}`);
}

async function listXpEvents(): Promise<XpEvent[]> {
  const raw = await AsyncStorage.getItem(XP_EVENTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as XpEvent[];
    return Array.isArray(parsed) ? parsed.filter((event) => event && typeof event.captureId === "string" && Number.isFinite(event.xp)) : [];
  } catch {
    return [];
  }
}

async function writeXpEvents(events: XpEvent[]): Promise<void> {
  await AsyncStorage.setItem(XP_EVENTS_KEY, JSON.stringify(events));
}

async function listDiscoveredKeys(): Promise<Set<string>> {
  const raw = await AsyncStorage.getItem(DISCOVERED_KEY);
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

async function writeDiscoveredKeys(keys: Set<string>): Promise<void> {
  await AsyncStorage.setItem(DISCOVERED_KEY, JSON.stringify([...keys]));
}

function captureKey(capture: CaptureRecord): string {
  return speciesKey(capture.speciesCode, capture.commonName, capture.sciName, capture.canonicalKey);
}

function priorAliasCaptureCount(captures: CaptureRecord[], aliases: string[]): number {
  const aliasSet = new Set(aliases);
  return captures.filter((existing) => speciesKeyAliases(existing.speciesCode, existing.commonName, existing.sciName, existing.canonicalKey).some((alias) => aliasSet.has(alias))).length;
}

function derivedCaptureEvents(captures: CaptureRecord[]): XpEvent[] {
  const chronological = [...captures].reverse();
  const seenKeys = new Set<string>();
  const counts = new Map<string, number>();
  return chronological.flatMap((capture) => {
    const aliases = speciesKeyAliases(capture.speciesCode, capture.commonName, capture.sciName, capture.canonicalKey);
    const key = captureKey(capture);
    const isNewSpecies = !seenKeys.has(key);
    const priorCaptureCount = Math.max(0, ...aliases.map((alias) => counts.get(alias) ?? 0));
    aliases.forEach((alias) => {
      seenKeys.add(alias);
      counts.set(alias, (counts.get(alias) ?? 0) + 1);
    });
    const xp = capture.xpAwarded ?? xpForCapture(capture, isNewSpecies, priorCaptureCount, false);
    return xp > 0 ? [{ captureId: capture.id, xp }] : [];
  });
}

export async function addCapture(capture: CaptureRecord): Promise<CaptureRecord> {
  const captures = await listCaptures();
  const discovered = await listDiscoveredKeys();
  const aliases = speciesKeyAliases(capture.speciesCode, capture.commonName, capture.sciName, capture.canonicalKey);
  const isNewSpecies = !aliases.some((alias) => discovered.has(alias));
  const priorCaptureCount = priorAliasCaptureCount(captures, aliases);
  const xpAwarded = capture.xpAwarded ?? xpForCapture(capture, isNewSpecies, priorCaptureCount);
  const record = { ...capture, xpAwarded };
  await AsyncStorage.setItem(CAPTURES_KEY, JSON.stringify([record, ...captures]));
  aliases.forEach((alias) => discovered.add(alias));
  await writeDiscoveredKeys(discovered);
  const events = await listXpEvents();
  if (!events.some((event) => event.captureId === record.id)) {
    await writeXpEvents([...events, { captureId: record.id, xp: xpAwarded }]);
  }
  return record;
}

export async function getCollectionXp(): Promise<number> {
  const captures = await listCaptures();
  let events = await listXpEvents();
  const migrated = await AsyncStorage.getItem(XP_MIGRATION_KEY);

  if (!migrated) {
    const derivedEvents = derivedCaptureEvents(captures);
    const derivedXp = derivedEvents.reduce((total, event) => total + event.xp, 0);
    const legacyXp = await readNumber(XP_KEY);
    const bankedXp = Math.max(0, legacyXp - derivedXp);
    const discovered = await listDiscoveredKeys();
    captures.forEach((capture) => speciesKeyAliases(capture.speciesCode, capture.commonName, capture.sciName, capture.canonicalKey).forEach((alias) => discovered.add(alias)));
    events = derivedEvents;
    await Promise.all([
      writeXpEvents(events),
      writeNumber(XP_BANK_KEY, bankedXp),
      writeDiscoveredKeys(discovered),
      AsyncStorage.setItem(XP_MIGRATION_KEY, "1"),
    ]);
  } else {
    const known = new Set(events.map((event) => event.captureId));
    const missing = derivedCaptureEvents(captures).filter((event) => !known.has(event.captureId));
    if (missing.length) {
      events = [...events, ...missing];
      await writeXpEvents(events);
    }
  }

  const bankedXp = await readNumber(XP_BANK_KEY);
  return bankedXp + events.reduce((total, event) => total + event.xp, 0);
}

export function captureMatchesSpecies(
  capture: CaptureRecord,
  speciesCode?: string,
  commonName?: string,
  sciName?: string | null,
  canonicalKey?: string | null,
): boolean {
  const normalize = (value?: string | null) => value?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
  const captureCanonical = normalize(capture.canonicalKey);
  const targetCanonical = normalize(canonicalKey);
  const captureIsEbird = capture.speciesCode && !capture.speciesCode.startsWith("inat-");
  const targetIsEbird = speciesCode && !speciesCode.startsWith("inat-");
  if (captureIsEbird && targetIsEbird && capture.speciesCode !== speciesCode) return false;
  if (captureCanonical && targetCanonical) return captureCanonical === targetCanonical;
  const captureScientific = normalize(capture.sciName);
  const targetScientific = normalize(sciName);
  if (captureScientific && targetScientific && captureScientific === targetScientific) return true;
  const captureName = normalize(capture.commonName);
  const targetName = normalize(commonName);
  if (captureName && targetName && captureName === targetName) return true;
  return Boolean(capture.speciesCode && speciesCode && capture.speciesCode === speciesCode);
}

export async function releaseSpecies(speciesCode?: string, commonName?: string, sciName?: string | null, canonicalKey?: string | null): Promise<void> {
  const captures = await listCaptures();
  const remaining = captures.filter((capture) => !captureMatchesSpecies(capture, speciesCode, commonName, sciName, canonicalKey));
  await AsyncStorage.setItem(CAPTURES_KEY, JSON.stringify(remaining));
}

export async function releaseCaptures(captureIds: string[]): Promise<void> {
  const ids = new Set(captureIds);
  if (!ids.size) return;
  const captures = await listCaptures();
  const remaining = captures.filter((capture) => !ids.has(capture.id));
  await AsyncStorage.setItem(CAPTURES_KEY, JSON.stringify(remaining));
}

export async function listSeenSpecies(): Promise<SeenSpecies[]> {
  const raw = await AsyncStorage.getItem(SEEN_KEY);
  return raw ? (JSON.parse(raw) as SeenSpecies[]) : [];
}

export async function markSeenSpecies(species: SeenSpecies[], area: Coordinates): Promise<void> {
  const writeVersion = ++seenWriteVersion;
  const existing = await listSeenSpecies();
  const previousAreaRaw = await AsyncStorage.getItem(SEEN_AREA_KEY);
  const previousArea = previousAreaRaw ? JSON.parse(previousAreaRaw) as Coordinates : undefined;
  const areaChanged = !previousArea || distanceKm(previousArea, area) > SEEN_SCOPE_KM;
  const retained = existing.filter((item) =>
    !areaChanged
    && item.location
    && distanceKm(item.location, area) <= SEEN_SCOPE_KM
  );
  const current = new Map(retained.map((item) => [item.speciesCode, item]));
  species.forEach((item) => current.set(item.speciesCode, { ...item, location: area }));
  if (writeVersion !== seenWriteVersion) return;
  await Promise.all([
    AsyncStorage.setItem(SEEN_KEY, JSON.stringify([...current.values()])),
    AsyncStorage.setItem(SEEN_AREA_KEY, JSON.stringify(area)),
  ]);
}
