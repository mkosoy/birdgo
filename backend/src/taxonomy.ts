import { ebirdGet } from "./ebird.js";

export interface SpeciesIdentityInput {
  speciesCode?: string;
  comName?: string;
  commonName?: string;
  sciName?: string | null;
}

export interface CanonicalSpeciesIdentity extends SpeciesIdentityInput {
  canonicalKey?: string;
  canonicalSciName?: string;
}

interface EbirdTaxonomyEntry {
  speciesCode?: string;
  comName?: string;
  sciName?: string;
}

interface GbifSpeciesMatch {
  usageKey?: number;
  acceptedUsageKey?: number;
  speciesKey?: number;
  species?: string;
  canonicalName?: string;
  status?: string;
  confidence?: number;
  matchType?: string;
  class?: string;
}

let ebirdTaxonomyCache: { expiresAt: number; entries: EbirdTaxonomyEntry[] } | undefined;
const GBIF_CACHE_LIMIT = 500;
const GBIF_CONCURRENCY_LIMIT = 8;
const GBIF_QUEUE_LIMIT = 64;
const GBIF_SUCCESS_CACHE_MS = 24 * 60 * 60 * 1000;
const GBIF_FAILURE_CACHE_MS = 5 * 60 * 1000;
const gbifCache = new Map<string, { expiresAt: number; result: CanonicalSpeciesIdentity | undefined }>();
let gbifSlots = GBIF_CONCURRENCY_LIMIT;
const gbifSlotWaiters: Array<() => void> = [];

async function acquireGbifSlot(): Promise<boolean> {
  if (gbifSlots > 0) {
    gbifSlots -= 1;
    return true;
  }
  if (gbifSlotWaiters.length >= GBIF_QUEUE_LIMIT) return false;
  await new Promise<void>((resolve) => gbifSlotWaiters.push(resolve));
  return true;
}

function releaseGbifSlot(): void {
  const next = gbifSlotWaiters.shift();
  if (next) next();
  else gbifSlots += 1;
}

function cacheGbifResult(key: string, result: CanonicalSpeciesIdentity | undefined): void {
  if (!gbifCache.has(key) && gbifCache.size >= GBIF_CACHE_LIMIT) {
    const oldest = gbifCache.keys().next().value;
    if (oldest) gbifCache.delete(oldest);
  }
  gbifCache.set(key, {
    result,
    expiresAt: Date.now() + (result ? GBIF_SUCCESS_CACHE_MS : GBIF_FAILURE_CACHE_MS),
  });
}

function cachedGbifResult(key: string): CanonicalSpeciesIdentity | undefined | null {
  const cached = gbifCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    gbifCache.delete(key);
    return null;
  }
  return cached.result;
}

function normalize(value?: string | null): string {
  return value?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
}

async function ebirdTaxonomy(token?: string): Promise<EbirdTaxonomyEntry[]> {
  if (!token) return [];
  if (ebirdTaxonomyCache && ebirdTaxonomyCache.expiresAt > Date.now()) return ebirdTaxonomyCache.entries;
  const entries = await ebirdGet<EbirdTaxonomyEntry[]>("/ref/taxonomy/ebird?fmt=json", token);
  ebirdTaxonomyCache = { entries, expiresAt: Date.now() + 24 * 60 * 60 * 1000 };
  return entries;
}

async function scientificNameFor(input: SpeciesIdentityInput, token?: string): Promise<string | undefined> {
  if (normalize(input.sciName)) return input.sciName?.trim();
  const common = normalize(input.comName ?? input.commonName);
  if (!common) return undefined;
  try {
    const match = (await ebirdTaxonomy(token)).find((entry) => normalize(entry.comName) === common);
    return match?.sciName?.trim();
  } catch {
    return undefined;
  }
}

async function gbifCanonicalize(scientificName: string): Promise<CanonicalSpeciesIdentity | undefined> {
  const cacheKey = normalize(scientificName);
  const cached = cachedGbifResult(cacheKey);
  if (cached !== null) return cached;
  try {
    const params = new URLSearchParams({ name: scientificName, class: "Aves" });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    let match: GbifSpeciesMatch;
    if (!(await acquireGbifSlot())) throw new Error("GBIF lookup queue is full");
    try {
      const response = await fetch(`https://api.gbif.org/v1/species/match?${params.toString()}`, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`GBIF request failed with status ${response.status}`);
      match = (await response.json()) as GbifSpeciesMatch;
    } finally {
      clearTimeout(timeout);
      releaseGbifSlot();
    }
    const canonicalSciName = match.species?.trim() || match.canonicalName?.trim();
    const usageKey = match.speciesKey ?? match.acceptedUsageKey ?? match.usageKey;
    const usable = match.class === "Aves"
      && match.matchType !== "HIGHERRANK"
      && match.matchType !== "NONE"
      && canonicalSciName
      && (match.confidence ?? 0) >= 70;
    const result = usable
      ? {
        sciName: scientificName,
        canonicalSciName,
        canonicalKey: usageKey ? `gbif:${usageKey}` : `gbif-name:${normalize(canonicalSciName)}`,
      }
      : undefined;
    cacheGbifResult(cacheKey, result);
    return result;
  } catch {
    cacheGbifResult(cacheKey, undefined);
    return undefined;
  }
}

async function canonicalizeOne(input: SpeciesIdentityInput, token?: string): Promise<CanonicalSpeciesIdentity> {
  const scientificName = await scientificNameFor(input, token);
  if (scientificName) {
    const canonical = await gbifCanonicalize(scientificName);
    if (canonical?.canonicalKey) {
      return {
        ...input,
        canonicalKey: canonical.canonicalKey,
        canonicalSciName: canonical.canonicalSciName,
      };
    }
  }
  return input;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index]);
    }
  }));
  return results;
}

export async function canonicalizeSpecies(
  items: SpeciesIdentityInput[],
  token?: string,
): Promise<CanonicalSpeciesIdentity[]> {
  const bounded = items.slice(0, 200).map((raw) => {
    const item = raw && typeof raw === "object" ? raw : {};
    return {
      speciesCode: typeof item.speciesCode === "string" ? item.speciesCode.slice(0, 80) : undefined,
      comName: typeof item.comName === "string" ? item.comName.slice(0, 160) : undefined,
      commonName: typeof item.commonName === "string" ? item.commonName.slice(0, 160) : undefined,
      sciName: typeof item.sciName === "string" ? item.sciName.slice(0, 160) : undefined,
    };
  });
  return mapWithConcurrency(bounded, 8, (item) => canonicalizeOne(item, token));
}
