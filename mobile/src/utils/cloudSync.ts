import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { XChaCha20Poly1305 } from "@stablelib/xchacha20poly1305";
import { gzip, ungzip } from "pako";
import { decode as decodeUtf8, encode as encodeUtf8 } from "@stablelib/utf8";
import { API_BASE_URL } from "../config";
import { createCollectionBackupJson, PORTABLE_BACKUP_MAX_BYTES, restoreCollectionBackup, validateCollectionBackup } from "./collectionBackup";

const SYNC_KEY_STORAGE_KEY = "birdgo.cloud-sync-key-v1";
const SYNC_REVISION_STORAGE_KEY = "birdgo.cloud-sync-revision-v1";
const AUTOMATIC_BACKUP_DIRTY_KEY = "birdgo.cloud-sync-pending-v1";
const BASE64URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const SYNC_AAD = encodeUtf8("birdgo-sync-v1");

interface EncryptedSyncEnvelope {
  app: "birdgo";
  kind: "encrypted-collection-backup";
  version: 1;
  algorithm: "xchacha20poly1305";
  compression?: "gzip";
  nonce: string;
  ciphertext: string;
}

export interface CloudSyncRecord {
  payload: string;
  revision: number;
  updatedAt: string;
}

export interface CloudSyncCredentials {
  key: string;
  revision: number;
}

export class CloudSyncError extends Error {
  status: number;
  currentRevision?: number;

  constructor(message: string, status: number, currentRevision?: number) {
    super(message);
    this.status = status;
    this.currentRevision = currentRevision;
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = index + 1 < bytes.length ? bytes[index + 1] : undefined;
    const third = index + 2 < bytes.length ? bytes[index + 2] : undefined;
    output += BASE64URL_ALPHABET[first >> 2];
    output += BASE64URL_ALPHABET[((first & 3) << 4) | ((second ?? 0) >> 4)];
    if (second !== undefined) output += BASE64URL_ALPHABET[((second & 15) << 2) | ((third ?? 0) >> 6)];
    if (third !== undefined) output += BASE64URL_ALPHABET[third & 63];
  }
  return output;
}

function base64UrlToBytes(value: string): Uint8Array | undefined {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) return undefined;
  const output: number[] = [];
  for (let index = 0; index < value.length; index += 4) {
    const chars = [value[index], value[index + 1], value[index + 2], value[index + 3]];
    const values = chars.map((char) => char === undefined ? 0 : BASE64URL_ALPHABET.indexOf(char));
    if (values.some((entry, entryIndex) => entry < 0 && chars[entryIndex] !== undefined)) return undefined;
    const combined = (values[0] << 18) | (values[1] << 12) | (values[2] << 6) | values[3];
    output.push((combined >> 16) & 255);
    if (chars[2] !== undefined) output.push((combined >> 8) & 255);
    if (chars[3] !== undefined) output.push(combined & 255);
  }
  return new Uint8Array(output);
}

function validSyncKey(key: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(key) && base64UrlToBytes(key)?.length === 32;
}

export async function generateCloudSyncKey(): Promise<string> {
  return bytesToBase64Url(await Crypto.getRandomBytesAsync(32));
}

export function normalizeCloudSyncKey(key: string): string {
  return key.trim().replace(/\s+/g, "");
}

export function isCloudSyncKeyValid(key: string): boolean {
  return validSyncKey(normalizeCloudSyncKey(key));
}

async function encryptBackupJson(json: string, key: string): Promise<string> {
  const keyBytes = base64UrlToBytes(key);
  if (!keyBytes || keyBytes.length !== 32) throw new Error("This sync key is invalid.");
  const nonce = await Crypto.getRandomBytesAsync(24);
  const cipher = new XChaCha20Poly1305(keyBytes);
  const ciphertext = cipher.seal(nonce, gzip(encodeUtf8(json)), SYNC_AAD);
  cipher.clean();
  const envelope: EncryptedSyncEnvelope = {
    app: "birdgo",
    kind: "encrypted-collection-backup",
    version: 1,
    algorithm: "xchacha20poly1305",
    compression: "gzip",
    nonce: bytesToBase64Url(nonce),
    ciphertext: bytesToBase64Url(ciphertext),
  };
  return JSON.stringify(envelope);
}

function parseEncryptedEnvelope(payload: string): EncryptedSyncEnvelope {
  let parsed: Partial<EncryptedSyncEnvelope>;
  try {
    parsed = JSON.parse(payload) as Partial<EncryptedSyncEnvelope>;
  } catch {
    throw new Error("The cloud backup is corrupted.");
  }
  if (parsed.app !== "birdgo"
    || parsed.kind !== "encrypted-collection-backup"
    || parsed.version !== 1
    || parsed.algorithm !== "xchacha20poly1305"
    || (parsed.compression !== undefined && parsed.compression !== "gzip")
    || typeof parsed.nonce !== "string"
    || typeof parsed.ciphertext !== "string") {
    throw new Error("This is not a supported encrypted BirdGo backup.");
  }
  return parsed as EncryptedSyncEnvelope;
}

function decryptBackupPayload(payload: string, key: string): string {
  const keyBytes = base64UrlToBytes(key);
  if (!keyBytes || keyBytes.length !== 32) throw new Error("This sync key is invalid.");
  const envelope = parseEncryptedEnvelope(payload);
  const nonce = base64UrlToBytes(envelope.nonce);
  const ciphertext = base64UrlToBytes(envelope.ciphertext);
  if (!nonce || nonce.length !== 24 || !ciphertext) throw new Error("The encrypted cloud backup is corrupted.");
  const cipher = new XChaCha20Poly1305(keyBytes);
  const plaintext = cipher.open(nonce, ciphertext, SYNC_AAD);
  cipher.clean();
  if (!plaintext) throw new Error("This sync key cannot decrypt the cloud backup.");
  const backupBytes = envelope.compression === "gzip" ? ungzip(plaintext) : plaintext;
  return decodeUtf8(backupBytes);
}

async function cloudAccessToken(key: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `birdgo-cloud-access-v1:${key}`);
}

async function cloudSyncRequest<T>(path: string, key: string, options: RequestInit = {}): Promise<T> {
  const accessToken = await cloudAccessToken(key);
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}`, ...options.headers },
  });
  const body = await response.json().catch(() => ({})) as T & { error?: string; currentRevision?: number };
  if (!response.ok) throw new CloudSyncError(body.error ?? `Cloud sync failed (${response.status})`, response.status, body.currentRevision);
  return body;
}

export async function fetchCloudSyncEnabled(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/sync/status`);
    if (!response.ok) return false;
    const body = await response.json() as { enabled?: boolean };
    return body.enabled === true;
  } catch {
    return false;
  }
}

export async function readCloudSyncRecord(key: string): Promise<CloudSyncRecord | undefined> {
  try {
    return await cloudSyncRequest<CloudSyncRecord>("/api/sync", key);
  } catch (error) {
    if (error instanceof CloudSyncError && error.status === 404) return undefined;
    throw error;
  }
}

async function writeCloudSyncRecord(key: string, payload: string, expectedRevision: number): Promise<CloudSyncRecord> {
  return cloudSyncRequest<CloudSyncRecord>("/api/sync", key, {
    method: "PUT",
    body: JSON.stringify({ payload, expectedRevision }),
  });
}


export interface AutomaticCloudBackupState {
  pending: boolean;
  running: boolean;
  conflict: boolean;
  error?: string;
  lastSyncedAt?: string;
  revision?: number;
}

type AutomaticCloudBackupListener = (state: AutomaticCloudBackupState) => void;

const automaticBackupListeners = new Set<AutomaticCloudBackupListener>();
let automaticBackupState: AutomaticCloudBackupState = { pending: false, running: false, conflict: false };
let automaticBackupTimer: ReturnType<typeof setTimeout> | undefined;
let automaticBackupPaused = false;
let cloudUploadQueue: Promise<unknown> = Promise.resolve();

function updateAutomaticBackupState(update: Partial<AutomaticCloudBackupState>): void {
  automaticBackupState = { ...automaticBackupState, ...update };
  automaticBackupListeners.forEach((listener) => listener(automaticBackupState));
}

export function subscribeAutomaticCloudBackup(listener: AutomaticCloudBackupListener): () => void {
  automaticBackupListeners.add(listener);
  listener(automaticBackupState);
  return () => automaticBackupListeners.delete(listener);
}

function enqueueCloudUpload<T>(operation: () => Promise<T>): Promise<T> {
  const result = cloudUploadQueue.then(operation, operation);
  cloudUploadQueue = result.catch(() => undefined);
  return result;
}

export async function uploadLatestEncryptedCloudBackup(): Promise<CloudSyncRecord | undefined> {
  return enqueueCloudUpload(async () => {
    const credentials = await loadCloudSyncCredentials();
    if (!credentials) return undefined;
    const record = await uploadEncryptedCloudBackup(credentials.key, credentials.revision);
    await saveCloudSyncCredentials(credentials.key, record.revision);
    await AsyncStorage.removeItem(AUTOMATIC_BACKUP_DIRTY_KEY).catch(() => undefined);
    return record;
  });
}

async function runAutomaticCloudBackup(): Promise<void> {
  updateAutomaticBackupState({ pending: false, running: true });
  try {
    const record = await uploadLatestEncryptedCloudBackup();
    updateAutomaticBackupState({
      running: false,
      error: undefined,
      lastSyncedAt: record?.updatedAt ?? automaticBackupState.lastSyncedAt,
      revision: record?.revision ?? automaticBackupState.revision,
    });
  } catch (error) {
    if (error instanceof CloudSyncError && error.status === 409) {
      automaticBackupPaused = true;
      updateAutomaticBackupState({ running: false, conflict: true, error: undefined });
      return;
    }
    updateAutomaticBackupState({
      running: false,
      error: error instanceof Error ? error.message : "Automatic cloud backup failed.",
    });
  }
}

export function reconcileAutomaticCloudBackup(revision: number): void {
  automaticBackupPaused = false;
  updateAutomaticBackupState({ conflict: false, error: undefined, revision });
}

export async function resumePendingAutomaticCloudBackup(): Promise<boolean> {
  const pending = await AsyncStorage.getItem(AUTOMATIC_BACKUP_DIRTY_KEY).catch(() => null);
  if (pending !== "1") return false;
  scheduleAutomaticCloudBackup();
  return true;
}

export function scheduleAutomaticCloudBackup(): void {
  if (automaticBackupPaused) return;
  if (automaticBackupTimer) clearTimeout(automaticBackupTimer);
  void AsyncStorage.setItem(AUTOMATIC_BACKUP_DIRTY_KEY, "1").catch(() => undefined);
  updateAutomaticBackupState({ pending: true, error: undefined });
  automaticBackupTimer = setTimeout(() => {
    automaticBackupTimer = undefined;
    void runAutomaticCloudBackup();
  }, 12_000);
}

export async function uploadEncryptedCloudBackup(key: string, expectedRevision: number): Promise<CloudSyncRecord> {
  const backupJson = await createCollectionBackupJson();
  if (backupJson.length > PORTABLE_BACKUP_MAX_BYTES) {
    throw new Error("This collection is too large for cross-device cloud backup right now. Export a local backup file instead.");
  }
  const encryptedPayload = await encryptBackupJson(backupJson, key);
  return writeCloudSyncRecord(key, encryptedPayload, expectedRevision);
}

export async function downloadEncryptedCloudBackup(key: string): Promise<{ entries: Record<string, string>; record: CloudSyncRecord } | undefined> {
  const record = await readCloudSyncRecord(key);
  if (!record) return undefined;
  const backupJson = decryptBackupPayload(record.payload, key);
  return { entries: validateCollectionBackup(backupJson), record };
}

export async function restoreEncryptedCloudBackup(key: string): Promise<CloudSyncRecord | undefined> {
  return enqueueCloudUpload(async () => {
    const downloaded = await downloadEncryptedCloudBackup(key);
    if (!downloaded) return undefined;
    await restoreCollectionBackup(downloaded.entries);
    await saveCloudSyncCredentials(key, downloaded.record.revision);
    return downloaded.record;
  });
}

export async function loadCloudSyncCredentials(): Promise<CloudSyncCredentials | undefined> {
  const key = Platform.OS === "web"
    ? await AsyncStorage.getItem(SYNC_KEY_STORAGE_KEY)
    : await SecureStore.getItemAsync(SYNC_KEY_STORAGE_KEY);
  if (!key || !validSyncKey(key)) return undefined;
  const rawRevision = await AsyncStorage.getItem(SYNC_REVISION_STORAGE_KEY);
  const revision = rawRevision ? Number(rawRevision) : 0;
  return { key, revision: Number.isInteger(revision) && revision >= 0 ? revision : 0 };
}

export async function saveCloudSyncCredentials(key: string, revision: number): Promise<void> {
  if (!validSyncKey(key)) throw new Error("This sync key is invalid.");
  if (Platform.OS === "web") await AsyncStorage.setItem(SYNC_KEY_STORAGE_KEY, key);
  else await SecureStore.setItemAsync(SYNC_KEY_STORAGE_KEY, key);
  await AsyncStorage.setItem(SYNC_REVISION_STORAGE_KEY, String(revision));
}

export async function clearCloudSyncCredentials(): Promise<void> {
  if (Platform.OS === "web") await AsyncStorage.removeItem(SYNC_KEY_STORAGE_KEY);
  else await SecureStore.deleteItemAsync(SYNC_KEY_STORAGE_KEY);
  await AsyncStorage.removeItem(SYNC_REVISION_STORAGE_KEY);
}
