import { FlatList, Image, StyleSheet, Text, View } from "react-native";
import { useCollection } from "../hooks/useCollection";

export function DexScreen() {
  const { captures, seenSpecies, loading } = useCollection();
  if (loading) return <View style={styles.center}><Text>Loading your Bird-dex…</Text></View>;
  const capturedCodes = new Set(captures.map((capture) => capture.speciesCode).filter(Boolean));
  const capturedNames = new Set(captures.map((capture) => capture.commonName.trim().toLowerCase()));
  const locked = seenSpecies.filter((species) => !capturedCodes.has(species.speciesCode) && !capturedNames.has(species.comName.trim().toLowerCase()));
  if (!captures.length && !locked.length) return <View style={styles.center}><Text style={styles.title}>Your Bird-dex is empty</Text><Text style={styles.copy}>Explore the map and capture your first bird.</Text></View>;
  return <FlatList contentContainerStyle={styles.list} data={[...captures.map((capture) => ({ kind: "capture" as const, capture })), ...locked.map((species) => ({ kind: "locked" as const, species }))]} keyExtractor={(item, index) => item.kind === "capture" ? item.capture.id : `${item.species.speciesCode}-${index}`} numColumns={2} renderItem={({ item }) => item.kind === "capture" ? <View style={styles.card}><Image source={{ uri: item.capture.photoUri }} style={styles.photo} /><Text style={styles.name}>{item.capture.commonName}</Text><Text style={styles.scientific}>{item.capture.sciName ?? "Scientific name unknown"}</Text><Text style={styles.meta}>{new Date(item.capture.timestamp).toLocaleDateString()} · {item.capture.location.latitude.toFixed(2)}, {item.capture.location.longitude.toFixed(2)}</Text><Text style={styles.badge}>CAPTURED</Text></View> : <View style={[styles.card, styles.locked]}><Text style={styles.question}>?</Text><Text style={styles.name}>{item.species.comName}</Text><Text style={styles.meta}>{item.species.speciesCode}</Text><Text style={styles.badgeLocked}>SEEN</Text></View>} />;
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
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 25 },
  title: { fontSize: 22, fontWeight: "700", color: "#173c2b" },
  copy: { color: "#67786d", marginTop: 8 },
});
