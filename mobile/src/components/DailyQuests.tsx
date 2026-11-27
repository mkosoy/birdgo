import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { CaptureRecord, SkyfriendRecord } from "../types";
import { buildDailyQuests, type DailyQuest } from "../utils/quests";

interface DailyQuestsProps {
  captures: CaptureRecord[];
  skyfriends: SkyfriendRecord[];
  claimedIds: string[];
  onClaim: (questId: string, rewardXp: number) => Promise<boolean>;
}

function questStatus(quest: DailyQuest, claimed: boolean): string {
  if (claimed) return "Claimed";
  if (quest.completed) return `+${quest.rewardXp} XP`;
  return `${quest.progress}/${quest.target}`;
}

function RewardBurst({ xp }: { xp: number }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(progress, { toValue: 1, duration: 950, useNativeDriver: true }).start();
  }, [progress]);
  return <Animated.Text style={[styles.rewardBurst, {
    opacity: progress.interpolate({ inputRange: [0, 0.18, 1], outputRange: [0, 1, 0] }),
    transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, -30] }) }],
  }]}>+{xp} XP</Animated.Text>;
}

export function DailyQuests({ captures, skyfriends, claimedIds, onClaim }: DailyQuestsProps) {
  const [claimingId, setClaimingId] = useState<string>();
  const [burst, setBurst] = useState<{ claimKey: string; xp: number }>();
  const [now, setNow] = useState(() => new Date());
  const burstTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const quests = useMemo(() => buildDailyQuests(captures, skyfriends, now), [captures, skyfriends, now]);
  const claimed = useMemo(() => new Set(claimedIds), [claimedIds]);
  const completedCount = quests.filter((quest) => quest.completed).length;

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const scheduleMidnightRefresh = () => {
      const current = new Date();
      const nextDay = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1, 0, 0, 2);
      timeout = setTimeout(() => {
        setNow(new Date());
        scheduleMidnightRefresh();
      }, Math.max(1000, nextDay.getTime() - current.getTime()));
    };
    scheduleMidnightRefresh();
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => () => {
    if (burstTimeoutRef.current) clearTimeout(burstTimeoutRef.current);
  }, []);

  const claim = async (quest: DailyQuest) => {
    if (!quest.completed || claimed.has(quest.claimKey) || claimingId) return;
    setClaimingId(quest.claimKey);
    try {
      const didClaim = await onClaim(quest.claimKey, quest.rewardXp);
      if (didClaim) {
        if (burstTimeoutRef.current) clearTimeout(burstTimeoutRef.current);
        setBurst({ claimKey: quest.claimKey, xp: quest.rewardXp });
        burstTimeoutRef.current = setTimeout(() => setBurst(undefined), 1000);
      }
    } finally {
      setClaimingId(undefined);
    }
  };

  return <View style={styles.area}>
    <View style={styles.headerRow}>
      <View style={styles.titleWrap}>
        <Text style={styles.title}>Today’s quests</Text>
        <Text style={styles.subtitle}>Fresh objectives every day · rewards claim once</Text>
      </View>
      <View style={styles.countPill}><Text style={styles.countText}>{completedCount}/{quests.length}</Text></View>
    </View>
    {quests.map((quest) => {
      const isClaimed = claimed.has(quest.claimKey);
      const canClaim = quest.completed && !isClaimed;
      const progress = quest.progress / quest.target;
      return <View key={quest.claimKey} style={[styles.questRow, isClaimed && styles.questRowClaimed]}>
        <View style={[styles.iconWrap, quest.completed && styles.iconWrapComplete]}>
          <Ionicons name={quest.icon} size={17} color={quest.completed ? "#173c2b" : "#d9efe1"} />
        </View>
        <View style={styles.copy}>
          <View style={styles.questTitleRow}>
            <Text style={styles.questTitle} numberOfLines={1}>{quest.title}</Text>
            <Text style={styles.reward}>{quest.rewardXp} XP</Text>
          </View>
          <Text style={styles.detail} numberOfLines={2}>{quest.detail}</Text>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} /></View>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`${questStatus(quest, isClaimed)} for ${quest.title}`} disabled={!canClaim || Boolean(claimingId)} style={[styles.claimButton, canClaim && styles.claimButtonReady, (!canClaim || Boolean(claimingId)) && styles.claimButtonDisabled]} onPress={() => void claim(quest)}>
          {claimingId === quest.claimKey
            ? <ActivityIndicator size="small" color="#173c2b" />
            : <Text style={[styles.claimText, canClaim && styles.claimTextReady]}>{questStatus(quest, isClaimed)}</Text>}
        </Pressable>
        {burst?.claimKey === quest.claimKey ? <RewardBurst xp={burst.xp} /> : null}
      </View>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  area: { margin: 5, marginBottom: 12, padding: 13, borderRadius: 18, backgroundColor: "#173c2b", elevation: 3 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  titleWrap: { flex: 1 },
  title: { color: "#eaf6ee", fontSize: 19, fontWeight: "900" },
  subtitle: { color: "#a9c9b4", fontSize: 10, fontWeight: "700", marginTop: 2 },
  countPill: { minWidth: 42, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "#65d184" },
  countText: { color: "#173c2b", fontSize: 13, fontWeight: "900" },
  questRow: { flexDirection: "row", alignItems: "center", gap: 9, minHeight: 67, marginTop: 6, padding: 8, borderRadius: 14, backgroundColor: "#224d39" },
  questRowClaimed: { opacity: 0.72 },
  iconWrap: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "#2f7d5b" },
  iconWrapComplete: { backgroundColor: "#ffd766" },
  copy: { flex: 1, minWidth: 0 },
  questTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  questTitle: { flex: 1, color: "#f1f8f3", fontSize: 13, fontWeight: "900" },
  reward: { color: "#ffd766", fontSize: 9, fontWeight: "900" },
  detail: { color: "#bdd5c5", fontSize: 10, lineHeight: 13, marginTop: 1 },
  progressTrack: { height: 5, borderRadius: 4, overflow: "hidden", backgroundColor: "#10291d", marginTop: 5 },
  progressFill: { height: "100%", borderRadius: 4, backgroundColor: "#65d184" },
  claimButton: { width: 66, minHeight: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", paddingHorizontal: 4, backgroundColor: "#e9f1eb" },
  claimButtonReady: { backgroundColor: "#ffd766" },
  claimButtonDisabled: { opacity: 0.72 },
  claimText: { color: "#506157", fontSize: 10, fontWeight: "900", textAlign: "center" },
  claimTextReady: { color: "#263019" },
  rewardBurst: { position: "absolute", right: 13, top: -1, color: "#ffd766", fontSize: 13, fontWeight: "900", textShadowColor: "rgba(0,0,0,.28)", textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } },
});
