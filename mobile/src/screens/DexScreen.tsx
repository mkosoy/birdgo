import { useCallback, useState } from "react";
import { FlatList, Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useCollection } from "../hooks/useCollection";
import { captureMatchesSpecies, releaseSpecies } from "../store/collection";

export function DexScreen() {
  const { captures, seenSpecies, loading, refresh } = useCollection();
  const [pendingRelease, setPendingRelease] = useState<{
    commonName: string;
    speciesCode?: string;
    photoLabel: string;
  }>();
  useFocusEffect(useCallback(() => {
    void refresh();
  }, [refresh]));
  if (loading) return <View style={styles.center}><Text>Loading your Bird-dex…</Text></View>;
  const capturedCodes = new Set(captures.map((capture) => capture.speciesCode).filter(Boolean));
  const capturedNames = new Set(captures.map((capture) => capture.commonName.trim().toLowerCase()));
  const locked = seenSpecies.filter((species) => !capturedCodes.has(species.speciesCode) && !capturedNames.has(species.comName.trim().toLowerCase()));
  const release = (commonName: string, speciesCode?: string) => {
    const photoCount = captures.filter((capture) => captureMatchesSpecies(capture, speciesCode, commonName)).length;
    const photoLabel = `${photoCount} photo${photoCount === 1 ? "" : "s"}`;
    setPendingRelease({ commonName, speciesCode, photoLabel });
  };
  const content = !captures.length && !locked.length
    ? <View style={styles.center}><Text style={styles.title}>Your Bird-dex is empty</Text><Text style={styles.copy}>Explore the map and capture your first bird.</Text></View>
    : <FlatList contentContainerStyle={styles.list} data={[...captures.map((capture) => ({ kind: "capture" as const, capture })), ...locked.map((species) => ({ kind: "locked" as const, species }))]} keyExtractor={(item, index) => item.kind === "capture" ? item.capture.id : `${item.species.speciesCode}-${index}`} numColumns={2} renderItem={({ item }) => item.kind === "capture" ? <View style={styles.card}><Image source={{ uri: item.capture.photoUri }} style={styles.photo} /><Text style={styles.name}>{item.capture.commonName}</Text><Text style={styles.scientific}>{item.capture.sciName ?? "Scientific name unknown"}</Text><Text style={styles.meta}>{new Date(item.capture.timestamp).toLocaleDateString()} · {item.capture.location.latitude.toFixed(2)}, {item.capture.location.longitude.toFixed(2)}</Text><Text style={styles.badge}>CAPTURED</Text><Pressable accessibilityRole="button" accessibilityLabel={`Release ${item.capture.commonName}`} style={styles.releaseButton} onPress={() => release(item.capture.commonName, item.capture.speciesCode)}><Text style={styles.releaseText}>Release</Text></Pressable></View> : <View style={[styles.card, styles.locked]}><Text style={styles.question}>?</Text><Text style={styles.name}>{item.species.comName}</Text><Text style={styles.meta}>{item.species.speciesCode}</Text><Text style={styles.badgeLocked}>SEEN</Text></View>} />;
  return <View style={styles.screen}>{content}<Modal visible={Boolean(pendingRelease)} transparent animationType="fade" onRequestClose={() => setPendingRelease(undefined)}><View style={styles.modalBackdrop}><View style={styles.modalCard}><Text style={styles.modalTitle}>Release this bird?</Text><Text style={styles.modalCopy}>{pendingRelease?.commonName} will remove {pendingRelease?.photoLabel} from your captured collection and return to its seen state if it is still in this area.</Text><View style={styles.modalActions}><Pressable accessibilityRole="button" style={styles.modalKeep} onPress={() => setPendingRelease(undefined)}><Text>Keep</Text></Pressable><Pressable accessibilityRole="button" style={styles.modalRelease} onPress={() => { const releaseRequest = pendingRelease; setPendingRelease(undefined); if (releaseRequest) void releaseSpecies(releaseRequest.speciesCode, releaseRequest.commonName).then(refresh); }}><Text style={styles.modalReleaseText}>Release</Text></Pressable></View></View></View></Modal></View>;
}

const styles = StyleSheet.create({
  list: { padding: 10, gap: 10 },
  card: { flex: 1, margin: 5, padding: 10, borderRadius: 12, backgroundColor: "#fff", elevation: 2, minHeight: 210 },
  photo: { width: "100%", height: 120, borderRadius: 8, backgroundColor: "#dce6df" },
  name: { fontWeight: "700", color: "#173c2b", marginTop: 7 },
  scientific: { color: "#67786d", fontStyle: "italic", fontSize: 12 },
  meta: { color: "#7b8580", fontSize: 10, marginTop: 5 },
  badge: { color: "#2f7d5b", fontWeight: "700", fontSize: 10, marginTop: 7 },
  locked: { backgroundColor: "#e2e5e3", alignItems: "center", justifyContent: "center" },
  question: { fontSize: 72, color: "#8b9490", fontWeight: "800" },
  badgeLocked: { color: "#727b76", fontWeight: "700", fontSize: 10, marginTop: 7 },
  releaseButton: { minHeight: 44, marginTop: 8, borderRadius: 8, backgroundColor: "#8f3d3d", justifyContent: "center", alignItems: "center" },
  releaseText: { color: "#fff", fontWeight: "700" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 25 },
  title: { fontSize: 22, fontWeight: "700", color: "#173c2b" },
  copy: { color: "#67786d", marginTop: 8 },
  screen: { flex: 1 },
  modalBackdrop: { flex: 1, backgroundColor: "#0008", alignItems: "center", justifyContent: "center", padding: 24 },
  modalCard: { width: "100%", maxWidth: 360, borderRadius: 16, padding: 20, backgroundColor: "#fff" },
  modalTitle: { color: "#173c2b", fontSize: 20, fontWeight: "700" },
  modalCopy: { color: "#49584f", lineHeight: 20, marginTop: 10 },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 18 },
  modalKeep: { minHeight: 44, minWidth: 80, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#e8eeea" },
  modalRelease: { minHeight: 44, minWidth: 90, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#8f3d3d" },
  modalReleaseText: { color: "#fff", fontWeight: "700" },
});
