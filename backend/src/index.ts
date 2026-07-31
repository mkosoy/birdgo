import cors from "cors";
import dotenv from "dotenv";
import express, { type Request, type Response } from "express";
import { fileURLToPath } from "node:url";
import {
  deduplicateObservations,
  ebirdGet,
  EbirdError,
  type EbirdObservation,
} from "./ebird.js";
import { identifyBird, type BirdIdProvider } from "./birdId.js";

dotenv.config();
export const app = express();
const port = Number(process.env.PORT ?? 4000);
const token = process.env.EBIRD_API_TOKEN;
const configuredProvider = process.env.BIRD_ID_PROVIDER;
const provider: BirdIdProvider =
  configuredProvider === "openai" ||
  configuredProvider === "huggingface" ||
  configuredProvider === "gemini"
    ? configuredProvider
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

function handleEbirdError(error: unknown, response: Response): void {
  if (error instanceof EbirdError) {
    response.status(error.status).json({ error: error.message, status: error.status });
  } else {
    console.error(error);
    response.status(502).json({ error: "Unable to reach eBird", status: 502 });
  }
}

app.get("/api/health", (_request, response) => response.json({ status: "ok" }));

app.get("/api/birds/recent", async (request, response) => {
  const lat = queryNumber(request, "lat", 37.7749);
  const lng = queryNumber(request, "lng", -122.4194);
  const dist = queryNumber(request, "dist", 10);
  const back = queryNumber(request, "back", 7);
  try {
    const observations = await ebirdGet<EbirdObservation[]>(
      `/data/obs/geo/recent?lat=${lat}&lng=${lng}&dist=${dist}&back=${back}`,
      token,
    );
    response.json(deduplicateObservations(observations));
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
    const observations = await ebirdGet<EbirdObservation[]>(
      `/data/obs/geo/recent/notable?lat=${lat}&lng=${lng}&dist=${dist}&detail=${encodeURIComponent(detail)}`,
      token,
    );
    response.json(observations);
  } catch (error) {
    handleEbirdError(error, response);
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

app.post("/api/identify", async (request, response) => {
  const { imageBase64, hints } = request.body as { imageBase64?: unknown; hints?: unknown };
  if (typeof imageBase64 !== "string" || !imageBase64) {
    response.status(400).json({ error: "imageBase64 is required", status: 400 });
    return;
  }
  const validHints = Array.isArray(hints) ? hints.filter((hint): hint is string => typeof hint === "string") : [];
  try {
    response.json(await identifyBird(imageBase64, validHints, provider, {
      huggingface: process.env.HUGGINGFACE_API_KEY,
      gemini: process.env.GEMINI_API_KEY,
      openai: process.env.OPENAI_API_KEY,
      huggingfaceModel: process.env.HF_BIRD_MODEL,
    }));
  } catch (error) {
    console.error(error);
    response.status(502).json({ error: "Bird identification failed", status: 502 });
  }
});

if (!token) console.warn("EBIRD_API_TOKEN is not configured; eBird routes will return 503.");
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  app.listen(port, () => console.info(`BirdGo backend listening on port ${port}`));
}
