import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useCollection } from "../hooks/useCollection";
import { useTrainerProfile } from "../hooks/useTrainerProfile";
import { releaseCaptures } from "../store/collection";
import { Bird3DPreview } from "../components/Bird3DPreview";
import { SpeciesGuide } from "../components/SpeciesGuide";
import { TrainerAvatar } from "../components/TrainerAvatar";
import { buildSpeciesDex, levelForXp, RARITY_COLORS, RARITY_ORDER, type SpeciesDexEntry } from "../utils/progression";
import type { TrainerAccessory, TrainerProfile } from "../types";

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

const AVATAR_COLORS = ["#2f8ee8", "#2f7d5b", "#7d64f2", "#d97941", "#c94f7c", "#263d78"];
const ACCENT_COLORS = ["#ffffff", "#ffd766", "#72e7ff", "#65d184", "#f0a6c1", "#d7ccff"];
const ACCESSORIES: { value: TrainerAccessory; label: string }[] = [
  { value: "cap", label: "Cap" },
  { value: "visor", label: "Visor" },
  { value: "hood", label: "Hood" },
  { value: "none", label: "None" },
];

function rarityLabel(entry: SpeciesDexEntry): string {
  return entry.identified === false ? "Unverified" : entry.rarity.charAt(0).toUpperCase() + entry.rarity.slice(1);
}

function displayName(entry: SpeciesDexEntry): string {
  return entry.identified === false ? "Unidentified photo" : entry.commonName;
}

export function DexScreen() {
  const { captures, seenSpecies, skyfriends, xp, loading, refresh } = useCollection();
  const { trainer, saveTrainer, refresh: refreshTrainer } = useTrainerProfile();
  const [customizing, setCustomizing] = useState(false);
  const [detailUsesModel, setDetailUsesModel] = useState(false);
  const [trainerDraft, setTrainerDraft] = useState<TrainerProfile>(trainer);
  const [selected, setSelected] = useState<SpeciesDexEntry>();
  const [pendingRelease, setPendingRelease] = useState<{
    commonName: string;
    speciesCode?: string;
    sciName?: string | null;
    canonicalKey?: string;
    captureIds: string[];
    photoLabel: string;
  }>();
  useEffect(() => {
    setDetailUsesModel(false);
  }, [selected]);

  useFocusEffect(useCallback(() => {
    void refresh();
    void refreshTrainer();
  }, [refresh]));

  const entries = useMemo(() => buildSpeciesDex(captures, seenSpecies), [captures, seenSpecies]);
  const progress = levelForXp(xp);
  const capturedSpecies = entries.filter((entry) => entry.capturedCount > 0 && entry.identified !== false).length;
  const totalCaptured = entries.reduce((total, entry) => total + entry.capturedCount, 0);
  const skyfriendSpecies = new Set(skyfriends.map((record) => record.canonicalKey ?? record.speciesCode ?? record.commonName.toLowerCase())).size;
  const hallOfFameEntries = useMemo(() => entries
    .filter((entry) => entry.capturedCount > 0 && entry.identified !== false)
    .map((entry) => ({
      entry,
      score: RARITY_ORDER.indexOf(entry.rarity) * 10
        + ((entry.bestCapture ?? entry.capture)?.verified ? 4 : 0)
        + (entry.photoUri ? 2 : 0)
        + Math.min(3, entry.capturedCount),
    }))
    .sort((left, right) => right.score - left.score || left.entry.commonName.localeCompare(right.entry.commonName))
    .slice(0, 5)
    .map((item) => item.entry), [entries]);

  if (loading) return <View style={styles.center}><Text>Loading your Bird-dex…</Text></View>;

  const release = (entry: SpeciesDexEntry) => {
    const photoCount = entry.captureIds.length;
    setSelected(undefined);
    setPendingRelease({
      commonName: entry.commonName,
      speciesCode: entry.speciesCode,
      sciName: entry.sciName,
      canonicalKey: entry.canonicalKey,
      captureIds: entry.captureIds,
      photoLabel: `${photoCount} photo${photoCount === 1 ? "" : "s"}`,
    });
  };

  const header = <View style={styles.header}>
    <View style={styles.headerTop}>
      <TrainerAvatar profile={trainer} size={58} />
      <View style={styles.headerStats}>
        <Text style={styles.trainerName}>{trainer.name}</Text>
        <Text style={styles.stat}>{capturedSpecies} species collected</Text>
        <Text style={styles.stat}>{totalCaptured} total captures</Text>
        <Text style={styles.stat}>{entries.length} species seen nearby</Text>
      </View>
      <View style={styles.levelBlock}>
        <Text style={styles.levelLabel}>Level</Text>
        <Text style={styles.level}>{progress.level}</Text>
        <Pressable accessibilityRole="button" style={styles.customizeButton} onPress={() => { setTrainerDraft(trainer); setCustomizing(true); }}><Text style={styles.customizeText}>Customize</Text></Pressable>
      </View>
    </View>
    <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.round(progress.progress * 100)}%` }]} /></View>
    <Text style={styles.progressCopy}>{progress.currentLevelXp} / {progress.nextLevelXp} XP to level {progress.level + 1}</Text>
    <Text style={styles.progressHint}>Capture new species for +50 XP. Duplicates still train your collection, with diminishing XP.</Text>
  </View>;

  const hallOfFameArea = <View style={styles.hallArea}>
    <View style={styles.hallHeader}>
      <View style={styles.skyfriendTitleWrap}>
        <Text style={styles.hallTitle}>Hall of Fame</Text>
        <Text style={styles.hallSubtitle}>Real honor-system sightings · your personal best birds</Text>
      </View>
      <Text style={styles.hallCount}>{hallOfFameEntries.length}</Text>
    </View>
    {hallOfFameEntries.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hallRow}>
      {hallOfFameEntries.map((entry, index) => {
        const imageUri = entry.photoUri || entry.imageUrl;
        return <Pressable key={entry.key} style={styles.hallCard} onPress={() => setSelected(entry)}>
          {imageUri ? <Image source={{ uri: imageUri }} style={styles.hallImage} /> : <View style={styles.hallImageEmpty}><Text style={styles.hallBird}>🐦</Text></View>}
          {!entry.photoUri && entry.imageUrl && imageUri ? <View style={[styles.referenceBadge, styles.hallReferenceBadge]}><Text style={styles.referenceBadgeText}>Reference</Text></View> : null}
          <View style={styles.hallRank}><Text style={styles.hallRankText}>{index + 1}</Text></View>
          <View style={styles.hallCardBody}>
            <Text style={styles.hallName} numberOfLines={2}>{entry.commonName}</Text>
            <Text style={styles.hallMeta}>{rarityLabel(entry)} · {entry.firstCapturedAt ? shortDate(entry.firstCapturedAt) : "Date unknown"}</Text>
            <Text style={styles.hallScore}>{entry.capture?.verified ? "AI verified" : "Honor record"} · ×{entry.capturedCount}</Text>
            <Text style={styles.hallReal}>REAL SIGHTING</Text>
          </View>
        </Pressable>;
      })}
    </ScrollView> : <Text style={styles.hallEmpty}>Capture real birds to build your honor-system Hall of Fame. Skyfriends never appear here.</Text>}
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
    return <Pressable accessibilityRole="button" accessibilityLabel={`${displayName(item)}, ${captured ? `${item.capturedCount} captured` : "seen nearby"}`} style={[styles.card, !captured && styles.lockedCard]} onPress={() => setSelected(item)}>
      <View style={styles.cardImageWrap}>
        {imageUri
          ? <Image source={{ uri: imageUri }} style={[styles.photo, !captured && styles.lockedPhoto]} />
          : <View style={[styles.photo, styles.noPhoto]}><Text style={styles.noPhotoText}>{captured ? "🐦" : "?"}</Text></View>}
        {!item.photoUri && item.imageUrl && imageUri ? <View style={styles.referenceBadge}><Text style={styles.referenceBadgeText}>Reference</Text></View> : null}
        {!captured && imageUri && <View style={styles.lockedVeil}><Text style={styles.question}>?</Text></View>}
        <View style={[styles.rarityChip, { backgroundColor: item.identified === false ? "#68746d" : RARITY_COLORS[item.rarity] }]}><Text style={styles.rarityChipText}>{rarityLabel(item)}</Text></View>
      </View>
      <Text style={styles.name} numberOfLines={2}>{displayName(item)}</Text>
      <Text style={styles.scientific} numberOfLines={1}>{item.identified === false ? "Species unknown" : item.sciName ?? "Scientific name unknown"}</Text>
      <View style={styles.cardFooter}>
        <Text style={captured ? styles.badge : styles.badgeLocked}>{captured ? `CAPTURED ×${item.capturedCount}` : "SEEN NEARBY"}</Text>
        <Text style={styles.chevron}>›</Text>
      </View>
    </Pressable>;
  };

  const content = !entries.length
    ? <ScrollView contentContainerStyle={styles.emptyContent}>
      <View>{header}{hallOfFameArea}{skyfriendArea}</View>
      <View style={styles.center}><Text style={styles.title}>Your Bird-dex is empty</Text><Text style={styles.copy}>Explore the map and capture your first bird.</Text></View>
    </ScrollView>
    : <FlatList
      contentContainerStyle={styles.list}
      data={entries}
      keyExtractor={(item) => item.key}
      numColumns={2}
      ListHeaderComponent={header}
      ListFooterComponent={<View>{hallOfFameArea}{skyfriendArea}</View>}
      renderItem={renderCard}
    />;

  const selectedCapture = selected?.capture;
  const coordinates = coordinateLabel(selectedCapture?.location?.latitude, selectedCapture?.location?.longitude);
  const detailImageUri = selectedCapture?.photoUri || (selected?.identified !== false ? selected?.imageUrl : undefined);
  const showDetailImage = Boolean(detailImageUri && !detailUsesModel);
  const detailUsesReferenceImage = Boolean(detailImageUri && !selectedCapture?.photoUri);
  const detailPhotoLabel = selectedCapture?.photoUri ? "your photo" : "species photo";
  const detailCopy = selected?.identified === false
    ? "This photo is kept as an unverified observation record and does not count as a collected species."
    : selectedCapture && !selectedCapture.photoUri && !selectedCapture.verified
      ? "Logged by the honor system without a photo. The species reference image is shown only as identification context; add a real photo to strengthen this personal record."
      : detailUsesModel
        ? "The 3D bird is a stylized encounter model. Switch back to the real photo/reference for the observation record."
        : selectedCapture?.photoUri
          ? "This is your real observation photo. A stylized 3D encounter model is also available."
          : "This species reference image is identification context; your encounter record remains primary.";

  return <View style={styles.screen}>
    {content}
    <Modal visible={Boolean(selected)} transparent animationType="fade" onRequestClose={() => setSelected(undefined)}>
      <View style={styles.modalBackdrop}>
        <View style={styles.detailCard}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {showDetailImage && detailImageUri
              ? <View style={styles.detailHeroWrap}><Image source={{ uri: detailImageUri }} style={styles.detailHeroPhoto} />{detailUsesReferenceImage ? <View style={[styles.referenceBadge, styles.detailReferenceBadge]}><Text style={styles.referenceBadgeText}>Reference</Text></View> : null}</View>
              : selected && selected.identified !== false ? <Bird3DPreview commonName={selected.commonName} rarity={selected.rarity} height={190} /> : null}
            {detailImageUri && selected?.identified !== false ? <Pressable accessibilityRole="button" style={styles.visualToggle} onPress={() => setDetailUsesModel((current) => !current)}>
              <Text style={styles.visualToggleText}>{detailUsesModel ? `View ${detailPhotoLabel}` : "View 3D model"}</Text>
            </Pressable> : null}
            <Text style={styles.detailTitle}>{selected ? displayName(selected) : ""}</Text>
            <Text style={styles.detailScientific}>{selected?.identified === false ? "Species unknown" : selected?.sciName ?? "Scientific name unknown"}</Text>
            <View style={styles.detailStats}>
              <Text style={styles.detailStat}>{selected?.identified === false ? "Unverified photo" : selectedCapture && !selectedCapture.photoUri && !selectedCapture.verified ? "Honor-system sighting" : `${selected ? rarityLabel(selected) : ""} encounter`}</Text>
              <Text style={styles.detailStat}>{selected?.capturedCount ? `Captured ×${selected.capturedCount}` : "Seen nearby"}</Text>
              {selected?.firstCapturedAt && <Text style={styles.detailStat}>First captured {shortDate(selected.firstCapturedAt)}</Text>}
              {coordinates && <Text style={styles.detailStat}>{coordinates}</Text>}
            </View>
            <Text style={styles.detailCopy}>{detailCopy}</Text>
            {selected && selected.identified !== false ? <SpeciesGuide commonName={selected.commonName} sciName={selected.sciName} compact /> : null}
            <View style={styles.detailActions}>
              <Pressable accessibilityRole="button" style={styles.modalKeep} onPress={() => setSelected(undefined)}><Text>Close</Text></Pressable>
              {selected?.capturedCount ? <Pressable accessibilityRole="button" style={styles.modalRelease} onPress={() => release(selected)}><Text style={styles.modalReleaseText}>Release</Text></Pressable> : null}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
    <Modal visible={customizing} transparent animationType="fade" onRequestClose={() => setCustomizing(false)}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.modalTitle}>Customize trainer</Text>
            <View style={styles.customizerPreview}><TrainerAvatar profile={trainerDraft} size={82} /><Text style={styles.previewName}>{trainerDraft.name}</Text></View>
            <Text style={styles.choiceLabel}>Name</Text>
            <Text style={styles.inputHint}>Blank names save as Trainer.</Text>
            <TextInput value={trainerDraft.name} onChangeText={(name) => setTrainerDraft((current) => ({ ...current, name }))} maxLength={24} style={styles.nameInput} placeholder="Trainer name" />
            <Text style={styles.choiceLabel}>Outfit</Text>
            <View style={styles.choiceRow}>{AVATAR_COLORS.map((color) => <Pressable key={color} accessibilityLabel={`Outfit color ${color}`} style={[styles.colorChoice, { backgroundColor: color }, trainerDraft.avatarColor === color && styles.choiceSelected]} onPress={() => setTrainerDraft((current) => ({ ...current, avatarColor: color }))} />)}</View>
            <Text style={styles.choiceLabel}>Accent</Text>
            <View style={styles.choiceRow}>{ACCENT_COLORS.map((color) => <Pressable key={color} accessibilityLabel={`Accent color ${color}`} style={[styles.colorChoice, { backgroundColor: color }, trainerDraft.accentColor === color && styles.choiceSelected]} onPress={() => setTrainerDraft((current) => ({ ...current, accentColor: color }))} />)}</View>
            <Text style={styles.choiceLabel}>Gear</Text>
            <View style={styles.choiceRow}>{ACCESSORIES.map((choice) => <Pressable key={choice.value} style={[styles.accessoryChoice, trainerDraft.accessory === choice.value && styles.accessorySelected]} onPress={() => setTrainerDraft((current) => ({ ...current, accessory: choice.value }))}><Text style={styles.accessoryText}>{choice.label}</Text></Pressable>)}</View>
            <View style={styles.modalActions}>
              <Pressable accessibilityRole="button" style={styles.modalKeep} onPress={() => setCustomizing(false)}><Text>Cancel</Text></Pressable>
              <Pressable accessibilityRole="button" style={styles.saveButton} onPress={() => { void saveTrainer(trainerDraft).then(() => setCustomizing(false)); }}><Text style={styles.saveButtonText}>Save</Text></Pressable>
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
            <Pressable accessibilityRole="button" style={styles.modalRelease} onPress={() => { const releaseRequest = pendingRelease; setPendingRelease(undefined); if (releaseRequest) void releaseCaptures(releaseRequest.captureIds).then(refresh); }}><Text style={styles.modalReleaseText}>Release</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  list: { padding: 10, gap: 4, paddingBottom: 28 },
  header: { margin: 5, marginBottom: 12, padding: 16, borderRadius: 18, backgroundColor: "#173c2b", elevation: 3 },
  headerTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  trainerName: { color: "#ffffff", fontSize: 17, fontWeight: "900" },
  levelBlock: { alignItems: "center", gap: 2 },
  customizeButton: { minHeight: 38, borderRadius: 14, paddingHorizontal: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#2f7d5b" },
  customizeText: { color: "#dff4e7", fontSize: 10, fontWeight: "900" },
  customizerPreview: { alignItems: "center", gap: 7, marginVertical: 12 },
  previewName: { color: "#173c2b", fontSize: 18, fontWeight: "900" },
  inputHint: { color: "#77867d", fontSize: 10, marginTop: -3, marginBottom: 4 },
  choiceLabel: { color: "#42574b", fontSize: 12, fontWeight: "900", marginTop: 10, marginBottom: 6, textTransform: "uppercase" },
  nameInput: { minHeight: 44, borderRadius: 10, paddingHorizontal: 12, backgroundColor: "#eef3ef", color: "#173c2b", fontWeight: "700" },
  choiceRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  colorChoice: { width: 44, height: 44, borderRadius: 22, borderWidth: 3, borderColor: "#d5ded8" },
  choiceSelected: { borderColor: "#173c2b" },
  accessoryChoice: { minHeight: 44, borderRadius: 16, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#e8eeea" },
  accessorySelected: { backgroundColor: "#bde8ca" },
  accessoryText: { color: "#173c2b", fontWeight: "800", fontSize: 12 },
  saveButton: { minHeight: 44, minWidth: 90, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#2f7d5b" },
  saveButtonText: { color: "#fff", fontWeight: "800" },

  levelLabel: { color: "#a9c9b4", fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1 },
  level: { color: "#fff", fontSize: 40, fontWeight: "900", lineHeight: 44 },
  headerStats: { flex: 1, gap: 4 },
  stat: { color: "#e2f1e7", fontWeight: "700", fontSize: 13 },
  progressTrack: { height: 10, borderRadius: 8, backgroundColor: "#0d2419", overflow: "hidden", marginTop: 12 },
  progressFill: { height: "100%", borderRadius: 8, backgroundColor: "#65d184" },
  progressCopy: { color: "#e2f1e7", fontWeight: "800", marginTop: 6, fontSize: 12 },
  progressHint: { color: "#a9c9b4", marginTop: 3, fontSize: 11, lineHeight: 15 },
  hallArea: { margin: 5, marginBottom: 12, padding: 14, borderRadius: 18, backgroundColor: "#4a3512", elevation: 3 },
  hallHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  hallTitle: { color: "#fff3c7", fontSize: 21, fontWeight: "900" },
  hallSubtitle: { color: "#dfc47d", fontSize: 11, fontWeight: "700", marginTop: 2 },
  hallCount: { color: "#4a3512", backgroundColor: "#ffd766", minWidth: 38, height: 38, borderRadius: 19, textAlign: "center", textAlignVertical: "center", fontSize: 18, fontWeight: "900", overflow: "hidden" },
  hallRow: { gap: 10, paddingTop: 12, paddingRight: 4 },
  hallCard: { width: 148, borderRadius: 15, overflow: "hidden", backgroundColor: "#fff8df" },
  hallImage: { width: "100%", height: 92, backgroundColor: "#d8c585" },
  hallImageEmpty: { width: "100%", height: 92, alignItems: "center", justifyContent: "center", backgroundColor: "#d8c585" },
  hallBird: { fontSize: 42 },
  hallRank: { position: "absolute", left: 7, top: 7, width: 25, height: 25, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#d99d21", borderWidth: 2, borderColor: "#fff3c7" },
  hallRankText: { color: "#fff", fontWeight: "900", fontSize: 12 },
  hallCardBody: { padding: 9 },
  hallName: { color: "#3d2d12", fontWeight: "900", fontSize: 13, minHeight: 32 },
  hallMeta: { color: "#7a6030", fontWeight: "700", fontSize: 10, marginTop: 2 },
  hallScore: { color: "#5d4820", fontWeight: "800", fontSize: 10, marginTop: 3 },
  hallReal: { color: "#2f7d5b", fontWeight: "900", fontSize: 9, marginTop: 5 },
  hallEmpty: { color: "#f1dc9b", fontSize: 12, lineHeight: 17, marginTop: 10 },
  skyfriendArea: { margin: 5, marginBottom: 12, padding: 14, borderRadius: 18, backgroundColor: "#28264f", elevation: 3 },
  skyfriendHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  skyfriendTitleWrap: { flex: 1 },
  skyfriendTitle: { color: "#eaf6ff", fontSize: 21, fontWeight: "900" },
  skyfriendSubtitle: { color: "#a9bde8", fontSize: 11, fontWeight: "700", marginTop: 2 },
  skyfriendCount: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "#59d6ee" },
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
  emptyContent: { flexGrow: 1, paddingBottom: 28 },
  screen: { flex: 1, backgroundColor: "#edf2ee" },
  modalBackdrop: { flex: 1, backgroundColor: "#0009", alignItems: "center", justifyContent: "center", padding: 20 },
  detailCard: { width: "100%", maxWidth: 390, maxHeight: "92%", borderRadius: 20, padding: 16, backgroundColor: "#fff" },
  detailTitle: { color: "#173c2b", fontSize: 23, fontWeight: "900", marginTop: 12, textAlign: "center" },
  detailScientific: { color: "#67786d", fontStyle: "italic", textAlign: "center", marginTop: 2 },
  detailStats: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6, marginTop: 10 },
  detailStat: { color: "#385144", backgroundColor: "#e7f0e9", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5, fontSize: 11, fontWeight: "800", overflow: "hidden" },
  detailHeroWrap: { position: "relative" },
  detailHeroPhoto: { width: "100%", height: 190, borderRadius: 16, backgroundColor: "#dce6df", resizeMode: "cover" },
  referenceBadge: { position: "absolute", right: 6, top: 6, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3, backgroundColor: "rgba(31, 45, 39, .78)" },
  referenceBadgeText: { color: "#f1f7f2", fontSize: 8, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.5 },
  hallReferenceBadge: { top: 63 },
  detailReferenceBadge: { top: 10, right: 10, paddingHorizontal: 8, paddingVertical: 5 },
  visualToggle: { alignSelf: "center", marginTop: 8, borderRadius: 15, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: "#edf4ec" },
  visualToggleText: { color: "#466052", fontSize: 12, fontWeight: "800" },
  detailCopy: { color: "#687a70", fontSize: 11, lineHeight: 15, textAlign: "center", marginTop: 10 },
  detailActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 14 },
  modalCard: { width: "100%", maxWidth: 360, maxHeight: "92%", borderRadius: 16, padding: 20, backgroundColor: "#fff" },
  modalTitle: { color: "#173c2b", fontSize: 20, fontWeight: "700" },
  modalCopy: { color: "#49584f", lineHeight: 20, marginTop: 10 },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 18 },
  modalKeep: { minHeight: 44, minWidth: 80, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#e8eeea" },
  modalRelease: { minHeight: 44, minWidth: 90, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#8f3d3d" },
  modalReleaseText: { color: "#fff", fontWeight: "700" },
});
