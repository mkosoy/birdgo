import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { xpForBirdwalk, type BirdwalkPlan, type BirdwalkState } from "../utils/birdwalk";

interface BirdwalkPlannerProps {
  plan: BirdwalkPlan;
  active?: BirdwalkState;
  tracking: boolean;
  rewardClaimed: boolean;
  onStart: () => void;
  onSkip: () => void;
  onEnd: () => void;
}

function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}

export function BirdwalkPlanner({ plan, active, tracking, rewardClaimed, onStart, onSkip, onEnd }: BirdwalkPlannerProps) {
  const [open, setOpen] = useState(false);
  const stops = active?.stops ?? plan.stops;
  const index = active?.index ?? 0;
  if (!stops.length) return null;
  const current = stops[Math.min(index, stops.length - 1)];
  const finalStop = stops[stops.length - 1];
  const remainingDistanceKm = active
    ? stops.slice(index).reduce((total, stop) => total + (stop.legDistanceKm ?? stop.distanceKm), 0)
    : plan.totalDistanceKm;
  const rewardXp = xpForBirdwalk(stops.length);

  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="Open birdwalk plan" style={styles.card} onPress={() => setOpen(true)}>
      <View style={styles.iconWrap}><Ionicons name="walk" size={21} color="#fff" /></View>
      <View style={styles.cardCopy}>
        <Text style={styles.cardTitle}>{active ? `Birdwalk ${Math.min(index + 1, stops.length)}/${stops.length}` : "Birdwalk nearby"}</Text>
        <Text style={styles.cardSubtitle} numberOfLines={1}>{active ? `Next: ${current.commonName}` : stops.length > 1 ? `${stops.length}-stop walk to ${finalStop.commonName}` : `Walk to ${finalStop.commonName}`}</Text>
      </View>
      <View style={styles.viewPill}><Text style={styles.viewPillText}>View</Text></View>
    </Pressable>

    <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel="Close birdwalk plan" style={styles.backdropPress} onPress={() => setOpen(false)} />
        <View style={styles.sheet}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.headerRow}>
              <View style={styles.titleWrap}>
                <Text style={styles.title}>Birdwalk</Text>
                <Text style={styles.subtitle}>A short walking route through nearby birds and Skyfriends</Text>
              </View>
              <Pressable accessibilityLabel="Close birdwalk plan" hitSlop={10} onPress={() => setOpen(false)}><Ionicons name="close" size={24} color="#52645a" /></Pressable>
            </View>
            <View style={styles.summaryRow}>
              <View style={styles.summaryPill}><Text style={styles.summaryText}>{stops.length} stops</Text></View>
              <View style={styles.summaryPill}><Text style={styles.summaryText}>{formatDistance(remainingDistanceKm)}+ walk</Text></View>
              <View style={styles.summaryPill}><Text style={styles.summaryText}>{rewardClaimed ? "XP bonus earned today" : `Finish for up to +${rewardXp} XP`}</Text></View>
              {active ? <View style={[styles.summaryPill, styles.activePill]}><Text style={styles.activePillText}>{tracking ? "following" : "paused"}</Text></View> : null}
            </View>
            <View style={styles.stopList}>
              {stops.map((stop, stopIndex) => {
                const skipped = Boolean(active?.skippedIds?.includes(stop.id));
                const done = Boolean(active && stopIndex < index && !skipped);
                const currentStop = stopIndex === index;
                return <View key={stop.id} style={[styles.stopRow, currentStop && styles.stopRowCurrent, done && styles.stopRowDone]}>
                  <View style={[styles.stopNumber, currentStop && styles.stopNumberCurrent, done && styles.stopNumberDone]}>
                    {done ? <Ionicons name="checkmark" size={15} color="#fff" /> : skipped ? <Ionicons name="remove" size={15} color="#fff" /> : <Text style={styles.stopNumberText}>{stopIndex + 1}</Text>}
                  </View>
                  <View style={styles.stopCopy}>
                    <Text style={styles.stopName} numberOfLines={1}>{stop.commonName}</Text>
                    <Text style={styles.stopMeta}>{skipped ? "Skipped · " : ""}{stop.virtual ? "Skyfriend" : stop.capturedCount ? `Recapture ×${stop.capturedCount}` : "New species"} · {formatDistance(stop.distanceKm)} away</Text>
                  </View>
                  {stop.virtual ? <Ionicons name="sparkles" size={18} color="#735eea" /> : <Ionicons name="leaf" size={18} color="#2f7d5b" />}
                </View>;
              })}
            </View>
            <Text style={styles.safety}>Distances are straight-line minimums, so actual walking routes are longer. Follow safe, legal walking routes and stay aware of your surroundings.</Text>
            <View style={styles.actions}>
              <Pressable accessibilityRole="button" style={[styles.primaryButton, active && tracking && styles.primaryButtonDisabled]} disabled={Boolean(active && tracking)} onPress={() => { setOpen(false); onStart(); }}>
                <Text style={styles.primaryText}>{active ? tracking ? "Following route" : "Resume walk" : "Start walk"}</Text>
                <Ionicons name="navigate" size={15} color="#fff" />
              </Pressable>
              {active ? <>
                {index < stops.length - 1 ? <Pressable accessibilityRole="button" style={styles.secondaryButton} onPress={() => { setOpen(false); onSkip(); }}><Text style={styles.secondaryText}>Skip stop</Text></Pressable> : null}
                <Pressable accessibilityRole="button" style={styles.endButton} onPress={() => { setOpen(false); onEnd(); }}><Text style={styles.endText}>End walk</Text></Pressable>
              </> : null}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  card: { maxWidth: 360, minHeight: 54, borderRadius: 16, padding: 8, paddingRight: 10, flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: "#fffffff0", elevation: 4 },
  iconWrap: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "#2f7d5b" },
  cardCopy: { flex: 1, minWidth: 0 },
  cardTitle: { color: "#173c2b", fontSize: 14, fontWeight: "900" },
  cardSubtitle: { color: "#5f7167", fontSize: 11, fontWeight: "700", marginTop: 1 },
  viewPill: { borderRadius: 12, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: "#e2f1e7" },
  viewPillText: { color: "#2f7d5b", fontSize: 11, fontWeight: "900" },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(12, 31, 22, 0.42)" },
  backdropPress: { ...StyleSheet.absoluteFillObject },
  sheet: { width: "100%", maxWidth: 540, maxHeight: "82%", alignSelf: "center", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, backgroundColor: "#fffdf6" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 14 },
  titleWrap: { flex: 1 },
  title: { color: "#173c2b", fontSize: 25, fontWeight: "900" },
  subtitle: { color: "#68796f", fontSize: 12, lineHeight: 17, marginTop: 3 },
  summaryRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 12 },
  summaryPill: { borderRadius: 12, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: "#edf4ef" },
  summaryText: { color: "#40564a", fontSize: 11, fontWeight: "900" },
  activePill: { backgroundColor: "#d9efe1" },
  activePillText: { color: "#2f7d5b", fontSize: 11, fontWeight: "900" },
  stopList: { gap: 8, marginTop: 14 },
  stopRow: { minHeight: 58, borderRadius: 15, padding: 9, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#f1f6f2", borderWidth: 1, borderColor: "#e1eae4" },
  stopRowCurrent: { backgroundColor: "#e3f4e9", borderColor: "#9ed8b5" },
  stopRowDone: { opacity: 0.64 },
  stopNumber: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#9dafa3" },
  stopNumberCurrent: { backgroundColor: "#2f7d5b" },
  stopNumberDone: { backgroundColor: "#65a97f" },
  stopNumberText: { color: "#fff", fontSize: 12, fontWeight: "900" },
  stopCopy: { flex: 1, minWidth: 0 },
  stopName: { color: "#213d2e", fontSize: 14, fontWeight: "900" },
  stopMeta: { color: "#6c7d72", fontSize: 11, fontWeight: "700", marginTop: 2 },
  safety: { color: "#748379", fontSize: 10, lineHeight: 14, marginTop: 13 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 13 },
  primaryButton: { minHeight: 44, borderRadius: 13, paddingHorizontal: 15, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7, backgroundColor: "#2f7d5b" },
  primaryButtonDisabled: { backgroundColor: "#7b9487" },
  primaryText: { color: "#fff", fontSize: 13, fontWeight: "900" },
  secondaryButton: { minHeight: 44, borderRadius: 13, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#e8eeea" },
  secondaryText: { color: "#40564a", fontSize: 13, fontWeight: "900" },
  endButton: { minHeight: 44, borderRadius: 13, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#f3e3e3" },
  endText: { color: "#8f3d3d", fontSize: 13, fontWeight: "900" },
});
