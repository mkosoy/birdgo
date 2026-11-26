import { useCallback, useMemo, useState } from "react";
import { FlatList, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useCollection } from "../hooks/useCollection";
import { captureMatchesSpecies, releaseSpecies } from "../store/collection";
import { Bird3DPreview } from "../components/Bird3DPreview";
import { buildSpeciesDex, levelForXp, RARITY_COLORS, type SpeciesDexEntry } from "../utils/progression";

function coordinateLabel(latitude?: number, longitude?: number): string | undefined {
  if (typeof latitude !== "number" || !Number.isFinite(latitude)
    || typeof longitude !== "number" || !Number.isFinite(longitude)) return undefined;
  return `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`;
}

function shortDate(timestamp?: string): string {
  if (!timestamp) return "Date unknown";
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? "Date unknown" : date.toLocaleDateString();
}

function rarityLabel(entry: SpeciesDexEntry): string {
  return entry.rarity.charAt(0).toUpperCase() + entry.rarity.slice(1);
}

export function DexScreen() {
  const { captures, seenSpecies, skyfriends, xp, loading, refresh } = useCollection();
  const [selected, setSelected] = useState<SpeciesDexEntry>();
  const [pendingRelease, setPendingRelease] = useState<{
    commonName: string;
    speciesCode?: string;
    sciName?: string | null;
    canonicalKey?: string;
    photoLabel: string;
  }>();
  useFocusEffect(useCallback(() => {
    void refresh();
  }, [refresh]));

  const entries = useMemo(() => buildSpeciesDex(captures, seenSpecies), [captures, seenSpecies]);
  const progress = levelForXp(xp);
  const capturedSpecies = entries.filter((entry) => entry.capturedCount > 0 && entry.identified !== false).length;
  const totalCaptured = entries.reduce((total, entry) => total + entry.capturedCount, 0);
  const skyfriendSpecies = new Set(skyfriends.map((record) => record.canonicalKey ?? record.speciesCode ?? record.commonName.toLowerCase())).size;

  if (loading) return <View style={styles.center}><Text>Loading your Bird-dex…</Text></View>;

  const release = (entry: SpeciesDexEntry) => {
    const photoCount = captures.filter((capture) => captureMatchesSpecies(capture, entry.speciesCode, entry.commonName, entry.sciName, entry.canonicalKey)).length;
    setSelected(undefined);
    setPendingRelease({
      commonName: entry.commonName,
      speciesCode: entry.speciesCode,
      sciName: entry.sciName,
      canonicalKey: entry.canonicalKey,
      photoLabel: `${photoCount} photo${photoCount === 1 ? "" : "s"}`,
    });
  };

  const header = <View style={styles.header}>
    <View style={styles.headerTop}>
      <View>
        <Text style={styles.levelLabel}>Trainer level</Text>
        <Text style={styles.level}>{progress.level}</Text>
      </View>
      <View style={styles.headerStats}>
        <Text style={styles.stat}>{capturedSpecies} species collected</Text>
        <Text style={styles.stat}>{totalCaptured} total captures</Text>
        <Text style={styles.stat}>{entries.length} species seen nearby</Text>
      </View>
    </View>
    <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.round(progress.progress * 100)}%` }]} /></View>
    <Text style={styles.progressCopy}>{progress.currentLevelXp} / {progress.nextLevelXp} XP to level {progress.level + 1}</Text>
    <Text style={styles.progressHint}>Capture new species for +50 XP. Duplicates still train your collection.</Text>
  </View>;

  const skyfriendArea = <View style={styles.skyfriendArea}>
    <View style={styles.skyfriendHeader}>
      <View style={styles.skyfriendTitleWrap}>
        <Text style={styles.skyfriendTitle}>Skyfriends</Text>
        <Text style={styles.skyfriendSubtitle}>Virtual field guide · never counts as real birds</Text>
      </View>
      <View style={styles.skyfriendCount}><Text style={styles.skyfriendCountText}>{skyfriendSpecies}</Text></View>
    </View>
    {skyfriends.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.skyfriendRow}>
      {skyfriends.slice(0, 16).map((record) => <View key={record.id} style={styles.skyfriendCard}>
        {record.imageUrl ? <Image source={{ uri: record.imageUrl }} style={styles.skyfriendImage} /> : <View style={styles.skyfriendImageEmpty}><Text style={styles.skyfriendSparkle}>✦</Text></View>}
        <Text style={styles.skyfriendName} numberOfLines={2}>{record.commonName}</Text>
        <Text style={styles.skyfriendMeta}>{shortDate(record.timestamp)}</Text>
      </View>)}
    </ScrollView> : <Text style={styles.skyfriendEmpty}>Explore low-activity areas and look for glowing holographic birds.</Text>}
  </View>;

  const renderCard = ({ item }: { item: SpeciesDexEntry }) => {
    const captured = item.capturedCount > 0;
    const imageUri = item.photoUri || item.imageUrl;
    return <Pressable accessibilityRole="button" accessibilityLabel={`${item.commonName}, ${captured ? `${item.capturedCount} captured` : "seen nearby"}`} style={[styles.card, !captured && styles.lockedCard]} onPress={() => setSelected(item)}>
      <View style={styles.cardImageWrap}>
        {imageUri
          ? <Image source={{ uri: imageUri }} style={[styles.photo, !captured && styles.lockedPhoto]} />
          : <View style={[styles.photo, styles.noPhoto]}><Text style={styles.noPhotoText}>{captured ? "🐦" : "?"}</Text></View>}
        {!captured && imageUri && <View style={styles.lockedVeil}><Text style={styles.question}>?</Text></View>}
        <View style={[styles.rarityChip, { backgroundColor: RARITY_COLORS[item.rarity] }]}><Text style={styles.rarityChipText}>{rarityLabel(item)}</Text></View>
      </View>
      <Text style={styles.name} numberOfLines={2}>{item.commonName}</Text>
      <Text style={styles.scientific} numberOfLines={1}>{item.sciName ?? "Scientific name unknown"}</Text>
      <View style={styles.cardFooter}>
        <Text style={captured ? styles.badge : styles.badgeLocked}>{captured ? `CAPTURED ×${item.capturedCount}` : "SEEN NEARBY"}</Text>
        <Text style={styles.chevron}>›</Text>
      </View>
    </Pressable>;
  };

  const content = !entries.length
    ? <View style={styles.center}><Text style={styles.title}>Your Bird-dex is empty</Text><Text style={styles.copy}>Explore the map and capture your first bird.</Text></View>
    : <FlatList
      contentContainerStyle={styles.list}
      data={entries}
      keyExtractor={(item) => item.key}
      numColumns={2}
      ListHeaderComponent={<View>{header}{skyfriendArea}</View>}
      renderItem={renderCard}
    />;

  const selectedCapture = selected?.capture;
  const coordinates = coordinateLabel(selectedCapture?.location?.latitude, selectedCapture?.location?.longitude);

  return <View style={styles.screen}>
    {content}
    <Modal visible={Boolean(selected)} transparent animationType="fade" onRequestClose={() => setSelected(undefined)}>
      <View style={styles.modalBackdrop}>
        <View style={styles.detailCard}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {selected && <Bird3DPreview commonName={selected.commonName} rarity={selected.rarity} height={190} />}
            <Text style={styles.detailTitle}>{selected?.commonName}</Text>
            <Text style={styles.detailScientific}>{selected?.sciName ?? "Scientific name unknown"}</Text>
            <View style={styles.detailStats}>
              <Text style={styles.detailStat}>{selected ? rarityLabel(selected) : ""} encounter</Text>
              <Text style={styles.detailStat}>{selected?.capturedCount ? `Captured ×${selected.capturedCount}` : "Seen nearby"}</Text>
              {selected?.firstCapturedAt && <Text style={styles.detailStat}>First captured {shortDate(selected.firstCapturedAt)}</Text>}
              {coordinates && <Text style={styles.detailStat}>{coordinates}</Text>}
            </View>
            {selectedCapture?.photoUri && <Image source={{ uri: selectedCapture.photoUri }} style={styles.detailPhoto} />}
            <Text style={styles.detailCopy}>The 3D bird is a stylized encounter model; your photo remains the real observation record.</Text>
            <View style={styles.detailActions}>
              <Pressable accessibilityRole="button" style={styles.modalKeep} onPress={() => setSelected(undefined)}><Text>Close</Text></Pressable>
              {selected?.capturedCount ? <Pressable accessibilityRole="button" style={styles.modalRelease} onPress={() => release(selected)}><Text style={styles.modalReleaseText}>Release</Text></Pressable> : null}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
    <Modal visible={Boolean(pendingRelease)} transparent animationType="fade" onRequestClose={() => setPendingRelease(undefined)}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Release this species?</Text>
          <Text style={styles.modalCopy}>{pendingRelease?.commonName} will remove {pendingRelease?.photoLabel} from your captured collection and return to its seen state if it is still in this area. Trainer XP you already earned is kept.</Text>
          <View style={styles.modalActions}>
            <Pressable accessibilityRole="button" style={styles.modalKeep} onPress={() => setPendingRelease(undefined)}><Text>Keep</Text></Pressable>
            <Pressable accessibilityRole="button" style={styles.modalRelease} onPress={() => { const releaseRequest = pendingRelease; setPendingRelease(undefined); if (releaseRequest) void releaseSpecies(releaseRequest.speciesCode, releaseRequest.commonName, releaseRequest.sciName, releaseRequest.canonicalKey).then(refresh); }}><Text style={styles.modalReleaseText}>Release</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  list: { padding: 10, gap: 4, paddingBottom: 28 },
  header: { margin: 5, marginBottom: 12, padding: 16, borderRadius: 18, backgroundColor: "#173c2b", elevation: 3 },
  headerTop: { flexDirection: "row", alignItems: "center", gap: 16 },
  levelLabel: { color: "#a9c9b4", fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1 },
  level: { color: "#fff", fontSize: 40, fontWeight: "900", lineHeight: 44 },
  headerStats: { flex: 1, gap: 4 },
  stat: { color: "#e2f1e7", fontWeight: "700", fontSize: 13 },
  progressTrack: { height: 10, borderRadius: 8, backgroundColor: "#0d2419", overflow: "hidden", marginTop: 12 },
  progressFill: { height: "100%", borderRadius: 8, backgroundColor: "#65d184" },
  progressCopy: { color: "#e2f1e7", fontWeight: "800", marginTop: 6, fontSize: 12 },
  progressHint: { color: "#a9c9b4", marginTop: 3, fontSize: 11, lineHeight: 15 },
  skyfriendArea: { margin: 5, marginBottom: 12, padding: 14, borderRadius: 18, backgroundColor: "#28264f", elevation: 3 },
  skyfriendHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  skyfriendTitleWrap: { flex: 1 },
  skyfriendTitle: { color: "#eaf6ff", fontSize: 21, fontWeight: "900" },
  skyfriendSubtitle: { color: "#a9bde8", fontSize: 11, fontWeight: "700", marginTop: 2 },
  skyfriendCount: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "#59d6ee" },
  skyfriendCountText: { color: "#1c2454", fontSize: 18, fontWeight: "900" },
  skyfriendRow: { gap: 10, paddingTop: 12, paddingRight: 4 },
  skyfriendCard: { width: 112, padding: 8, borderRadius: 14, backgroundColor: "#383674" },
  skyfriendImage: { width: "100%", height: 76, borderRadius: 10, backgroundColor: "#20204a" },
  skyfriendImageEmpty: { width: "100%", height: 76, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#20204a" },
  skyfriendSparkle: { color: "#72e7ff", fontSize: 38, fontWeight: "900" },
  skyfriendName: { color: "#f1f7ff", fontSize: 12, fontWeight: "800", minHeight: 30, marginTop: 7 },
  skyfriendMeta: { color: "#a9bde8", fontSize: 10, fontWeight: "700", marginTop: 2 },
  skyfriendEmpty: { color: "#c5d3f1", fontSize: 12, lineHeight: 17, marginTop: 10 },
  card: { flex: 1, margin: 5, padding: 10, borderRadius: 14, backgroundColor: "#fff", elevation: 2, minHeight: 218 },
  lockedCard: { backgroundColor: "#e3e8e5" },
  cardImageWrap: { position: "relative" },
  photo: { width: "100%", height: 112, borderRadius: 10, backgroundColor: "#dce6df" },
  lockedPhoto: { opacity: 0.32 },
  lockedVeil: { position: "absolute", top: 0, left: 0, right: 0, height: 112, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#24352c55" },
  question: { fontSize: 58, color: "#ffffffdd", fontWeight: "900" },
  noPhoto: { alignItems: "center", justifyContent: "center" },
  noPhotoText: { color: "#7f8e86", fontSize: 52, fontWeight: "900" },
  rarityChip: { position: "absolute", left: 6, bottom: 6, borderRadius: 9, paddingHorizontal: 7, paddingVertical: 3 },
  rarityChipText: { color: "#fff", fontSize: 9, fontWeight: "900", textTransform: "uppercase" },
  name: { fontWeight: "800", color: "#173c2b", marginTop: 7, minHeight: 34 },
  scientific: { color: "#67786d", fontStyle: "italic", fontSize: 12 },
  cardFooter: { flexDirection: "row", alignItems: "center", marginTop: 7 },
  badge: { color: "#2f7d5b", fontWeight: "900", fontSize: 10, flex: 1 },
  badgeLocked: { color: "#727b76", fontWeight: "900", fontSize: 10, flex: 1 },
  chevron: { color: "#6f7d75", fontSize: 22, fontWeight: "800" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 25 },
  title: { fontSize: 22, fontWeight: "700", color: "#173c2b" },
  copy: { color: "#67786d", marginTop: 8 },
  screen: { flex: 1, backgroundColor: "#edf2ee" },
  modalBackdrop: { flex: 1, backgroundColor: "#0009", alignItems: "center", justifyContent: "center", padding: 20 },
  detailCard: { width: "100%", maxWidth: 390, maxHeight: "92%", borderRadius: 20, padding: 16, backgroundColor: "#fff" },
  detailTitle: { color: "#173c2b", fontSize: 23, fontWeight: "900", marginTop: 12, textAlign: "center" },
  detailScientific: { color: "#67786d", fontStyle: "italic", textAlign: "center", marginTop: 2 },
  detailStats: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6, marginTop: 10 },
  detailStat: { color: "#385144", backgroundColor: "#e7f0e9", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5, fontSize: 11, fontWeight: "800", overflow: "hidden" },
  detailPhoto: { width: "100%", height: 140, borderRadius: 12, marginTop: 12, backgroundColor: "#dce6df" },
  detailCopy: { color: "#687a70", fontSize: 11, lineHeight: 15, textAlign: "center", marginTop: 10 },
  detailActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 14 },
  modalCard: { width: "100%", maxWidth: 360, borderRadius: 16, padding: 20, backgroundColor: "#fff" },
  modalTitle: { color: "#173c2b", fontSize: 20, fontWeight: "700" },
  modalCopy: { color: "#49584f", lineHeight: 20, marginTop: 10 },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 18 },
  modalKeep: { minHeight: 44, minWidth: 80, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#e8eeea" },
  modalRelease: { minHeight: 44, minWidth: 90, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#8f3d3d" },
  modalReleaseText: { color: "#fff", fontWeight: "700" },
});
