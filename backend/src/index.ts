import cors from "cors";
import dotenv from "dotenv";
import express, { type Request, type Response } from "express";
import { fileURLToPath } from "node:url";
import {
  deduplicateObservations,
  ebirdGet,
  EbirdError,
  isSpeciesObservation,
  type EbirdObservation,
} from "./ebird.js";
import { fetchInatBirdAbundance, fetchInatBirds, fetchSpeciesReferenceImage } from "./inaturalist.js";
import { identifyBird, type BirdIdProvider } from "./birdId.js";
import { canonicalizeSpecies, type SpeciesIdentityInput } from "./taxonomy.js";
import { fetchSpeciesGuide } from "./speciesGuide.js";
import { readSyncRecord, syncKeyFromSecret, syncStorageConfigured, writeSyncRecord } from "./sync.js";

dotenv.config();
export const app = express();
if (process.env.VERCEL) app.set("trust proxy", 1);
const port = Number(process.env.PORT ?? 4000);
const token = process.env.EBIRD_API_TOKEN;
const configuredProvider = process.env.BIRD_ID_PROVIDER;
const configuredProviderIsValid =
  configuredProvider === "openai" ||
  configuredProvider === "huggingface" ||
  configuredProvider === "gemini" ||
  configuredProvider === "heuristic";
const provider: BirdIdProvider = configuredProviderIsValid
  ? configuredProvider as BirdIdProvider
  : process.env.GEMINI_API_KEY
    ? "gemini"
    : process.env.HUGGINGFACE_API_KEY
      ? "huggingface"
      : "heuristic";
app.use(cors());
app.use(express.json({ limit: "15mb" }));
app.use((request, _response, next) => {
  console.info(`${request.method} ${request.path}`);
  next();
});

let taxonomyCache: { expiresAt: number; data: unknown } | undefined;

function queryNumber(request: Request, key: string, fallback: number): number {
  const value = Number(request.query[key]);
  return Number.isFinite(value) ? value : fallback;
}

function distanceScore(latitude: number, longitude: number, observation: EbirdObservation): number {
  if (typeof observation.lat !== "number" || typeof observation.lng !== "number") return Number.POSITIVE_INFINITY;
  const latDelta = observation.lat - latitude;
  const lngDelta = (observation.lng - longitude) * Math.cos(latitude * Math.PI / 180);
  return latDelta * latDelta + lngDelta * lngDelta;
}

const OBSERVATION_CACHE_TTL_MS = 2 * 60 * 1000;
const OBSERVATION_CACHE_MAX_ENTRIES = 100;
const observationCache = new Map<string, { expiresAt: number; value: unknown }>();
const observationInflight = new Map<string, Promise<unknown>>();

function observationCacheKey(parts: (string | number)[]): string {
  return parts.map((part) => `${part}`).join(":");
}

function readObservationCache<T>(key: string): T | undefined {
  const entry = observationCache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    observationCache.delete(key);
    return undefined;
  }
  return entry.value as T;
}

function writeObservationCache(key: string, value: unknown): void {
  if (observationCache.size >= OBSERVATION_CACHE_MAX_ENTRIES) {
    const now = Date.now();
    for (const [entryKey, entry] of observationCache) {
      if (entry.expiresAt <= now) observationCache.delete(entryKey);
    }
    if (observationCache.size >= OBSERVATION_CACHE_MAX_ENTRIES) observationCache.delete(observationCache.keys().next().value as string);
  }
  observationCache.set(key, { value, expiresAt: Date.now() + OBSERVATION_CACHE_TTL_MS });
}

async function cachedObservationRequest<T>(key: string, load: () => Promise<T>): Promise<T> {
  const cached = readObservationCache<T>(key);
  if (cached !== undefined) return cached;
  const pending = observationInflight.get(key);
  if (pending) return pending as Promise<T>;
  const request = load().then((value) => {
    writeObservationCache(key, value);
    return value;
  }).finally(() => observationInflight.delete(key));
  observationInflight.set(key, request);
  return request;
}

function handleEbirdError(error: unknown, response: Response): void {
  if (error instanceof EbirdError) {
    response.status(error.status).json({ error: error.message, status: error.status });
  } else {
    console.error(error);
    response.status(502).json({ error: "Unable to reach eBird", status: 502 });
  }
}

app.get("/api/health", (_request, response) => response.json({
  status: "ok",
  birdIdentification: {
    provider,
    explicitProvider: configuredProviderIsValid,
    configuredKeys: {
      gemini: Boolean(process.env.GEMINI_API_KEY),
      huggingface: Boolean(process.env.HUGGINGFACE_API_KEY),
      openai: Boolean(process.env.OPENAI_API_KEY),
    },
  },
}));

const IDENTIFY_RATE_WINDOW_MS = 10 * 60 * 1000;
const IDENTIFY_RATE_LIMIT = 30;
const identifyRequests = new Map<string, { count: number; resetAt: number }>();

function identifyRateLimited(request: Request): boolean {
  const ip = request.ip || request.socket.remoteAddress || "unknown";
  const now = Date.now();
  if (identifyRequests.size > 1000) {
    for (const [key, entry] of identifyRequests) {
      if (entry.resetAt <= now) identifyRequests.delete(key);
    }
  }
  const current = identifyRequests.get(ip);
  if (!current || current.resetAt <= now) {
    identifyRequests.set(ip, { count: 1, resetAt: now + IDENTIFY_RATE_WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > IDENTIFY_RATE_LIMIT;
}

async function fetchRecentEbirdObservations(lat: number, lng: number, dist: number, back: number): Promise<EbirdObservation[]> {
  const key = observationCacheKey(["ebird-recent", lat, lng, dist, back]);
  return cachedObservationRequest(key, () => ebirdGet<EbirdObservation[]>(
    `/data/obs/geo/recent?lat=${lat}&lng=${lng}&dist=${dist}&back=${back}`,
    token,
  ));
}

async function fetchRecentInatObservations(lat: number, lng: number, dist: number, back: number): Promise<EbirdObservation[]> {
  const key = observationCacheKey(["inat-recent", lat, lng, dist, back]);
  return cachedObservationRequest(key, () => fetchInatBirds(lat, lng, dist, back));
}

async function fetchNotableEbirdObservations(lat: number, lng: number, dist: number, detail: string): Promise<EbirdObservation[]> {
  const key = observationCacheKey(["ebird-notable", lat, lng, dist, detail]);
  return cachedObservationRequest(key, () => ebirdGet<EbirdObservation[]>(
    `/data/obs/geo/recent/notable?lat=${lat}&lng=${lng}&dist=${dist}&detail=${encodeURIComponent(detail)}`,
    token,
  ));
}

app.get("/api/birds/recent", async (request, response) => {
  const lat = queryNumber(request, "lat", 37.7749);
  const lng = queryNumber(request, "lng", -122.4194);
  const dist = queryNumber(request, "dist", 15);
  const back = queryNumber(request, "back", 14);
  try {
    const [ebirdResult, inatResult] = await Promise.allSettled([
      fetchRecentEbirdObservations(lat, lng, dist, back),
      fetchRecentInatObservations(lat, lng, dist, back),
    ]);
    if (ebirdResult.status === "rejected" && inatResult.status === "rejected") {
      handleEbirdError(ebirdResult.reason, response);
      return;
    }
    if (ebirdResult.status === "rejected") console.warn("eBird recent observations unavailable", ebirdResult.reason);
    if (inatResult.status === "rejected") console.warn("iNaturalist observations unavailable", inatResult.reason);
    const ebirdObservations = ebirdResult.status === "fulfilled"
      ? ebirdResult.value.filter(isSpeciesObservation).map((observation) => ({ ...observation, source: observation.source ?? "ebird" }))
      : [];
    const inatObservations = inatResult.status === "fulfilled" ? inatResult.value : [];
    response.json([...deduplicateObservations(ebirdObservations), ...inatObservations]);
  } catch (error) {
    handleEbirdError(error, response);
  }
});

app.get("/api/birds/abundance", async (request, response) => {
  const lat = queryNumber(request, "lat", 37.7749);
  const lng = queryNumber(request, "lng", -122.4194);
  const dist = queryNumber(request, "dist", 15);
  try {
    response.json(await fetchInatBirdAbundance(lat, lng, dist));
  } catch (error) {
    handleEbirdError(error, response);
  }
});

app.get("/api/birds/notable", async (request, response) => {
  const lat = queryNumber(request, "lat", 37.7749);
  const lng = queryNumber(request, "lng", -122.4194);
  const dist = queryNumber(request, "dist", 25);
  const detail = typeof request.query.detail === "string" ? request.query.detail : "full";
  try {
    const observations = await fetchNotableEbirdObservations(lat, lng, dist, detail);
    const deduplicated = deduplicateObservations(observations);
    deduplicated.sort((left, right) => distanceScore(lat, lng, left) - distanceScore(lat, lng, right));
    response.json(deduplicated);
  } catch (error) {
    handleEbirdError(error, response);
  }
});

app.get("/api/species/guide", async (request, response) => {
  const sciName = typeof request.query.sciName === "string" ? request.query.sciName.trim().slice(0, 160) : undefined;
  const commonName = typeof request.query.commonName === "string" ? request.query.commonName.trim().slice(0, 160) : undefined;
  if (!sciName && !commonName) {
    response.status(400).json({ error: "sciName or commonName is required", status: 400 });
    return;
  }
  try {
    response.json(await fetchSpeciesGuide(sciName || undefined, commonName || undefined));
  } catch (error) {
    console.error(error);
    response.status(502).json({ error: "Unable to load species guide", status: 502 });
  }
});

app.get("/api/taxonomy", async (request, response) => {
  const species = typeof request.query.species === "string" ? request.query.species : undefined;
  try {
    if (!species && taxonomyCache && taxonomyCache.expiresAt > Date.now()) {
      response.json(taxonomyCache.data);
      return;
    }
    const path = `/ref/taxonomy/ebird?fmt=json${species ? `&species=${encodeURIComponent(species)}` : ""}`;
    const data = await ebirdGet<unknown>(path, token);
    if (!species) taxonomyCache = { data, expiresAt: Date.now() + 24 * 60 * 60 * 1000 };
    response.json(data);
  } catch (error) {
    handleEbirdError(error, response);
  }
});

app.post("/api/species/canonical", async (request, response) => {
  const items = (request.body as { items?: unknown })?.items;
  if (!Array.isArray(items)) {
    response.status(400).json({ error: "items array is required", status: 400 });
    return;
  }
  try {
    response.json(await canonicalizeSpecies(items as SpeciesIdentityInput[], token));
  } catch (error) {
    console.error(error);
    response.status(502).json({ error: "Species canonicalization failed", status: 502 });
  }
});

const SYNC_RATE_WINDOW_MS = 10 * 60 * 1000;
const SYNC_RATE_LIMIT = 120;
const SYNC_PAYLOAD_MAX_CHARS = 900_000;
const syncRequests = new Map<string, { count: number; resetAt: number }>();

function syncRateLimited(request: Request): boolean {
  const ip = request.ip || request.socket.remoteAddress || "unknown";
  const now = Date.now();
  if (syncRequests.size > 1000) {
    for (const [key, entry] of syncRequests) {
      if (entry.resetAt <= now) syncRequests.delete(key);
    }
  }
  const current = syncRequests.get(ip);
  if (!current || current.resetAt <= now) {
    syncRequests.set(ip, { count: 1, resetAt: now + SYNC_RATE_WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > SYNC_RATE_LIMIT;
}

function syncSecret(request: Request): string | undefined {
  const header = request.header("authorization");
  const secret = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  return secret && /^[A-Za-z0-9_-]{32,128}$/.test(secret) ? secret : undefined;
}

app.get("/api/sync", async (request, response) => {
  if (syncRateLimited(request)) {
    response.status(429).json({ error: "Too many sync requests. Try again shortly.", status: 429 });
    return;
  }
  const secret = syncSecret(request);
  if (!secret) {
    response.status(401).json({ error: "A valid sync key is required.", status: 401 });
    return;
  }
  if (!syncStorageConfigured()) {
    response.status(503).json({ error: "Cloud sync storage is not configured.", status: 503 });
    return;
  }
  try {
    const record = await readSyncRecord(syncKeyFromSecret(secret));
    if (!record) {
      response.status(404).json({ error: "No cloud backup exists for this sync key.", status: 404 });
      return;
    }
    response.json(record);
  } catch (error) {
    console.error(error);
    response.status(502).json({ error: "Cloud sync read failed.", status: 502 });
  }
});

app.put("/api/sync", async (request, response) => {
  if (syncRateLimited(request)) {
    response.status(429).json({ error: "Too many sync requests. Try again shortly.", status: 429 });
    return;
  }
  const secret = syncSecret(request);
  if (!secret) {
    response.status(401).json({ error: "A valid sync key is required.", status: 401 });
    return;
  }
  if (!syncStorageConfigured()) {
    response.status(503).json({ error: "Cloud sync storage is not configured.", status: 503 });
    return;
  }
  const body = request.body as { payload?: unknown; expectedRevision?: unknown };
  if (typeof body.payload !== "string" || !body.payload) {
    response.status(400).json({ error: "payload is required.", status: 400 });
    return;
  }
  if (body.payload.length > SYNC_PAYLOAD_MAX_CHARS) {
    response.status(413).json({ error: "Sync payload is too large.", status: 413 });
    return;
  }
  if (body.expectedRevision !== undefined && (!Number.isInteger(body.expectedRevision) || Number(body.expectedRevision) < 0)) {
    response.status(400).json({ error: "expectedRevision must be a non-negative integer.", status: 400 });
    return;
  }
  try {
    const key = syncKeyFromSecret(secret);
    const current = await readSyncRecord(key);
    const currentRevision = current?.revision ?? 0;
    if (body.expectedRevision !== undefined && Number(body.expectedRevision) !== currentRevision) {
      response.status(409).json({ error: "Cloud backup changed on another device.", status: 409, currentRevision });
      return;
    }
    const record = { payload: body.payload, revision: currentRevision + 1, updatedAt: new Date().toISOString() };
    await writeSyncRecord(key, record);
    response.json(record);
  } catch (error) {
    console.error(error);
    response.status(502).json({ error: "Cloud sync write failed.", status: 502 });
  }
});

app.post("/api/identify", async (request, response) => {
  if (identifyRateLimited(request)) {
    response.status(429).json({ error: "Too many identification requests. Try again shortly.", status: 429 });
    return;
  }
  const { imageBase64, hints } = request.body as { imageBase64?: unknown; hints?: unknown };
  if (typeof imageBase64 !== "string" || !imageBase64) {
    response.status(400).json({ error: "imageBase64 is required", status: 400 });
    return;
  }
  const validHints = Array.isArray(hints)
    ? hints.filter((hint): hint is string => typeof hint === "string").map((hint) => hint.trim().slice(0, 120)).filter(Boolean).slice(0, 5)
    : [];
  try {
    const identification = await identifyBird(imageBase64, validHints, provider, {
      huggingface: process.env.HUGGINGFACE_API_KEY,
      gemini: process.env.GEMINI_API_KEY,
      openai: process.env.OPENAI_API_KEY,
      huggingfaceModel: process.env.HF_BIRD_MODEL,
      geminiModel: process.env.GEMINI_BIRD_MODEL,
    });
    const [canonical] = await canonicalizeSpecies([{
      commonName: identification.commonName ?? undefined,
      sciName: identification.sciName,
    }], token);
    const referenceImage = await fetchSpeciesReferenceImage(canonical?.canonicalSciName ?? identification.sciName, identification.commonName).catch(() => undefined);
    response.json({
      ...identification,
      canonicalKey: canonical?.canonicalKey,
      canonicalSciName: canonical?.canonicalSciName,
      imageUrl: referenceImage?.url,
      imageAttribution: referenceImage?.attribution,
    });
  } catch (error) {
    console.error(error);
    response.status(502).json({ error: "Bird identification failed", status: 502 });
  }
});

if (!token) console.warn("EBIRD_API_TOKEN is not configured; eBird routes will return 503.");
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  app.listen(port, () => console.info(`BirdGo backend listening on port ${port}`));
}
