import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

export interface SyncRecord {
  payload: string;
  revision: number;
  updatedAt: string;
}

const LOCAL_STORE_FILE = process.env.SYNC_LOCAL_FILE;
const KV_URL = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

async function upstashCommand<T>(command: unknown[]): Promise<T> {
  if (!KV_URL || !KV_TOKEN) throw new Error("Sync storage is not configured.");
  const response = await fetch(KV_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${KV_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(command),
  });
  if (!response.ok) throw new Error(`Sync storage request failed with ${response.status}.`);
  const body = await response.json() as { result?: T; error?: string };
  if (body.error) throw new Error(body.error);
  return body.result as T;
}

async function readLocalStore(): Promise<Record<string, SyncRecord>> {
  if (!LOCAL_STORE_FILE) return {};
  try {
    return JSON.parse(await readFile(LOCAL_STORE_FILE, "utf8")) as Record<string, SyncRecord>;
  } catch {
    return {};
  }
}

async function writeLocalStore(store: Record<string, SyncRecord>): Promise<void> {
  if (!LOCAL_STORE_FILE) throw new Error("Sync storage is not configured.");
  await writeFile(LOCAL_STORE_FILE, JSON.stringify(store), "utf8");
}

export function syncStorageConfigured(): boolean {
  return Boolean(LOCAL_STORE_FILE || (KV_URL && KV_TOKEN));
}

export function syncKeyFromSecret(secret: string): string {
  return `birdgo:sync:v1:${createHash("sha256").update(secret).digest("hex")}`;
}

export async function readSyncRecord(key: string): Promise<SyncRecord | undefined> {
  if (LOCAL_STORE_FILE) return (await readLocalStore())[key];
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

export async function writeSyncRecord(key: string, record: SyncRecord): Promise<void> {
  if (LOCAL_STORE_FILE) {
    const store = await readLocalStore();
    store[key] = record;
    await writeLocalStore(store);
    return;
  }
  await upstashCommand(["SET", key, JSON.stringify(record)]);
}
