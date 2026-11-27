import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "@react-navigation/native";
import { useCollection } from "../hooks/useCollection";
import { useTrainerProfile } from "../hooks/useTrainerProfile";
import { releaseCaptures } from "../store/collection";
import { BackupRestoreCard } from "../components/BackupRestoreCard";
import { Bird3DPreview } from "../components/Bird3DPreview";
import { DailyQuests } from "../components/DailyQuests";
import { EarTrainingQuiz } from "../components/EarTrainingQuiz";
import { SpeciesGuide } from "../components/SpeciesGuide";
import { TrainerAvatar } from "../components/TrainerAvatar";
import { buildBirdBadges, buildSpeciesDex, levelForXp, RARITY_COLORS, RARITY_ORDER, type SpeciesDexEntry } from "../utils/progression";
import type { CaptureRecord, TrainerAccessory, TrainerProfile } from "../types";

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

function journalDate(timestamp?: string): string {
  if (!timestamp) return "Date unknown";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Date unknown";
  return `${date.toLocaleDateString()} · ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
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
  const { captures, seenSpecies, skyfriends, xp, questRewards, speciesCaptureCounts, loading, refresh, claimQuest } = useCollection();
  const { trainer, saveTrainer, refresh: refreshTrainer } = useTrainerProfile();
  const [customizing, setCustomizing] = useState(false);
  const [detailUsesModel, setDetailUsesModel] = useState(false);
  const [trainerDraft, setTrainerDraft] = useState<TrainerProfile>(trainer);
  const [selected, setSelected] = useState<SpeciesDexEntry>();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "captured" | "seen" | "rare">("all");
  const [viewMode, setViewMode] = useState<"collection" | "journal">("collection");
  const [pendingRelease, setPendingRelease] = useState<{
    commonName: string;
    speciesCode?: string;
    sciName?: string | null;
    canonicalKey?: string;
    captureIds: string[];
    recordLabel: string;
  }>();
  useEffect(() => {
    setDetailUsesModel(false);
  }, [selected]);

  useFocusEffect(useCallback(() => {
    void refresh();
    void refreshTrainer();
  }, [refresh]));

  const entries = useMemo(() => buildSpeciesDex(captures, seenSpecies), [captures, seenSpecies]);
  const filteredEntries = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (filter === "captured" && !(entry.capturedCount > 0 && entry.identified !== false)) return false;
      if (filter === "seen" && entry.capturedCount > 0) return false;
      if (filter === "rare" && !(entry.identified !== false && ["rare", "epic", "legendary"].includes(entry.rarity))) return false;
      if (!needle) return true;
      return [displayName(entry), entry.commonName, entry.sciName].some((value) => value?.toLowerCase().includes(needle));
    });
  }, [entries, query, filter]);
  const badges = useMemo(() => buildBirdBadges(captures, skyfriends), [captures, skyfriends]);
  const earnedBadgeCount = badges.filter((badge) => badge.earned).length;
  const progress = levelForXp(xp);
  const capturedSpecies = entries.filter((entry) => entry.capturedCount > 0 && entry.identified !== false).length;
  const totalCaptured = entries.reduce((total, entry) => total + entry.capturedCount, 0);
  const skyfriendSpecies = new Set(skyfriends.map((record) => record.canonicalKey ?? record.speciesCode ?? record.commonName.toLowerCase())).size;
  const earTrainingSpecies = useMemo(() => entries
    .filter((entry) => entry.capturedCount > 0 && entry.identified !== false)
    .map((entry) => ({ key: entry.key, practiceKey: entry.commonName.trim().toLowerCase().replace(/\s+/g, " "), commonName: entry.commonName, sciName: entry.sciName, imageUrl: entry.photoUri || entry.imageUrl })), [entries]);
  const journalCaptures = useMemo(() => [...captures]
    .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp)), [captures]);
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
      recordLabel: `${photoCount} observation record${photoCount === 1 ? "" : "s"}`,
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
    <View style={styles.badgeHeaderRow}>
      <Text style={styles.badgeHeader}>Badges</Text>
      <Text style={styles.badgeCount}>{earnedBadgeCount}/{badges.length}</Text>
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.badgeRow}>
      {badges.map((badge) => <View key={badge.id} accessibilityLabel={`${badge.title} badge, ${badge.progress} of ${badge.target}. ${badge.detail}`} style={[styles.milestoneCard, !badge.earned && styles.milestoneLocked]}>
        <View style={[styles.milestoneIconWrap, badge.earned && styles.milestoneIconEarned]}><Ionicons name={badge.icon} size={17} color={badge.earned ? "#173c2b" : "#bdd5c5"} /></View>
        <Text style={styles.milestoneTitle} numberOfLines={1}>{badge.title}</Text>
        <Text style={styles.milestoneProgress}>{badge.progress}/{badge.target}</Text>
      </View>)}
    </ScrollView>
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

  const questArea = <DailyQuests captures={captures} skyfriends={skyfriends} claimedIds={questRewards} speciesCaptureCounts={speciesCaptureCounts} onClaim={claimQuest} />;
  const earTrainingArea = <EarTrainingQuiz species={earTrainingSpecies} />;
  const backupArea = <BackupRestoreCard onRestored={() => { void refresh(); void refreshTrainer(); }} />;

  const skyfriendArea = <View style={styles.skyfriendArea}>
    <View style={styles.skyfriendHeader}>
      <View style={styles.skyfriendTitleWrap}>
        <Text style={styles.skyfriendTitle}>Skyfriends</Text>
        <Text style={styles.skyfriendSubtitle}>Virtual field guide · never counts as real birds</Text>
      </View>
      <View style={styles.skyfriendCount}><Text style={styles.skyfriendCountText}>{skyfriendSpecies}</Text></View>
    </View>
    {skyfriends.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.skyfriendRow}>
      {skyfriends.slice(0, 16).map((record) => <View key={record.id} style={[styles.skyfriendCard, record.variant === "prismatic" && styles.skyfriendCardPrismatic]}>
        {record.imageUrl ? <Image source={{ uri: record.imageUrl }} style={styles.skyfriendImage} /> : <View style={styles.skyfriendImageEmpty}><Text style={styles.skyfriendSparkle}>✦</Text></View>}
        <Text style={styles.skyfriendName} numberOfLines={2}>{record.commonName}</Text>
        <Text style={styles.skyfriendMeta}>{record.variant === "prismatic" ? "Prismatic · " : ""}{shortDate(record.timestamp)}</Text>
      </View>)}
    </ScrollView> : <Text style={styles.skyfriendEmpty}>Explore low-activity areas and look for glowing holographic birds.</Text>}
  </View>;

  const modeSwitch = <View style={styles.modeSwitch}>
    {([
      { value: "collection" as const, label: "Collection" },
      { value: "journal" as const, label: `Journal${journalCaptures.length ? ` · ${journalCaptures.length}` : ""}` },
    ]).map((choice) => <Pressable key={choice.value} accessibilityRole="button" accessibilityLabel={`${choice.label} view`} style={[styles.modeButton, viewMode === choice.value && styles.modeButtonActive]} onPress={() => setViewMode(choice.value)}>
      <Text style={[styles.modeButtonText, viewMode === choice.value && styles.modeButtonTextActive]}>{choice.label}</Text>
    </Pressable>)}
  </View>;

  const filterChoices: { value: typeof filter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "captured", label: "Collected" },
    { value: "seen", label: "Seen" },
    { value: "rare", label: "Rare+" },
  ];
  const dexControls = entries.length ? <View style={styles.searchArea}>
    <View style={styles.searchBox}>
      <Ionicons name="search" size={17} color="#668071" />
      <TextInput value={query} onChangeText={setQuery} placeholder="Search species" placeholderTextColor="#789086" style={styles.searchInput} autoCapitalize="none" autoCorrect={false} />
      {query ? <Pressable accessibilityLabel="Clear species search" hitSlop={8} onPress={() => setQuery("")}><Ionicons name="close-circle" size={18} color="#789086" /></Pressable> : null}
    </View>
    <View style={styles.filterRow}>{filterChoices.map((choice) => <Pressable key={choice.value} accessibilityRole="button" accessibilityLabel={`${choice.label} species filter`} style={[styles.filterChip, filter === choice.value && styles.filterChipActive]} onPress={() => setFilter(choice.value)}>
      <Text style={[styles.filterChipText, filter === choice.value && styles.filterChipTextActive]}>{choice.label}</Text>
    </Pressable>)}</View>
  </View> : null;

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

  const openJournalCapture = (capture: CaptureRecord) => {
    const entry = entries.find((candidate) => candidate.captureIds.includes(capture.id));
    if (entry) setSelected(entry);
  };

  const renderJournalRow = ({ item }: { item: CaptureRecord }) => {
    const entry = entries.find((candidate) => candidate.captureIds.includes(item.id));
    const rarity = item.rarity ?? entry?.rarity ?? "common";
    const evidence = item.verified ? "AI verified photo" : item.photoUri ? "Unverified photo" : "Honor-system sighting";
    const coordinates = coordinateLabel(item.location?.latitude, item.location?.longitude);
    return <Pressable accessibilityRole="button" accessibilityLabel={`${item.commonName} journal record, ${journalDate(item.timestamp)}, ${evidence}, ${rarity} rarity${coordinates ? `, near ${coordinates}` : ""}`} style={styles.journalRow} onPress={() => openJournalCapture(item)}>
      {item.photoUri
        ? <Image source={{ uri: item.photoUri }} style={styles.journalImage} />
        : <View style={[styles.journalImage, styles.journalImageEmpty]}><Ionicons name={item.verified ? "camera" : "hand-left"} size={20} color="#64776c" /></View>}
      <View style={styles.journalCopy}>
        <Text style={styles.journalName} numberOfLines={1}>{item.commonName}</Text>
        <Text style={styles.journalMeta} numberOfLines={1}>{journalDate(item.timestamp)}{coordinates ? ` · ${coordinates}` : ""}</Text>
        <Text style={styles.journalEvidence}>{evidence}</Text>
      </View>
      <View style={styles.journalEnd}>
        <View style={[styles.journalRarityChip, { backgroundColor: RARITY_COLORS[rarity] }]}><Text style={styles.rarityChipText}>{rarity.charAt(0).toUpperCase() + rarity.slice(1)}</Text></View>
        <Ionicons name="chevron-forward" size={17} color="#7b8e82" />
      </View>
    </Pressable>;
  };

  const content = !entries.length
    ? <ScrollView contentContainerStyle={styles.emptyContent}>
      <View>{header}{modeSwitch}{backupArea}{questArea}{earTrainingArea}{hallOfFameArea}{skyfriendArea}</View>
      <View style={styles.center}><Text style={styles.title}>{viewMode === "journal" ? "No journal entries yet" : "Your Bird-dex is empty"}</Text><Text style={styles.copy}>{viewMode === "journal" ? "Capture real birds to start your chronological field journal." : "Explore the map and capture your first bird."}</Text></View>
    </ScrollView>
    : viewMode === "journal"
      ? <FlatList
        key="journal-list"
        contentContainerStyle={styles.list}
        data={journalCaptures}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={<View>{header}{modeSwitch}{backupArea}<Text style={styles.journalIntro}>Your real-bird field journal, newest first. Skyfriends stay separate.</Text></View>}
        ListFooterComponent={<View>{skyfriendArea}</View>}
        renderItem={renderJournalRow}
        ListEmptyComponent={<View style={styles.noMatches}><Text style={styles.noMatchesText}>No real bird observations yet.</Text></View>}
      />
      : <FlatList
        key="collection-grid"
        contentContainerStyle={styles.list}
        data={filteredEntries}
        keyExtractor={(item) => item.key}
        numColumns={2}
        ListHeaderComponent={<View>{header}{modeSwitch}{backupArea}{questArea}{earTrainingArea}{dexControls}</View>}
        ListFooterComponent={<View>{hallOfFameArea}{skyfriendArea}</View>}
        renderItem={renderCard}
        ListEmptyComponent={<View style={styles.noMatches}><Text style={styles.noMatchesText}>No species match this search.</Text></View>}
      />;

  const selectedCapture = selected?.capture;
  const selectedCaptures = selected
    ? captures
      .filter((capture) => selected.captureIds.includes(capture.id))
      .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp))
    : [];
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
            {selectedCaptures.length ? <View style={styles.historyArea}>
              <Text style={styles.historyTitle}>Observation history</Text>
              {selectedCaptures.slice(0, 4).map((capture) => {
                const captureCoordinates = coordinateLabel(capture.location?.latitude, capture.location?.longitude);
                return <View key={capture.id} style={styles.historyRow}>
                  {capture.photoUri
                    ? <Image source={{ uri: capture.photoUri }} style={styles.historyImage} />
                    : <View style={[styles.historyImage, styles.historyImageEmpty]}><Ionicons name={capture.verified ? "camera" : "hand-left"} size={16} color="#64776c" /></View>}
                  <View style={styles.historyCopy}>
                    <Text style={styles.historyDate}>{shortDate(capture.timestamp)}</Text>
                    <Text style={styles.historyMeta} numberOfLines={1}>{capture.verified ? "AI verified photo" : capture.photoUri ? "Unverified photo" : "Honor-system sighting"}{captureCoordinates ? ` · ${captureCoordinates}` : ""}</Text>
                  </View>
                </View>;
              })}
              {selectedCaptures.length > 4 ? <Text style={styles.historyMore}>+{selectedCaptures.length - 4} more observation{selectedCaptures.length - 4 === 1 ? "" : "s"}</Text> : null}
            </View> : null}
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
          <Text style={styles.modalCopy}>{pendingRelease?.commonName} will remove {pendingRelease?.recordLabel} from your captured collection and return to its seen state if it is still in this area. Trainer XP you already earned is kept.</Text>
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
  searchArea: { margin: 5, marginBottom: 10, gap: 8 },
  searchBox: { minHeight: 44, borderRadius: 14, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#dce6df" },
  searchInput: { flex: 1, minWidth: 0, color: "#173c2b", fontSize: 14, fontWeight: "700", paddingVertical: 10 },
  filterRow: { flexDirection: "row", gap: 7 },
  filterChip: { minHeight: 34, borderRadius: 17, paddingHorizontal: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#e7eeea" },
  filterChipActive: { backgroundColor: "#2f7d5b" },
  filterChipText: { color: "#486155", fontSize: 12, fontWeight: "900" },
  filterChipTextActive: { color: "#ffffff" },
  noMatches: { padding: 28, alignItems: "center" },
  noMatchesText: { color: "#68796f", fontWeight: "700" },
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
  badgeHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12, marginBottom: 7 },
  badgeHeader: { color: "#dff4e7", fontSize: 12, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.8 },
  badgeCount: { color: "#a9c9b4", fontSize: 11, fontWeight: "900" },
  badgeRow: { gap: 7, paddingRight: 6 },
  milestoneCard: { width: 96, minHeight: 76, alignItems: "center", justifyContent: "center", gap: 3, borderRadius: 14, paddingHorizontal: 7, paddingVertical: 8, backgroundColor: "rgba(255,255,255,.10)", borderWidth: 1, borderColor: "rgba(255,255,255,.12)" },
  milestoneLocked: { opacity: 0.62 },
  milestoneIconWrap: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,.14)" },
  milestoneIconEarned: { backgroundColor: "#ffd766" },
  milestoneTitle: { color: "#fff", fontSize: 10, fontWeight: "900", textAlign: "center" },
  milestoneProgress: { color: "#a9c9b4", fontSize: 10, fontWeight: "800" },
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
  skyfriendCardPrismatic: { borderWidth: 2, borderColor: "#ffd766", backgroundColor: "#4a3f78" },
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
  modeSwitch: { marginTop: 12, padding: 3, borderRadius: 999, backgroundColor: "#e4ede7", flexDirection: "row", gap: 3 },
  modeButton: { flex: 1, minHeight: 34, borderRadius: 999, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  modeButtonActive: { backgroundColor: "#ffffff", shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 5, shadowOffset: { width: 0, height: 1 } },
  modeButtonText: { color: "#60766a", fontSize: 11, fontWeight: "900" },
  modeButtonTextActive: { color: "#173c2b" },
  journalIntro: { marginTop: 10, marginBottom: 2, color: "#6d7f74", fontSize: 10, lineHeight: 14, fontWeight: "700", textAlign: "center" },
  journalRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#ffffff", borderRadius: 14, borderWidth: 1, borderColor: "#dfe8e2", padding: 10, marginBottom: 8 },
  journalImage: { width: 48, height: 48, borderRadius: 12, backgroundColor: "#d8e4db" },
  journalImageEmpty: { alignItems: "center", justifyContent: "center" },
  journalCopy: { flex: 1, flexShrink: 1, minWidth: 0 },
  journalName: { color: "#173c2b", fontSize: 13, fontWeight: "900" },
  journalMeta: { marginTop: 3, color: "#68796f", fontSize: 10, fontWeight: "700" },
  journalEvidence: { marginTop: 3, color: "#45675a", fontSize: 9, fontWeight: "800" },
  journalEnd: { flexShrink: 0, flexDirection: "row", alignItems: "center", gap: 4 },
  journalRarityChip: { borderRadius: 9, paddingHorizontal: 7, paddingVertical: 3 },
  historyArea: { marginTop: 13, padding: 11, borderRadius: 13, backgroundColor: "#f0f5f1", borderWidth: 1, borderColor: "#dfe8e2", gap: 8 },
  historyTitle: { color: "#173c2b", fontSize: 12, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.7 },
  historyRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  historyImage: { width: 38, height: 38, borderRadius: 10, backgroundColor: "#d8e4db" },
  historyImageEmpty: { alignItems: "center", justifyContent: "center" },
  historyCopy: { flex: 1, minWidth: 0 },
  historyDate: { color: "#263f32", fontSize: 12, fontWeight: "900" },
  historyMeta: { color: "#68796f", fontSize: 10, fontWeight: "700", marginTop: 2 },
  historyMore: { color: "#5c6f65", fontSize: 10, fontWeight: "800", textAlign: "center", marginTop: 2 },
  detailActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 14 },
  modalCard: { width: "100%", maxWidth: 360, maxHeight: "92%", borderRadius: 16, padding: 20, backgroundColor: "#fff" },
  modalTitle: { color: "#173c2b", fontSize: 20, fontWeight: "700" },
  modalCopy: { color: "#49584f", lineHeight: 20, marginTop: 10 },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 18 },
  modalKeep: { minHeight: 44, minWidth: 80, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#e8eeea" },
  modalRelease: { minHeight: 44, minWidth: 90, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#8f3d3d" },
  modalReleaseText: { color: "#fff", fontWeight: "700" },
});
