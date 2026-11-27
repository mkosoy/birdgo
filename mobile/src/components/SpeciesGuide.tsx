import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Audio } from "expo-av";
import Ionicons from "@expo/vector-icons/Ionicons";
import { fetchSpeciesGuide } from "../api";
import type { SpeciesGuide as SpeciesGuideData, SpeciesGuideSound } from "../types";

interface SpeciesGuideProps {
  commonName: string;
  sciName?: string | null;
  showImage?: boolean;
  compact?: boolean;
}

function durationLabel(seconds?: number): string {
  if (!seconds || !Number.isFinite(seconds)) return "audio";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

export function SpeciesGuide({ commonName, sciName, showImage = false, compact = false }: SpeciesGuideProps) {
  const [guide, setGuide] = useState<SpeciesGuideData>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [playingId, setPlayingId] = useState<string>();
  const [busyId, setBusyId] = useState<string>();
  const soundRef = useRef<Audio.Sound | null>(null);
  const activeSoundIdRef = useRef<string>();

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

  useEffect(() => () => {
    void soundRef.current?.unloadAsync();
    soundRef.current = null;
  }, []);

  const toggleSound = async (entry: SpeciesGuideSound) => {
    if (busyId) return;
    try {
      if (playingId === entry.id && soundRef.current) {
        await soundRef.current.pauseAsync();
        setPlayingId(undefined);
        return;
      }
      setBusyId(entry.id);
      if (activeSoundIdRef.current === entry.id && soundRef.current) {
        await soundRef.current.playAsync();
        setPlayingId(entry.id);
        return;
      }
      await soundRef.current?.unloadAsync();
      const created = await Audio.Sound.createAsync(
        { uri: entry.url },
        { shouldPlay: true },
      );
      soundRef.current = created.sound;
      activeSoundIdRef.current = entry.id;
      created.sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) return;
        if (status.didJustFinish) setPlayingId(undefined);
      });
      setPlayingId(entry.id);
    } catch {
      setPlayingId(undefined);
    } finally {
      setBusyId(undefined);
    }
  };

  const hasContent = Boolean(guide?.summary || guide?.sounds.length);

  return <View style={[styles.container, compact && styles.compact]}>
    <View style={styles.headerRow}>
      <View style={styles.headerIcon}><Ionicons name="book" size={16} color="#dff4e7" /></View>
      <Text style={styles.header}>Field guide</Text>
    </View>
    {loading ? <View style={styles.loadingRow}><ActivityIndicator color="#2f7d5b" /><Text style={styles.loadingText}>Loading species notes and sounds…</Text></View> : null}
    {!loading && error ? <Text style={styles.emptyText}>Field guide unavailable right now.</Text> : null}
    {!loading && !error && !hasContent ? <Text style={styles.emptyText}>No species notes or sounds found yet.</Text> : null}
    {!loading && showImage && guide?.imageUrl ? <Image source={{ uri: guide.imageUrl }} style={styles.heroImage} /> : null}
    {!loading && guide?.summary ? <>
      <Text style={styles.summary} numberOfLines={compact ? 5 : undefined}>{guide.summary}</Text>
      {guide.summaryUrl ? <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(guide.summaryUrl as string)}><Text style={styles.sourceLink}>Read more on Wikipedia</Text></Pressable> : null}
    </> : null}
    {!loading && guide?.sounds.length ? <>
      <Text style={styles.listenTitle}>Listen</Text>
      {guide.sounds.map((entry) => {
        const playing = playingId === entry.id;
        const busy = busyId === entry.id;
        return <Pressable key={entry.id} accessibilityRole="button" accessibilityLabel={`${playing ? "Pause" : "Play"} ${entry.title}`} style={[styles.soundRow, playing && styles.soundRowPlaying]} onPress={() => void toggleSound(entry)}>
          <View style={[styles.playButton, playing && styles.playButtonPlaying]}>
            {busy ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name={playing ? "pause" : "play"} size={17} color="#fff" />}
          </View>
          <View style={styles.soundCopy}>
            <Text style={styles.soundTitle} numberOfLines={1}>{durationLabel(entry.durationSeconds)} · bird sound</Text>
            <Text style={styles.soundMeta} numberOfLines={1}>{entry.recordist ?? "Unknown recordist"}{entry.license ? ` · ${entry.license}` : ""}</Text>
          </View>
          {entry.descriptionUrl ? <Pressable accessibilityRole="link" accessibilityLabel="Open audio source" hitSlop={8} onPress={(event) => { event.stopPropagation?.(); void Linking.openURL(entry.descriptionUrl as string); }}><Ionicons name="open-outline" size={17} color="#5c6f65" /></Pressable> : null}
        </Pressable>;
      })}
      <Text style={styles.attribution}>Audio from Wikimedia Commons / xeno-canto contributors; licenses shown per recording.</Text>
    </> : null}
  </View>;
}

const styles = StyleSheet.create({
  container: { marginTop: 12, padding: 13, borderRadius: 15, backgroundColor: "#edf5ef", borderWidth: 1, borderColor: "#d9e7dd" },
  compact: { padding: 11 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 8 },
  headerIcon: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#2f7d5b" },
  header: { color: "#173c2b", fontSize: 14, fontWeight: "900" },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 38 },
  loadingText: { color: "#5c6f65", fontSize: 12, fontWeight: "700" },
  emptyText: { color: "#68796f", fontSize: 12, lineHeight: 17 },
  heroImage: { width: "100%", height: 150, borderRadius: 12, backgroundColor: "#d8e5db", marginBottom: 9 },
  summary: { color: "#40564a", fontSize: 13, lineHeight: 19 },
  sourceLink: { color: "#2878d1", fontSize: 12, fontWeight: "800", marginTop: 5 },
  listenTitle: { color: "#173c2b", fontSize: 12, fontWeight: "900", marginTop: 12, marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.7 },
  soundRow: { flexDirection: "row", alignItems: "center", gap: 9, minHeight: 50, borderRadius: 12, paddingHorizontal: 7, paddingVertical: 6, backgroundColor: "#fff", marginTop: 5 },
  soundRowPlaying: { backgroundColor: "#e0f2e7" },
  playButton: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "#2f7d5b" },
  playButtonPlaying: { backgroundColor: "#d99d21" },
  soundCopy: { flex: 1, minWidth: 0 },
  soundTitle: { color: "#263f32", fontSize: 12, fontWeight: "900" },
  soundMeta: { color: "#68796f", fontSize: 10, fontWeight: "700", marginTop: 1 },
  attribution: { color: "#7b8a80", fontSize: 9, lineHeight: 13, marginTop: 7 },
});
