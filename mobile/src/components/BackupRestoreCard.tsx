import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Clipboard from "expo-clipboard";
import { exportCollectionBackup, pickValidatedCollectionBackup, restoreCollectionBackup } from "../utils/collectionBackup";
import { notifyCollectionChanged } from "../utils/collectionEvents";
import {
  CloudSyncError,
  fetchCloudSyncEnabled,
  generateCloudSyncKey,
  isCloudSyncKeyValid,
  loadCloudSyncCredentials,
  normalizeCloudSyncKey,
  readCloudSyncRecord,
  reconcileAutomaticCloudBackup,
  restoreEncryptedCloudBackup,
  saveCloudSyncCredentials,
  subscribeAutomaticCloudBackup,
  uploadEncryptedCloudBackup,
  uploadLatestEncryptedCloudBackup,
} from "../utils/cloudSync";

type BusyAction = "export" | "import" | "cloud-enable" | "cloud-upload" | "cloud-restore" | null;

export function BackupRestoreCard({ onRestored }: { onRestored: () => void }) {
  const [busy, setBusy] = useState<BusyAction>(null);
  const [confirmingImport, setConfirmingImport] = useState(false);
  const [confirmingCloudRestore, setConfirmingCloudRestore] = useState(false);
  const [linkingCloud, setLinkingCloud] = useState(false);
  const [syncKeyDraft, setSyncKeyDraft] = useState("");
  const [cloudAvailable, setCloudAvailable] = useState(false);
  const [cloudKey, setCloudKey] = useState<string>();
  const [cloudRevision, setCloudRevision] = useState(0);
  const [remoteCloudRevision, setRemoteCloudRevision] = useState<number>();
  const [restoreTargetRevision, setRestoreTargetRevision] = useState<number>();
  const [showSyncKey, setShowSyncKey] = useState(false);
  const [message, setMessage] = useState<string>();
  const [messageTone, setMessageTone] = useState<"good" | "bad">("good");
  const [automaticBackup, setAutomaticBackup] = useState({ pending: false, running: false, conflict: false } as { pending: boolean; running: boolean; conflict: boolean; error?: string; lastSyncedAt?: string; revision?: number });

  useEffect(() => subscribeAutomaticCloudBackup((state) => {
    setAutomaticBackup(state);
    if (state.revision !== undefined) setCloudRevision(state.revision);
  }), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [enabled, credentials] = await Promise.all([fetchCloudSyncEnabled(), loadCloudSyncCredentials()]);
      if (cancelled) return;
      setCloudAvailable(enabled);
      if (!credentials) return;
      setCloudKey(credentials.key);
      setCloudRevision(credentials.revision);
      if (!enabled) return;
      const remote = await readCloudSyncRecord(credentials.key).catch(() => undefined);
      if (!cancelled) setRemoteCloudRevision(remote?.revision);
    })().catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const showMessage = (text: string, tone: "good" | "bad" = "good") => {
    setMessage(text);
    setMessageTone(tone);
  };

  const cloudErrorMessage = (error: unknown, fallback: string): string => {
    if (error instanceof CloudSyncError) {
      if (error.status === 409) return "Cloud backup changed on another device. Export a local backup first if this device has newer captures, then restore the latest cloud backup before overwriting it.";
      if (error.status === 503) return "Cloud sync storage is not configured yet.";
      return error.message;
    }
    return error instanceof Error ? error.message : fallback;
  };

  const runExport = async () => {
    if (busy) return;
    setBusy("export");
    setMessage(undefined);
    try {
      await exportCollectionBackup();
      showMessage("Backup exported. Keep the JSON file somewhere private.");
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Backup export failed.", "bad");
    } finally {
      setBusy(null);
    }
  };

  const runImport = async () => {
    if (busy) return;
    setBusy("import");
    setMessage(undefined);
    try {
      const entries = await pickValidatedCollectionBackup();
      if (!entries) {
        showMessage("Import canceled.");
        return;
      }
      await restoreCollectionBackup(entries);
      notifyCollectionChanged();
      setConfirmingImport(false);
      onRestored();
      showMessage("Backup restored on this device.");
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Backup import failed.", "bad");
    } finally {
      setBusy(null);
    }
  };

  const uploadCloud = async (key: string, expectedRevision: number, successCopy: string) => {
    const record = await uploadEncryptedCloudBackup(key, expectedRevision);
    await saveCloudSyncCredentials(key, record.revision);
    setCloudKey(key);
    setCloudRevision(record.revision);
    setRemoteCloudRevision(record.revision);
    showMessage(successCopy.replace("{revision}", String(record.revision)));
  };

  const copySyncKey = async () => {
    if (!cloudKey) return;
    try {
      const copied = await Clipboard.setStringAsync(cloudKey);
      if (copied === false) throw new Error("copy failed");
      showMessage("Private sync key copied. Store it somewhere safe and do not share it publicly.");
    } catch {
      showMessage("Copy failed. Select the key text above and copy it manually before leaving setup.", "bad");
    }
  };

  const enableCloudSync = async () => {
    if (busy) return;
    setBusy("cloud-enable");
    setMessage(undefined);
    try {
      const key = await generateCloudSyncKey();
      await uploadCloud(key, 0, "Encrypted cloud backup saved · revision {revision}. Save your private sync key below before switching devices.");
      setShowSyncKey(true);
    } catch (error) {
      showMessage(cloudErrorMessage(error, "Cloud sync setup failed."), "bad");
    } finally {
      setBusy(null);
    }
  };

  const uploadExistingCloud = async () => {
    if (busy || !cloudKey) return;
    setBusy("cloud-upload");
    setMessage(undefined);
    try {
      const record = await uploadLatestEncryptedCloudBackup();
      if (!record) throw new Error("Cloud sync is not set up on this device yet.");
      setCloudRevision(record.revision);
      setRemoteCloudRevision(record.revision);
      showMessage(`Encrypted cloud backup updated · revision ${record.revision}.`);
    } catch (error) {
      showMessage(cloudErrorMessage(error, "Cloud backup failed."), "bad");
    } finally {
      setBusy(null);
    }
  };

  const restoreCloud = async (key: string, targetRevision?: number) => {
    const record = await restoreEncryptedCloudBackup(key, targetRevision);
    if (!record) throw new Error("No encrypted cloud backup exists for this sync key yet.");
    reconcileAutomaticCloudBackup(record.revision);
    setCloudKey(key);
    setCloudRevision(record.revision);
    setRemoteCloudRevision(record.revision);
    setConfirmingCloudRestore(false);
    setRestoreTargetRevision(undefined);
    setLinkingCloud(false);
    setSyncKeyDraft("");
    onRestored();
    showMessage(`Encrypted cloud backup restored · revision ${record.revision}.`);
  };

  const runCloudRestore = async (key?: string) => {
    const targetKey = key ?? cloudKey;
    if (busy || !targetKey) return;
    setBusy("cloud-restore");
    setMessage(undefined);
    try {
      await restoreCloud(targetKey, key ? undefined : restoreTargetRevision);
    } catch (error) {
      showMessage(cloudErrorMessage(error, "Cloud restore failed."), "bad");
    } finally {
      setBusy(null);
    }
  };

  const linkCloudKey = () => {
    const normalized = normalizeCloudSyncKey(syncKeyDraft);
    if (!isCloudSyncKeyValid(normalized)) {
      showMessage("Enter the full 43-character sync key from your other device.", "bad");
      return;
    }
    void runCloudRestore(normalized);
  };

  const cloudConfigured = Boolean(cloudKey);
  const newerCloudBackup = remoteCloudRevision !== undefined && remoteCloudRevision > cloudRevision;

  return <View style={styles.card}>
    <View style={styles.titleRow}>
      <View style={styles.iconWrap}><Ionicons name="cloud-download-outline" size={17} color="#235040" /></View>
      <View style={styles.copyWrap}>
        <Text style={styles.title}>Collection backup</Text>
        <Text style={styles.copy}>Export or restore species records, journal metadata, XP, Skyfriends, and trainer identity. Photo image files are not included yet.</Text>
      </View>
    </View>
    {!confirmingImport ? <View style={styles.actions}>
      <Pressable accessibilityRole="button" accessibilityLabel="Export BirdGo backup" disabled={Boolean(busy)} style={[styles.button, styles.exportButton, Boolean(busy) && styles.buttonDisabled]} onPress={() => void runExport()}>
        {busy === "export" ? <ActivityIndicator size="small" color="#ffffff" /> : <Text style={styles.exportText}>Export</Text>}
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Import BirdGo backup" disabled={Boolean(busy)} style={[styles.button, styles.importButton, Boolean(busy) && styles.buttonDisabled]} onPress={() => { setMessage(undefined); setConfirmingImport(true); }}>
        <Text style={styles.importText}>Import</Text>
      </Pressable>
    </View> : <View style={styles.confirmArea}>
      <Text style={styles.confirmCopy}>Importing replaces BirdGo collection data currently stored on this device.</Text>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cancel backup import" disabled={Boolean(busy)} style={[styles.button, styles.cancelButton]} onPress={() => setConfirmingImport(false)}><Text style={styles.cancelText}>Cancel</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Choose backup file and replace device data" disabled={Boolean(busy)} style={[styles.button, styles.importButton, Boolean(busy) && styles.buttonDisabled]} onPress={() => void runImport()}>
          {busy === "import" ? <ActivityIndicator size="small" color="#235040" /> : <Text style={styles.importText}>Choose file</Text>}
        </Pressable>
      </View>
    </View>}

    {cloudAvailable ? <View style={styles.cloudSection}>
      <View style={styles.cloudTitleRow}>
        <Ionicons name="shield-checkmark-outline" size={15} color="#235040" />
        <Text style={styles.cloudTitle}>Encrypted cloud backup</Text>
      </View>
      <Text style={styles.copy}>Your backup is encrypted on this device before upload. Anyone with your private sync key can restore it, so keep that key secret.</Text>

      {!cloudConfigured && !linkingCloud ? <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel="Enable encrypted cloud sync" disabled={Boolean(busy)} style={[styles.button, styles.exportButton, Boolean(busy) && styles.buttonDisabled]} onPress={() => void enableCloudSync()}>
          {busy === "cloud-enable" ? <ActivityIndicator size="small" color="#ffffff" /> : <Text style={styles.exportText}>Enable</Text>}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Use an existing cloud sync key" disabled={Boolean(busy)} style={[styles.button, styles.importButton, Boolean(busy) && styles.buttonDisabled]} onPress={() => { setMessage(undefined); setLinkingCloud(true); }}>
          <Text style={styles.importText}>Use key</Text>
        </Pressable>
      </View> : null}

      {cloudConfigured && !confirmingCloudRestore ? <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back up collection to encrypted cloud sync" disabled={Boolean(busy)} style={[styles.button, styles.exportButton, Boolean(busy) && styles.buttonDisabled]} onPress={() => void uploadExistingCloud()}>
          {busy === "cloud-upload" ? <ActivityIndicator size="small" color="#ffffff" /> : <Text style={styles.exportText}>Back up now</Text>}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Restore encrypted cloud backup" disabled={Boolean(busy)} style={[styles.button, styles.importButton, Boolean(busy) && styles.buttonDisabled]} onPress={() => { setMessage(undefined); setRestoreTargetRevision(remoteCloudRevision ?? cloudRevision); setConfirmingCloudRestore(true); }}>
          <Text style={styles.importText}>Restore</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Show private cloud sync key" disabled={Boolean(busy)} style={[styles.button, styles.cancelButton, Boolean(busy) && styles.buttonDisabled]} onPress={() => setShowSyncKey((current) => !current)}>
          <Text style={styles.cancelText}>{showSyncKey ? "Hide key" : "Key"}</Text>
        </Pressable>
      </View> : null}

      {cloudConfigured ? <Text style={styles.revisionText}>Cloud revision {cloudRevision} on this device</Text> : null}
      {newerCloudBackup ? <Text style={styles.autoConflictText}>Newer encrypted cloud backup found · revision {remoteCloudRevision}. Export local data first if needed, then restore before backing up.</Text> : null}
      {cloudConfigured && automaticBackup.conflict ? <Text style={styles.autoConflictText}>Automatic backup paused — cloud data changed on another device.</Text> : null}
      {cloudConfigured && !automaticBackup.conflict && (automaticBackup.pending || automaticBackup.running) ? <Text style={styles.revisionText}>{automaticBackup.running ? "Automatic cloud backup updating…" : "Automatic cloud backup queued…"}</Text> : null}
      {cloudConfigured && !automaticBackup.conflict && automaticBackup.error ? <Text style={styles.autoConflictText}>Automatic backup failed and will retry after the next collection change.</Text> : null}
      {cloudConfigured && !automaticBackup.conflict && !automaticBackup.pending && !automaticBackup.running && !automaticBackup.error && automaticBackup.lastSyncedAt ? <Text style={styles.revisionText}>Automatic cloud backup is up to date.</Text> : null}

      {confirmingCloudRestore ? <View style={styles.confirmArea}>
        <Text style={styles.confirmCopy}>Restoring{restoreTargetRevision ? ` revision ${restoreTargetRevision}` : ""} replaces BirdGo collection data currently stored on this device.</Text>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel cloud restore" disabled={Boolean(busy)} style={[styles.button, styles.cancelButton]} onPress={() => { setConfirmingCloudRestore(false); setRestoreTargetRevision(undefined); }}><Text style={styles.cancelText}>Cancel</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Download encrypted cloud backup and replace device data" disabled={Boolean(busy)} style={[styles.button, styles.importButton, Boolean(busy) && styles.buttonDisabled]} onPress={() => void runCloudRestore()}>
            {busy === "cloud-restore" ? <ActivityIndicator size="small" color="#235040" /> : <Text style={styles.importText}>Download</Text>}
          </Pressable>
        </View>
      </View> : null}

      {linkingCloud ? <View style={styles.linkArea}>
        <Text style={styles.confirmCopy}>Paste the private sync key from your other device. Downloading replaces collection data currently stored here.</Text>
        <TextInput value={syncKeyDraft} onChangeText={setSyncKeyDraft} autoCapitalize="none" autoCorrect={false} placeholder="43-character sync key" style={styles.keyInput} />
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel cloud sync key entry" disabled={Boolean(busy)} style={[styles.button, styles.cancelButton]} onPress={() => { setLinkingCloud(false); setSyncKeyDraft(""); }}><Text style={styles.cancelText}>Cancel</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Download encrypted cloud backup with sync key" disabled={Boolean(busy)} style={[styles.button, styles.importButton, Boolean(busy) && styles.buttonDisabled]} onPress={linkCloudKey}>
            {busy === "cloud-restore" ? <ActivityIndicator size="small" color="#235040" /> : <Text style={styles.importText}>Download</Text>}
          </Pressable>
        </View>
      </View> : null}

      {showSyncKey && cloudKey ? <View style={styles.linkArea}>
        <Text style={styles.confirmCopy}>Private sync key — copy it somewhere safe. Anyone with it can restore this collection.</Text>
        <TextInput value={cloudKey} editable={false} selectTextOnFocus autoCapitalize="none" autoCorrect={false} style={styles.keyInput} />
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel="Copy private cloud sync key" style={[styles.button, styles.importButton]} onPress={() => void copySyncKey()}>
            <Text style={styles.importText}>Copy key</Text>
          </Pressable>
        </View>
      </View> : null}
    </View> : null}

    {message ? <Text style={[styles.message, messageTone === "bad" && styles.messageBad]}>{message}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  card: { margin: 5, marginBottom: 16, padding: 14, borderRadius: 18, backgroundColor: "#f5f0df", borderWidth: 1, borderColor: "#e3d7b7" },
  titleRow: { flexDirection: "row", gap: 10 },
  iconWrap: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "#e7ddb9" },
  copyWrap: { flex: 1, minWidth: 0 },
  title: { color: "#3d3419", fontSize: 15, fontWeight: "900" },
  copy: { color: "#74683f", fontSize: 11, lineHeight: 15, marginTop: 3 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 11 },
  button: { minHeight: 38, minWidth: 86, borderRadius: 11, alignItems: "center", justifyContent: "center", paddingHorizontal: 13 },
  exportButton: { backgroundColor: "#2f7d5b" },
  importButton: { backgroundColor: "#e8dcc0" },
  cancelButton: { backgroundColor: "#f7f2e5" },
  buttonDisabled: { opacity: 0.6 },
  exportText: { color: "#ffffff", fontSize: 12, fontWeight: "900" },
  importText: { color: "#235040", fontSize: 12, fontWeight: "900" },
  cancelText: { color: "#6d6241", fontSize: 12, fontWeight: "900" },
  confirmArea: { marginTop: 2 },
  confirmCopy: { color: "#814f2d", fontSize: 11, lineHeight: 15, fontWeight: "700" },
  cloudSection: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#e3d7b7" },
  cloudTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  cloudTitle: { color: "#3d3419", fontSize: 13, fontWeight: "900" },
  revisionText: { color: "#74683f", fontSize: 10, fontWeight: "800", marginTop: 8 },
  autoConflictText: { color: "#814f2d", fontSize: 10, fontWeight: "800", marginTop: 8 },
  linkArea: { marginTop: 10, gap: 8 },
  keyInput: { minHeight: 38, borderRadius: 10, borderWidth: 1, borderColor: "#d1c294", backgroundColor: "#fffaf0", paddingHorizontal: 10, color: "#3d3419", fontSize: 12, fontWeight: "700" },
  message: { color: "#2f7d5b", fontSize: 11, lineHeight: 15, fontWeight: "800", marginTop: 10 },
  messageBad: { color: "#a33f32" },
});
