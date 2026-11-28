import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Audio } from "expo-av";
import Ionicons from "@expo/vector-icons/Ionicons";
import { fetchSpeciesGuide } from "../api";
import type { SpeciesGuide as SpeciesGuideData, SpeciesGuideSound } from "../types";
import tzLookup from "@photostructure/tz-lookup";
import { observationTimeMs } from "../utils/observationTime";

interface HuntBrief {
  latitude: number;
  longitude: number;
  locName?: string;
  obsDt?: string;
  obsValid?: boolean;
  evidenceCount?: number;
  source?: string;
  distanceKm: number;
}

interface SpeciesGuideProps {
  commonName: string;
  sciName?: string | null;
  showImage?: boolean;
  compact?: boolean;
  maxSounds?: number;
  hunt?: HuntBrief;
}

function huntAgeLabel(obsDt: string | undefined, longitude: number, latitude: number): string {
  const observedAt = observationTimeMs(obsDt, longitude, latitude);
  if (observedAt == null) return "recently";
  const hours = Math.max(0, (Date.now() - observedAt) / 3_600_000);
  if (hours < 1) return "within the hour";
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function localReportTimeLabel(obsDt: string | undefined, longitude: number, latitude: number): string | undefined {
  const trimmed = obsDt?.trim();
  if (!trimmed) return undefined;
  if (/(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(trimmed)) {
    const utcMs = observationTimeMs(trimmed, longitude, latitude);
    if (utcMs == null) return undefined;
    try {
      return new Intl.DateTimeFormat("en-US", { timeZone: tzLookup(latitude, longitude), hour: "numeric", minute: "2-digit" }).format(new Date(utcMs));
    } catch {
      return undefined;
    }
  }
  const time = trimmed.replace("T", " ").split(" ")[1]?.slice(0, 5);
  if (!time) return undefined;
  const [hourText, minute] = time.split(":");
  const hour = Number(hourText);
  if (!Number.isFinite(hour) || !minute) return undefined;
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${minute} ${suffix}`;
}

function huntDistanceLabel(distanceKm: number): string {
  if (distanceKm < 0.05) return "here";
  return distanceKm < 1 ? `${Math.round(distanceKm * 1000)}m away` : `${distanceKm.toFixed(1)}km away`;
}

function huntEvidenceLabel(hunt: HuntBrief): string {
  if (hunt.source === "birdweather") return "Audio clue — search within earshot, not just at the station pin.";
  const reports = hunt.evidenceCount ?? 1;
  if (reports >= 3) return hunt.obsValid === false
    ? `${reports > 4 ? "5+" : reports} fresh reports — a strong lead, though the latest report is still unconfirmed.`
    : `${reports > 4 ? "5+" : reports} fresh reports — a strong lead, still not a guarantee.`;
  if (reports === 2) return hunt.obsValid === false
    ? "Two fresh reports, but the latest is unconfirmed — treat this as a lead."
    : "Two fresh reports — a stronger lead, still not a guarantee.";
  if (hunt.obsValid === false) return "Single unconfirmed report — treat this as a lead, not a guarantee.";
  return "Single recent report — the bird is not guaranteed to still be there.";
}

function durationLabel(seconds?: number): string {
  if (!seconds || !Number.isFinite(seconds)) return "audio";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

export function SpeciesGuide({ commonName, sciName, showImage = false, compact = false, maxSounds, hunt }: SpeciesGuideProps) {
  const [guide, setGuide] = useState<SpeciesGuideData>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [playingId, setPlayingId] = useState<string>();
  const [busyId, setBusyId] = useState<string>();
  const soundRef = useRef<Audio.Sound | null>(null);
  const activeSoundIdRef = useRef<string>();
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const finishedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setGuide(undefined);
    void fetchSpeciesGuide({ commonName, sciName })
      .then((result) => {
        if (!cancelled) setGuide(result);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [commonName, sciName]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      void soundRef.current?.unloadAsync();
      soundRef.current = null;
    };
  }, []);

  const toggleSound = async (entry: SpeciesGuideSound) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusyId(entry.id);
    try {
      if (playingId === entry.id && soundRef.current) {
        await soundRef.current.pauseAsync();
        finishedRef.current = false;
        if (mountedRef.current) setPlayingId(undefined);
        return;
      }
      if (activeSoundIdRef.current === entry.id && soundRef.current) {
        if (finishedRef.current) await soundRef.current.setPositionAsync(0);
        await soundRef.current.playAsync();
        finishedRef.current = false;
        if (mountedRef.current) setPlayingId(entry.id);
        return;
      }
      await soundRef.current?.unloadAsync();
      soundRef.current = null;
      activeSoundIdRef.current = undefined;
      finishedRef.current = false;
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      if (!mountedRef.current) return;
      const created = await Audio.Sound.createAsync(
        { uri: entry.url },
        { shouldPlay: true },
      );
      if (!mountedRef.current) {
        await created.sound.unloadAsync();
        return;
      }
      soundRef.current = created.sound;
      activeSoundIdRef.current = entry.id;
      created.sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) return;
        if (status.didJustFinish) {
          finishedRef.current = true;
          if (mountedRef.current) setPlayingId(undefined);
        }
      });
      if (mountedRef.current) setPlayingId(entry.id);
    } catch {
      if (mountedRef.current) setPlayingId(undefined);
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setBusyId(undefined);
    }
  };

  const visibleSounds = guide?.sounds.slice(0, maxSounds ?? guide.sounds.length) ?? [];
  const hasContent = Boolean(guide?.summary || visibleSounds.length);
  const huntReportTime = hunt ? localReportTimeLabel(hunt.obsDt, hunt.longitude, hunt.latitude) : undefined;

  return <View style={[styles.container, compact && styles.compact]}>
    <View style={styles.headerRow}>
      <View style={styles.headerIcon}><Ionicons name="book" size={16} color="#dff4e7" /></View>
      <Text style={styles.header}>Field guide</Text>
    </View>
    {hunt ? <View style={styles.huntBrief}>
      <Text style={styles.huntTitle}>Hunt brief</Text>
      <Text style={styles.huntText}>Latest report {huntReportTime ? `${huntReportTime} local · ` : ""}{huntAgeLabel(hunt.obsDt, hunt.longitude, hunt.latitude)} · {huntDistanceLabel(hunt.distanceKm)}{hunt.locName ? ` · ${hunt.locName}` : ""}</Text>
      <Text style={styles.huntText}>{huntEvidenceLabel(hunt)}</Text>
      <Text style={styles.huntTip}>Listen first, then scan quietly near the report area.</Text>
    </View> : null}
    {loading ? <View style={styles.loadingRow}><ActivityIndicator color="#2f7d5b" /><Text style={styles.loadingText}>Loading species notes and sounds…</Text></View> : null}
    {!loading && error ? <Text style={styles.emptyText}>Field guide unavailable right now.</Text> : null}
    {!loading && !error && !hasContent ? <Text style={styles.emptyText}>No species notes or sounds found yet.</Text> : null}
    {!loading && showImage && guide?.imageUrl ? <Image source={{ uri: guide.imageUrl }} style={styles.heroImage} /> : null}
    {!loading && guide?.summary ? <>
      <Text style={styles.summary} numberOfLines={compact ? 5 : undefined}>{guide.summary}</Text>
      {guide.summaryUrl ? <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(guide.summaryUrl as string)}><Text style={styles.sourceLink}>Read more on Wikipedia</Text></Pressable> : null}
    </> : null}
    {!loading && visibleSounds.length ? <>
      <Text style={styles.listenTitle}>Listen</Text>
      {visibleSounds.map((entry) => {
        const playing = playingId === entry.id;
        const busy = busyId === entry.id;
        return <View key={entry.id} style={[styles.soundRow, playing && styles.soundRowPlaying]}>
          <Pressable accessibilityRole="button" accessibilityLabel={`${playing ? "Pause" : "Play"} ${entry.title}`} style={styles.soundMain} onPress={() => void toggleSound(entry)}>
            <View style={[styles.playButton, playing && styles.playButtonPlaying]}>
              {busy ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name={playing ? "pause" : "play"} size={17} color="#fff" />}
            </View>
            <View style={styles.soundCopy}>
              <Text style={styles.soundTitle} numberOfLines={1}>{durationLabel(entry.durationSeconds)} · {entry.recordingType ?? "field recording"}</Text>
              {entry.description ? <Text style={styles.soundDescription} numberOfLines={2}>{entry.description}</Text> : null}
              <Text style={styles.soundMeta} numberOfLines={1}>{entry.recordist ?? "Unknown recordist"}{entry.license ? ` · ${entry.license}` : ""}</Text>
            </View>
          </Pressable>
          {entry.descriptionUrl ? <Pressable accessibilityRole="link" accessibilityLabel={`Open audio source for ${entry.title}`} hitSlop={8} style={styles.sourceButton} onPress={() => void Linking.openURL(entry.descriptionUrl as string)}><Ionicons name="open-outline" size={17} color="#5c6f65" /></Pressable> : null}
        </View>;
      })}
      <Text style={styles.attribution}>Audio from {[...new Set(visibleSounds.map((sound) => sound.source ?? "Wikimedia Commons / xeno-canto"))].join(" and ")}; licenses shown per recording.</Text>
    </> : null}
    {!loading && !error && guide && !guide.sounds.length ? <Text style={styles.noSoundText}>No species recording is available yet.</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  container: { marginTop: 12, padding: 13, borderRadius: 15, backgroundColor: "#edf5ef", borderWidth: 1, borderColor: "#d9e7dd" },
  compact: { padding: 11 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 8 },
  headerIcon: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#2f7d5b" },
  header: { color: "#173c2b", fontSize: 14, fontWeight: "900" },
  huntBrief: { borderRadius: 12, backgroundColor: "#fff8df", borderWidth: 1, borderColor: "#e3bc4f", padding: 10, marginBottom: 9, gap: 4 },
  huntTitle: { color: "#6c4d08", fontSize: 11, fontWeight: "900", letterSpacing: 0.7, textTransform: "uppercase" },
  huntText: { color: "#40564a", fontSize: 12, lineHeight: 17, fontWeight: "700" },
  huntTip: { color: "#2f7d5b", fontSize: 12, lineHeight: 17, fontWeight: "900" },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 38 },
  loadingText: { color: "#5c6f65", fontSize: 12, fontWeight: "700" },
  emptyText: { color: "#68796f", fontSize: 12, lineHeight: 17 },
  heroImage: { width: "100%", height: 150, borderRadius: 12, backgroundColor: "#d8e5db", marginBottom: 9 },
  summary: { color: "#40564a", fontSize: 13, lineHeight: 19 },
  sourceLink: { color: "#2878d1", fontSize: 12, fontWeight: "800", marginTop: 5 },
  listenTitle: { color: "#173c2b", fontSize: 12, fontWeight: "900", marginTop: 12, marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.7 },
  soundRow: { flexDirection: "row", alignItems: "center", gap: 2, minHeight: 50, borderRadius: 12, paddingHorizontal: 7, paddingVertical: 6, backgroundColor: "#fff", marginTop: 5 },
  soundRowPlaying: { backgroundColor: "#e0f2e7" },
  playButton: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "#2f7d5b" },
  playButtonPlaying: { backgroundColor: "#d99d21" },
  soundMain: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 9 },
  soundCopy: { flex: 1, minWidth: 0 },
  sourceButton: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "#eef4ef" },
  soundTitle: { color: "#263f32", fontSize: 12, fontWeight: "900" },
  soundDescription: { color: "#4c6255", fontSize: 10, lineHeight: 14, marginTop: 2 },
  soundMeta: { color: "#68796f", fontSize: 10, fontWeight: "700", marginTop: 2 },
  attribution: { color: "#7b8a80", fontSize: 9, lineHeight: 13, marginTop: 7 },
  noSoundText: { color: "#748379", fontSize: 11, lineHeight: 15, marginTop: 7 },
});
