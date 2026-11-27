import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { exportCollectionBackup, pickValidatedCollectionBackup, restoreCollectionBackup } from "../utils/collectionBackup";

export function BackupRestoreCard({ onRestored }: { onRestored: () => void }) {
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [confirmingImport, setConfirmingImport] = useState(false);
  const [message, setMessage] = useState<string>();
  const [messageTone, setMessageTone] = useState<"good" | "bad">("good");

  const showMessage = (text: string, tone: "good" | "bad" = "good") => {
    setMessage(text);
    setMessageTone(tone);
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
      setConfirmingImport(false);
      onRestored();
      showMessage("Backup restored on this device.");
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Backup import failed.", "bad");
    } finally {
      setBusy(null);
    }
  };

  return <View style={styles.card}>
    <View style={styles.titleRow}>
      <View style={styles.iconWrap}><Ionicons name="cloud-download-outline" size={17} color="#235040" /></View>
      <View style={styles.copyWrap}>
        <Text style={styles.title}>Collection backup</Text>
        <Text style={styles.copy}>Export or restore species records, journal metadata, XP, Skyfriends, and trainer identity. Photo image files are not included yet; cloud sync is not enabled.</Text>
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
  message: { color: "#2f7d5b", fontSize: 11, lineHeight: 15, fontWeight: "800", marginTop: 10 },
  messageBad: { color: "#a33f32" },
});
