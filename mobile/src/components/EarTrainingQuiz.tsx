import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Audio } from "expo-av";
import Ionicons from "@expo/vector-icons/Ionicons";
import { fetchSpeciesGuide } from "../api";
import type { SpeciesGuideSound } from "../types";

export interface EarTrainingSpecies {
  key: string;
  practiceKey?: string;
  commonName: string;
  sciName?: string | null;
  imageUrl?: string;
}

interface SpeciesPracticeStats {
  attempts: number;
  correct: number;
}

interface EarTrainingStats {
  attempts: number;
  correct: number;
  streak: number;
  bestStreak: number;
  species?: Record<string, SpeciesPracticeStats>;
}

interface EarTrainingRound {
  target: EarTrainingSpecies;
  choices: EarTrainingSpecies[];
  sound: SpeciesGuideSound;
  imageUrl?: string;
  selectedKey?: string;
}

const STATS_KEY = "birdgo.ear-training-v1";
const EMPTY_STATS: EarTrainingStats = { attempts: 0, correct: 0, streak: 0, bestStreak: 0, species: {} };

function shuffled<T>(items: T[]): T[] {
  return items.map((item) => ({ item, sort: Math.random() })).sort((left, right) => left.sort - right.sort).map(({ item }) => item);
}

function practiceKeyFor(species: EarTrainingSpecies): string {
  return species.practiceKey ?? species.key;
}

function practiceAccuracy(stats?: SpeciesPracticeStats): number | undefined {
  return stats?.attempts ? stats.correct / stats.attempts : undefined;
}

function basePracticeScore(speciesKey: string, stats: EarTrainingStats): number {
  const speciesStats = stats.species?.[speciesKey];
  const accuracy = practiceAccuracy(speciesStats);
  const baseline = accuracy == null ? 0.18 : accuracy;
  const familiarityBonus = Math.min(speciesStats?.attempts ?? 0, 8) * 0.025;
  return baseline + familiarityBonus;
}

function practiceScore(speciesKey: string, stats: EarTrainingStats): number {
  return basePracticeScore(speciesKey, stats) + Math.random() * 0.28;
}

function orderedForPractice(items: EarTrainingSpecies[], stats: EarTrainingStats): EarTrainingSpecies[] {
  return items
    .map((item) => ({ item, score: practiceScore(practiceKeyFor(item), stats) }))
    .sort((left, right) => left.score - right.score)
    .map(({ item }) => item);
}

function attributionFor(sound: SpeciesGuideSound): string {
  return `Audio · ${sound.recordist ?? "Unknown recordist"}${sound.license ? ` · ${sound.license}` : ""}`;
}

export function EarTrainingQuiz({ species }: { species: EarTrainingSpecies[] }) {
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<EarTrainingStats>(EMPTY_STATS);
  const [round, setRound] = useState<EarTrainingRound>();
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [finished, setFinished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const soundRef = useRef<Audio.Sound | null>(null);
  const playbackTokenRef = useRef(0);
  const answerLockRef = useRef(false);
  const lastTargetKeyRef = useRef<string>();
  const roundTokenRef = useRef(0);
  const mountedRef = useRef(true);
  const available = species.length >= 3;

  useEffect(() => {
    mountedRef.current = true;
    void AsyncStorage.getItem(STATS_KEY).then((raw) => {
      if (!raw || !mountedRef.current) return;
      try {
        const parsed = JSON.parse(raw) as Partial<EarTrainingStats>;
        const speciesStats = Object.fromEntries(Object.entries(parsed.species ?? {}).flatMap(([key, value]) => {
          if (!value || typeof value !== "object") return [];
          const practice = value as Partial<SpeciesPracticeStats>;
          return [[key, { attempts: Math.max(0, practice.attempts ?? 0), correct: Math.max(0, practice.correct ?? 0) }]];
        }));
        setStats({
          attempts: Math.max(0, parsed.attempts ?? 0),
          correct: Math.max(0, parsed.correct ?? 0),
          streak: Math.max(0, parsed.streak ?? 0),
          bestStreak: Math.max(0, parsed.bestStreak ?? 0),
          species: speciesStats,
        });
      } catch { /* ignore corrupt local stats */ }
    }).catch(() => undefined);
    return () => {
      mountedRef.current = false;
      void soundRef.current?.unloadAsync();
      soundRef.current = null;
    };
  }, []);

  const saveStats = (next: EarTrainingStats) => {
    setStats(next);
    void AsyncStorage.setItem(STATS_KEY, JSON.stringify(next)).catch(() => undefined);
  };

  const unloadSound = async () => {
    playbackTokenRef.current += 1;
    const sound = soundRef.current;
    soundRef.current = null;
    if (sound) await sound.unloadAsync().catch(() => undefined);
    if (mountedRef.current) {
      setPlaying(false);
      setFinished(false);
    }
  };

  const startRound = async () => {
    if (!available) return;
    const token = ++roundTokenRef.current;
    setLoading(true);
    setError(undefined);
    setRound(undefined);
    answerLockRef.current = false;
    await unloadSound();
    const freshCandidates = orderedForPractice(species.filter((entry) => entry.key !== lastTargetKeyRef.current), stats);
    const repeatedCandidates = shuffled(species.filter((entry) => entry.key === lastTargetKeyRef.current));
    const candidates = [...freshCandidates, ...repeatedCandidates];
    if (token !== roundTokenRef.current || !mountedRef.current) return;
    for (let offset = 0; offset < candidates.length; offset += 4) {
      const batch = candidates.slice(offset, offset + 4);
      const pending = batch.map(async (target) => {
        try {
          return { target, guide: await fetchSpeciesGuide({ commonName: target.commonName, sciName: target.sciName }) };
        } catch {
          return { target, guide: undefined };
        }
      });
      for (const pendingResult of pending) {
        const { target, guide } = await pendingResult;
        if (token !== roundTokenRef.current || !mountedRef.current) return;
        if (!guide?.sounds.length) continue;
        const sound = guide.sounds[Math.floor(Math.random() * guide.sounds.length)];
        const distractors = shuffled(species.filter((entry) => entry.key !== target.key)).slice(0, 2);
        if (distractors.length < 2) continue;
        lastTargetKeyRef.current = target.key;
        setRound({
          target,
          choices: shuffled([target, ...distractors]),
          sound,
          imageUrl: guide.imageUrl ?? target.imageUrl,
        });
        setLoading(false);
        return;
      }
    }
    if (token === roundTokenRef.current && mountedRef.current) {
      setLoading(false);
      setError("No licensed recordings are available for your captured species right now.");
    }
  };

  const openQuiz = () => {
    setOpen(true);
    if (!round && !loading) void startRound();
  };

  const closeQuiz = () => {
    roundTokenRef.current += 1;
    setLoading(false);
    setOpen(false);
    void unloadSound();
  };

  const playSound = async () => {
    if (!round || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      if (soundRef.current) {
        if (playing) {
          await soundRef.current.pauseAsync();
          if (mountedRef.current) setPlaying(false);
          return;
        }
        if (finished) await soundRef.current.setPositionAsync(0);
        await soundRef.current.playAsync();
      } else {
        const playbackToken = playbackTokenRef.current;
        const created = await Audio.Sound.createAsync({ uri: round.sound.url }, { shouldPlay: true });
        if (!mountedRef.current || playbackToken !== playbackTokenRef.current) {
          await created.sound.unloadAsync();
          return;
        }
        soundRef.current = created.sound;
        created.sound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.didJustFinish && mountedRef.current) {
            setPlaying(false);
            setFinished(true);
          }
        });
      }
      if (mountedRef.current) {
        setPlaying(true);
        setFinished(false);
      }
    } catch {
      if (mountedRef.current) setError("This recording could not be played. Try another round.");
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const answer = (choice: EarTrainingSpecies) => {
    if (!round || round.selectedKey || answerLockRef.current) return;
    answerLockRef.current = true;
    const correct = choice.key === round.target.key;
    const targetPractice = stats.species?.[practiceKeyFor(round.target)] ?? { attempts: 0, correct: 0 };
    const next = {
      attempts: stats.attempts + 1,
      correct: stats.correct + (correct ? 1 : 0),
      streak: correct ? stats.streak + 1 : 0,
      bestStreak: correct ? Math.max(stats.bestStreak, stats.streak + 1) : stats.bestStreak,
      species: {
        ...stats.species,
        [practiceKeyFor(round.target)]: {
          attempts: targetPractice.attempts + 1,
          correct: targetPractice.correct + (correct ? 1 : 0),
        },
      },
    };
    saveStats(next);
    setRound({ ...round, selectedKey: choice.key });
  };

  const accuracy = stats.attempts ? Math.round((stats.correct / stats.attempts) * 100) : 0;
  const focusSpecies = stats.attempts
    ? [...species].sort((left, right) => basePracticeScore(practiceKeyFor(left), stats) - basePracticeScore(practiceKeyFor(right), stats))[0]
    : undefined;
  const focusAccuracy = focusSpecies ? practiceAccuracy(stats.species?.[practiceKeyFor(focusSpecies)]) : undefined;

  return <>
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.iconWrap}><Ionicons name="musical-notes" size={20} color="#fff" /></View>
        <View style={styles.cardCopy}>
          <Text style={styles.title}>Ear training</Text>
          <Text style={styles.subtitle}>Name that bird from real licensed field recordings</Text>
        </View>
        <View style={styles.statPill}><Text style={styles.statPillText}>{stats.attempts ? `${accuracy}%` : "NEW"}</Text></View>
      </View>
      <Text style={styles.description}>
        {available
          ? `Train with ${species.length} species you have collected. Best streak ${stats.bestStreak}.${focusSpecies ? ` Focus: ${focusSpecies.commonName}${focusAccuracy == null ? "" : ` · ${Math.round(focusAccuracy * 100)}%`}` : ""}`
          : `Collect ${Math.max(0, 3 - species.length)} more species to unlock bird-sound quizzes.`}
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel={available ? "Start ear training quiz" : "Ear training locked"} disabled={!available} style={[styles.startButton, !available && styles.startDisabled]} onPress={openQuiz}>
        <Text style={styles.startText}>{available ? "Start listening" : "Locked"}</Text>
        <Ionicons name={available ? "play" : "lock-closed"} size={15} color="#fff" />
      </Pressable>
    </View>

    <Modal visible={open} transparent animationType="slide" onRequestClose={closeQuiz}>
      <View style={styles.backdrop}>
        <View style={styles.quizCard}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.quizHeader}>
              <View>
                <Text style={styles.quizTitle}>Name that bird</Text>
                <Text style={styles.quizStats}>{stats.correct}/{stats.attempts} correct · streak {stats.streak}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close ear training" hitSlop={10} onPress={closeQuiz}><Ionicons name="close" size={25} color="#52645a" /></Pressable>
            </View>
            {loading ? <View style={styles.loading}><ActivityIndicator color="#2f7d5b" /><Text style={styles.loadingText}>Finding a good recording…</Text></View> : null}
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {round ? <>
              <Text style={styles.prompt}>Which bird is singing?</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={playing ? "Pause recording" : finished ? "Replay recording" : "Play mystery bird recording"} style={styles.playLarge} onPress={() => void playSound()}>
                {busy ? <ActivityIndicator color="#fff" /> : <Ionicons name={playing ? "volume-high" : "play"} size={30} color="#fff" />}
                <Text style={styles.playLargeText}>{playing ? "Playing… tap to pause" : finished ? "Replay mystery call" : "Play mystery call"}</Text>
              </Pressable>
              <View style={styles.choices}>
                {round.choices.map((choice) => {
                  const answered = Boolean(round.selectedKey);
                  const correct = choice.key === round.target.key;
                  const selected = choice.key === round.selectedKey;
                  return <Pressable key={choice.key} accessibilityRole="button" disabled={answered} style={[styles.choice, answered && correct && styles.choiceCorrect, answered && selected && !correct && styles.choiceWrong]} onPress={() => answer(choice)}>
                    <Text style={[styles.choiceText, answered && correct && styles.choiceTextLight, answered && selected && !correct && styles.choiceTextLight]}>{choice.commonName}</Text>
                    {answered && correct ? <Ionicons name="checkmark-circle" size={19} color="#fff" /> : null}
                    {answered && selected && !correct ? <Ionicons name="close-circle" size={19} color="#fff" /> : null}
                  </Pressable>;
                })}
              </View>
              {round.selectedKey ? <View style={styles.reveal}>
                <Text style={styles.revealTitle}>{round.selectedKey === round.target.key ? "Correct — great ear!" : `It was ${round.target.commonName}.`}</Text>
                <Text style={styles.masteryCopy}>{round.target.commonName} mastery: {Math.round((practiceAccuracy(stats.species?.[practiceKeyFor(round.target)]) ?? 0) * 100)}% over {stats.species?.[practiceKeyFor(round.target)]?.attempts ?? 0} round{(stats.species?.[practiceKeyFor(round.target)]?.attempts ?? 0) === 1 ? "" : "s"}</Text>
                {round.imageUrl ? <Image source={{ uri: round.imageUrl }} style={styles.revealImage} /> : null}
                <Text style={styles.attribution}>{attributionFor(round.sound)}</Text>
                {round.sound.descriptionUrl ? <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(round.sound.descriptionUrl as string)}><Text style={styles.sourceLink}>Open audio source and license details</Text></Pressable> : null}
                <Pressable accessibilityRole="button" style={styles.nextButton} onPress={() => void startRound()}>
                  <Text style={styles.nextText}>Next round</Text>
                  <Ionicons name="arrow-forward" size={15} color="#fff" />
                </Pressable>
              </View> : <Text style={styles.hint}>Listen carefully, then choose the species. You can pause and replay the recording.</Text>}
            </> : null}
            {!loading && !round && error ? <Pressable accessibilityRole="button" style={styles.nextButton} onPress={() => void startRound()}><Text style={styles.nextText}>Try again</Text></Pressable> : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  card: { margin: 5, marginBottom: 12, padding: 14, borderRadius: 18, backgroundColor: "#263d78", elevation: 3 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 11 },
  iconWrap: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "#d99d21" },
  cardCopy: { flex: 1 },
  title: { color: "#f4f8ff", fontSize: 20, fontWeight: "900" },
  subtitle: { color: "#b8c8ed", fontSize: 11, fontWeight: "700", marginTop: 2 },
  statPill: { borderRadius: 13, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: "#72e7ff" },
  statPillText: { color: "#1c2454", fontSize: 11, fontWeight: "900" },
  description: { color: "#d8e4ff", fontSize: 12, lineHeight: 17, marginTop: 10 },
  startButton: { minHeight: 42, marginTop: 11, borderRadius: 13, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7, backgroundColor: "#2f7d5b" },
  startDisabled: { backgroundColor: "#59677d" },
  startText: { color: "#fff", fontSize: 13, fontWeight: "900" },
  backdrop: { flex: 1, backgroundColor: "#0009", alignItems: "center", justifyContent: "center", padding: 18 },
  quizCard: { width: "100%", maxWidth: 390, maxHeight: "92%", borderRadius: 20, padding: 16, backgroundColor: "#fff" },
  quizHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  quizTitle: { color: "#173c2b", fontSize: 23, fontWeight: "900" },
  quizStats: { color: "#68796f", fontSize: 12, fontWeight: "800", marginTop: 3 },
  loading: { minHeight: 160, alignItems: "center", justifyContent: "center", gap: 9 },
  loadingText: { color: "#5c6f65", fontSize: 12, fontWeight: "700" },
  errorText: { color: "#8f3d3d", fontSize: 12, lineHeight: 17, marginTop: 14 },
  prompt: { color: "#40564a", fontSize: 14, fontWeight: "900", textAlign: "center", marginTop: 16 },
  playLarge: { minHeight: 68, marginTop: 10, borderRadius: 17, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 10, backgroundColor: "#2f7d5b" },
  playLargeText: { color: "#fff", fontSize: 15, fontWeight: "900" },
  choices: { gap: 8, marginTop: 13 },
  choice: { minHeight: 48, borderRadius: 13, paddingHorizontal: 13, alignItems: "center", justifyContent: "space-between", flexDirection: "row", backgroundColor: "#edf4ef", borderWidth: 1, borderColor: "#dce8df" },
  choiceCorrect: { backgroundColor: "#2f7d5b", borderColor: "#2f7d5b" },
  choiceWrong: { backgroundColor: "#8f3d3d", borderColor: "#8f3d3d" },
  choiceText: { flex: 1, color: "#263f32", fontSize: 14, fontWeight: "900" },
  choiceTextLight: { color: "#fff" },
  hint: { color: "#748379", fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: 11 },
  reveal: { marginTop: 13, alignItems: "center" },
  revealTitle: { color: "#173c2b", fontSize: 16, fontWeight: "900", textAlign: "center" },
  masteryCopy: { color: "#60766a", fontSize: 11, fontWeight: "800", textAlign: "center", marginTop: 5 },
  revealImage: { width: "100%", height: 142, borderRadius: 14, backgroundColor: "#dce6df", marginTop: 9 },
  attribution: { color: "#748379", fontSize: 10, lineHeight: 14, marginTop: 7, textAlign: "center" },
  sourceLink: { color: "#2878d1", fontSize: 11, fontWeight: "800", marginTop: 4, textAlign: "center" },
  nextButton: { minHeight: 44, minWidth: 136, marginTop: 10, paddingHorizontal: 16, borderRadius: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7, alignSelf: "center", backgroundColor: "#263d78" },
  nextText: { color: "#fff", fontSize: 13, fontWeight: "900" },
});
