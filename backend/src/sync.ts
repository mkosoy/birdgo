import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

export interface SyncRecord {
  payload: string;
  revision: number;
  updatedAt: string;
}

export type SyncWriteResult =
  | { status: "written"; record: SyncRecord }
  | { status: "conflict"; currentRevision: number };

function localStoreFile(): string | undefined {
  return process.env.SYNC_LOCAL_FILE;
}

function kvUrl(): string | undefined {
  return process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
}

function kvToken(): string | undefined {
  return process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
}

async function upstashCommand<T>(command: unknown[]): Promise<T> {
  const url = kvUrl();
  const token = kvToken();
  if (!url || !token) throw new Error("Sync storage is not configured.");
  const response = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(command),
  });
  if (!response.ok) throw new Error(`Sync storage request failed with ${response.status}.`);
  const body = await response.json() as { result?: T; error?: string };
  if (body.error) throw new Error(body.error);
  return body.result as T;
}

async function readLocalStore(): Promise<Record<string, SyncRecord>> {
  const file = localStoreFile();
  if (!file) return {};
  try {
    return JSON.parse(await readFile(file, "utf8")) as Record<string, SyncRecord>;
  } catch {
    return {};
  }
}

async function writeLocalStore(store: Record<string, SyncRecord>): Promise<void> {
  const file = localStoreFile();
  if (!file) throw new Error("Sync storage is not configured.");
  await writeFile(file, JSON.stringify(store), "utf8");
}

let localWriteQueue: Promise<unknown> = Promise.resolve();

function enqueueLocalWrite<T>(operation: () => Promise<T>): Promise<T> {
  const result = localWriteQueue.then(operation, operation);
  localWriteQueue = result.catch(() => undefined);
  return result;
}

const COMPARE_AND_WRITE_SCRIPT = `
local current = redis.call('GET', KEYS[1])
local revision = 0
if current then
  local ok, decoded = pcall(cjson.decode, current)
  if ok and type(decoded) == 'table' and type(decoded.revision) == 'number' then
    revision = decoded.revision
  end
end
if revision ~= tonumber(ARGV[1]) then
  return {0, revision}
end
local nextRevision = revision + 1
local record = cjson.encode({ payload = ARGV[2], revision = nextRevision, updatedAt = ARGV[3] })
redis.call('SET', KEYS[1], record)
return {1, nextRevision}
`;

export function syncStorageConfigured(): boolean {
  return Boolean(localStoreFile() || (kvUrl() && kvToken()));
}

export function syncKeyFromSecret(secret: string): string {
  return `birdgo:sync:v1:${createHash("sha256").update(secret).digest("hex")}`;
}

export async function readSyncRecord(key: string): Promise<SyncRecord | undefined> {
  if (localStoreFile()) return (await readLocalStore())[key];
  const raw = await upstashCommand<string | null>(["GET", key]);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Partial<SyncRecord>;
    if (typeof parsed.payload !== "string" || typeof parsed.revision !== "number" || typeof parsed.updatedAt !== "string") return undefined;
    return parsed as SyncRecord;
  } catch {
    return undefined;
  }
}

export async function writeSyncRecordIfRevision(key: string, payload: string, expectedRevision: number): Promise<SyncWriteResult> {
  const updatedAt = new Date().toISOString();
  if (localStoreFile()) {
    return enqueueLocalWrite(async () => {
      const store = await readLocalStore();
      const currentRevision = store[key]?.revision ?? 0;
      if (currentRevision !== expectedRevision) return { status: "conflict", currentRevision };
      const record = { payload, revision: currentRevision + 1, updatedAt };
      store[key] = record;
      await writeLocalStore(store);
      return { status: "written", record };
    });
  }
  const result = await upstashCommand<[number, number]>([
    "EVAL",
    COMPARE_AND_WRITE_SCRIPT,
    1,
    key,
    expectedRevision,
    payload,
    updatedAt,
  ]);
  const [written, revision] = result;
  if (!written) return { status: "conflict", currentRevision: revision };
  return { status: "written", record: { payload, revision, updatedAt } };
}
