import type { CaptureRecord, SkyfriendRecord } from "../types";
import { isIdentifiedCapture, RARITY_ORDER, speciesKeyAliases, type SpeciesCountGroup } from "./progression";

export interface DailyQuest {
  id: string;
  claimKey: string;
  title: string;
  detail: string;
  icon: "leaf" | "camera" | "star" | "ribbon" | "planet" | "sparkles";
  progress: number;
  target: number;
  rewardXp: number;
  completed: boolean;
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function dayKey(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function timestamp(value?: string): number {
  const time = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(time) ? time : 0;
}

function makeQuest(id: string, claimDay: string, title: string, detail: string, icon: DailyQuest["icon"], progress: number, target: number, rewardXp: number): DailyQuest {
  return {
    id,
    claimKey: `${claimDay}:${id}`,
    title,
    detail,
    icon,
    progress: Math.min(progress, target),
    target,
    rewardXp,
    completed: progress >= target,
  };
}

function newSpeciesCountToday(captures: CaptureRecord[], dayStart: number, speciesCaptureCounts: SpeciesCountGroup[]): number {
  const priorAliases = new Set<string>();
  const todaysCaptures = captures.filter((capture) => timestamp(capture.timestamp) >= dayStart);
  captures.forEach((capture) => {
    if (timestamp(capture.timestamp) < dayStart) {
      speciesKeyAliases(capture.speciesCode, capture.commonName, capture.sciName, capture.canonicalKey).forEach((alias) => priorAliases.add(alias));
    }
  });
  speciesCaptureCounts.forEach((group) => {
    const todaysCount = todaysCaptures.filter((capture) => {
      const aliases = speciesKeyAliases(capture.speciesCode, capture.commonName, capture.sciName, capture.canonicalKey);
      return aliases.some((alias) => group.aliases.includes(alias));
    }).length;
    if (group.count > todaysCount) group.aliases.forEach((alias) => priorAliases.add(alias));
  });
  const counted = new Set<string>();
  let count = 0;
  todaysCaptures
    .sort((left, right) => timestamp(left.timestamp) - timestamp(right.timestamp))
    .forEach((capture) => {
      const aliases = speciesKeyAliases(capture.speciesCode, capture.commonName, capture.sciName, capture.canonicalKey);
      if (!aliases.length) return;
      const isNew = !aliases.some((alias) => priorAliases.has(alias) || counted.has(alias));
      aliases.forEach((alias) => counted.add(alias));
      if (isNew) count += 1;
    });
  return count;
}

type RealQuestId = "verify-photo" | "rare-find" | "new-species" | "two-real";

function realSpecialProgress(id: RealQuestId, captures: CaptureRecord[], dayStart: number, speciesCaptureCounts: SpeciesCountGroup[]): number {
  const todays = captures.filter((capture) => timestamp(capture.timestamp) >= dayStart && isIdentifiedCapture(capture));
  if (id === "verify-photo") return todays.filter((capture) => capture.verified && (capture.photoUri || capture.photoEvidenceProvided)).length;
  if (id === "rare-find") return todays.filter((capture) => RARITY_ORDER.indexOf(capture.rarity ?? "common") >= RARITY_ORDER.indexOf("rare")).length;
  if (id === "new-species") return newSpeciesCountToday(captures, dayStart, speciesCaptureCounts);
  return todays.length;
}

const REAL_SPECIALS: Record<RealQuestId, { title: string; detail: string; icon: DailyQuest["icon"]; target: number; rewardXp: number }> = {
  "verify-photo": { title: "Photo evidence", detail: "Verify one real bird photo with AI", icon: "camera", target: 1, rewardXp: 25 },
  "rare-find": { title: "Rare find", detail: "Capture or honor-log a rare or better real bird", icon: "star", target: 1, rewardXp: 50 },
  "new-species": { title: "Life-list growth", detail: "Add one species that is new to your collection", icon: "ribbon", target: 1, rewardXp: 50 },
  "two-real": { title: "Field session", detail: "Capture or honor-log two real birds today", icon: "leaf", target: 2, rewardXp: 35 },
};

const SKYFRIEND_QUESTS = [
  { id: "skyfriend-one", title: "Skyfriend search", detail: "Collect one Skyfriend", icon: "planet" as const, target: 1, rewardXp: 15 },
  { id: "skyfriend-pair", title: "Skyfriend trek", detail: "Collect two Skyfriends", icon: "sparkles" as const, target: 2, rewardXp: 30 },
];

export function buildDailyQuests(captures: CaptureRecord[], skyfriends: SkyfriendRecord[], speciesCaptureCounts: SpeciesCountGroup[] = [], now = new Date()): DailyQuest[] {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const key = dayKey(now);
  const todaysReal = captures.filter((capture) => timestamp(capture.timestamp) >= start && isIdentifiedCapture(capture));
  const todaysSkyfriends = skyfriends.filter((record) => timestamp(record.timestamp) >= start);
  const hash = stableHash(key);
  const realIds = Object.keys(REAL_SPECIALS) as RealQuestId[];
  const realId = realIds[hash % realIds.length];
  const realSpecial = REAL_SPECIALS[realId];
  const skyQuest = SKYFRIEND_QUESTS[(hash >>> 3) % SKYFRIEND_QUESTS.length];
  return [
    makeQuest("real-log", key, "Birding moment", "Capture or honor-log one real bird", "leaf", todaysReal.length, 1, 20),
    makeQuest(realId, key, realSpecial.title, realSpecial.detail, realSpecial.icon, realSpecialProgress(realId, captures, start, speciesCaptureCounts), realSpecial.target, realSpecial.rewardXp),
    makeQuest(skyQuest.id, key, skyQuest.title, skyQuest.detail, skyQuest.icon, todaysSkyfriends.length, skyQuest.target, skyQuest.rewardXp),
  ];
}
