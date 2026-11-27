import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

const BACKUP_KEYS = [
  "birdgo.captures",
  "birdgo.seen",
  "birdgo.seen-area",
  "birdgo.xp",
  "birdgo.xp-events",
  "birdgo.xp-bank",
  "birdgo.xp-migrated-v2",
  "birdgo.discovered-species",
  "birdgo.species-capture-count-groups-v1",
  "birdgo.skyfriends-v1",
  "birdgo.trainer-profile-v1",
  "birdgo.ear-training-v1",
  "birdgo.skyfriend-spawn-species-v1",
  "birdgo.skyfriend-fled-v1",
  "birdgo.onboarding-v1",
] as const;

const MAX_BACKUP_BYTES = Platform.OS === "web" ? 4 * 1024 * 1024 : 25 * 1024 * 1024;
const MAX_VALUE_CHARS = 1_500_000;
const keySet = new Set<string>(BACKUP_KEYS);

type BackupEntries = Record<string, string>;

interface BackupFile {
  app: "birdgo";
  kind: "collection-backup";
  version: 1;
  exportedAt: string;
  entries: BackupEntries;
}

function timestampSlug(date = new Date()): string {
  return date.toISOString().slice(0, 19).replace(/[T:]/g, "-");
}

export async function createCollectionBackupJson(): Promise<string> {
  const pairs = await AsyncStorage.multiGet([...BACKUP_KEYS]);
  const entries = Object.fromEntries(pairs.flatMap(([key, value]) => value == null ? [] : [[key, value]]));
  const backup: BackupFile = {
    app: "birdgo",
    kind: "collection-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    entries,
  };
  return JSON.stringify(backup, null, 2);
}

async function downloadBackupWeb(json: string): Promise<void> {
  const documentRef = (globalThis as { document?: any }).document;
  if (!documentRef) throw new Error("Downloads are unavailable on this platform.");
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = documentRef.createElement("a");
  anchor.href = url;
  anchor.download = `birdgo-backup-${timestampSlug()}.json`;
  documentRef.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportCollectionBackup(): Promise<void> {
  const json = await createCollectionBackupJson();
  if (Platform.OS === "web") {
    await downloadBackupWeb(json);
    return;
  }
  const uri = `${FileSystem.cacheDirectory}birdgo-backup-${timestampSlug()}.json`;
  await FileSystem.writeAsStringAsync(uri, json);
  if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing is unavailable on this device.");
  await Sharing.shareAsync(uri, {
    mimeType: "application/json",
    UTI: "public.json",
    dialogTitle: "Export BirdGo backup",
  });
}

function validJsonArray(value: string | undefined): boolean {
  if (value == null) return true;
  try {
    return Array.isArray(JSON.parse(value));
  } catch {
    return false;
  }
}

function validJsonObject(value: string | undefined): boolean {
  if (value == null) return true;
  try {
    const parsed = JSON.parse(value);
    return Boolean(parsed) && typeof parsed === "object" && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

function optionalString(value: unknown, allowNull = false): boolean {
  return value === undefined || (allowNull && value === null) || typeof value === "string";
}

function validCoordinates(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const coordinates = value as Record<string, unknown>;
  return typeof coordinates.latitude === "number"
    && Number.isFinite(coordinates.latitude)
    && typeof coordinates.longitude === "number"
    && Number.isFinite(coordinates.longitude);
}

function validateCaptureList(raw: string | undefined): boolean {
  if (raw == null) return true;
  try {
    const captures = JSON.parse(raw) as unknown[];
    return Array.isArray(captures) && captures.every((capture) => {
      if (!capture || typeof capture !== "object") return false;
      const record = capture as Record<string, unknown>;
      return typeof record.id === "string"
        && typeof record.commonName === "string"
        && typeof record.timestamp === "string"
        && validCoordinates(record.location)
        && optionalString(record.speciesCode)
        && optionalString(record.sciName, true)
        && optionalString(record.canonicalKey)
        && optionalString(record.photoUri)
        && (record.rarity === undefined || ["common", "uncommon", "rare", "epic", "legendary"].includes(String(record.rarity)))
        && (record.verified === undefined || typeof record.verified === "boolean")
        && (record.xpAwarded === undefined || typeof record.xpAwarded === "number");
    });
  } catch {
    return false;
  }
}

function validateSeenSpeciesList(raw: string | undefined): boolean {
  if (raw == null) return true;
  try {
    const seen = JSON.parse(raw) as unknown[];
    return Array.isArray(seen) && seen.every((species) => {
      if (!species || typeof species !== "object") return false;
      const record = species as Record<string, unknown>;
      return typeof record.speciesCode === "string"
        && typeof record.comName === "string"
        && optionalString(record.sciName)
        && optionalString(record.canonicalKey)
        && (record.location === undefined || validCoordinates(record.location));
    });
  } catch {
    return false;
  }
}

export function validateCollectionBackup(json: string): BackupEntries {
  if (json.length > MAX_BACKUP_BYTES) throw new Error("This backup file is too large to restore safely.");
  let parsed: Partial<BackupFile>;
  try {
    parsed = JSON.parse(json) as Partial<BackupFile>;
  } catch {
    throw new Error("This file is not valid JSON.");
  }
  if (parsed.app !== "birdgo" || parsed.kind !== "collection-backup" || parsed.version !== 1) {
    throw new Error("This is not a supported BirdGo backup file.");
  }
  if (!parsed.entries || typeof parsed.entries !== "object" || Array.isArray(parsed.entries)) {
    throw new Error("This backup does not contain restorable collection data.");
  }
  const entries: BackupEntries = {};
  for (const [key, value] of Object.entries(parsed.entries)) {
    if (!keySet.has(key) || typeof value !== "string") throw new Error("This backup contains unsupported or corrupted data.");
    if (value.length > MAX_VALUE_CHARS) throw new Error("This backup contains a record too large for mobile storage.");
    entries[key] = value;
  }
  if (!Object.keys(entries).length) throw new Error("This backup is empty.");
  if (!validateCaptureList(entries["birdgo.captures"])) throw new Error("The capture records in this backup are corrupted.");
  if (!validateSeenSpeciesList(entries["birdgo.seen"])
    || !validJsonArray(entries["birdgo.xp-events"])
    || !validJsonArray(entries["birdgo.discovered-species"])
    || !validJsonArray(entries["birdgo.species-capture-count-groups-v1"])
    || !validJsonArray(entries["birdgo.skyfriends-v1"])) {
    throw new Error("The collection data in this backup is corrupted.");
  }
  if (!validJsonObject(entries["birdgo.trainer-profile-v1"])
    || !validJsonObject(entries["birdgo.ear-training-v1"])
    || !validJsonObject(entries["birdgo.skyfriend-spawn-species-v1"])
    || !validJsonObject(entries["birdgo.skyfriend-fled-v1"])
    || !validJsonObject(entries["birdgo.seen-area"])) {
    throw new Error("The profile or gameplay data in this backup is corrupted.");
  }
  return entries;
}

async function readPickedBackupText(): Promise<string | undefined> {
  const result = await DocumentPicker.getDocumentAsync({
    type: Platform.OS === "web" ? ["application/json", "text/plain"] : "application/json",
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return undefined;
  const asset = result.assets?.[0];
  if (!asset) return undefined;
  if ((asset.size ?? 0) > MAX_BACKUP_BYTES) throw new Error("This backup file is too large to restore safely.");
  if (Platform.OS === "web" && asset.file) return asset.file.text();
  return FileSystem.readAsStringAsync(asset.uri);
}

export async function pickValidatedCollectionBackup(): Promise<BackupEntries | undefined> {
  const text = await readPickedBackupText();
  return text == null ? undefined : validateCollectionBackup(text);
}

export async function restoreCollectionBackup(entries: BackupEntries): Promise<void> {
  const previousPairs = await AsyncStorage.multiGet([...BACKUP_KEYS]);
  const previousEntries = previousPairs.flatMap(([key, value]) => value == null ? [] : [[key, value] as [string, string]]);
  try {
    await AsyncStorage.multiRemove([...BACKUP_KEYS]);
    await AsyncStorage.multiSet(Object.entries(entries));
  } catch (error) {
    await AsyncStorage.multiRemove([...BACKUP_KEYS]).catch(() => undefined);
    if (previousEntries.length) await AsyncStorage.multiSet(previousEntries).catch(() => undefined);
    throw error instanceof Error ? error : new Error("Restore failed before completion.");
  }
}
