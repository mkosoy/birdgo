import { ebirdGet } from "./ebird.js";

export interface ChecklistNotes {
  speciesComment?: string;
  checklistComment?: string;
  howMany?: string;
  mediaCount?: number;
}

interface ChecklistObservation {
  speciesCode?: string;
  obsComments?: string;
  howManyStr?: string;
  photoCounts?: number;
  audioCounts?: number;
  videoCounts?: number;
}

interface ChecklistDetail {
  subComments?: string;
  obs?: ChecklistObservation[];
}

const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;
const cache = new Map<string, { expiresAt: number; value: ChecklistNotes }>();

function cleanComment(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value
    .replace(/<[^>]+>/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return undefined;
  return text.length > 360 ? `${text.slice(0, 357).trimEnd()}…` : text;
}

function readCache(key: string): ChecklistNotes | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function writeCache(key: string, value: ChecklistNotes): void {
  if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function parseChecklistNotes(detail: ChecklistDetail, speciesCode: string): ChecklistNotes {
  const observation = detail.obs?.find((entry) => entry.speciesCode === speciesCode);
  const mediaCount = (observation?.photoCounts ?? 0) + (observation?.audioCounts ?? 0) + (observation?.videoCounts ?? 0);
  return {
    speciesComment: cleanComment(observation?.obsComments),
    checklistComment: cleanComment(detail.subComments),
    howMany: typeof observation?.howManyStr === "string" && observation.howManyStr.trim() ? observation.howManyStr.trim() : undefined,
    mediaCount: mediaCount > 0 ? mediaCount : undefined,
  };
}

export async function fetchChecklistNotes(subId: string, speciesCode: string, token: string | undefined): Promise<ChecklistNotes> {
  const key = `${subId}:${speciesCode}`;
  const cached = readCache(key);
  if (cached) return cached;
  const detail = await ebirdGet<ChecklistDetail>(`/product/checklist/view/${encodeURIComponent(subId)}`, token);
  const notes = parseChecklistNotes(detail, speciesCode);
  writeCache(key, notes);
  return notes;
}
