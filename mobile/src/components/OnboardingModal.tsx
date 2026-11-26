import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

const STEPS = [
  {
    icon: "map" as const,
    color: "#60c48d",
    title: "Explore nearby",
    copy: "Real birds appear where they were recently reported. Bring birds inside your gold interaction ring before snapping.",
  },
  {
    icon: "camera" as const,
    color: "#f2cf5b",
    title: "Snap or honor-log",
    copy: "Use a photo for AI verification, or tap I saw it when you are close. Verified and honor-system records stay clearly labeled.",
  },
  {
    icon: "sparkles" as const,
    color: "#8bd8ff",
    title: "Meet Skyfriends",
    copy: "Virtual holographic birds appear when real activity is quiet. Spot them through binoculars—they never count as real birds.",
  },
];

export function OnboardingModal({ visible, onDone }: { visible: boolean; onDone: () => void }) {
  return <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
    <View style={styles.backdrop}>
      <View style={styles.card}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.kicker}>Welcome to</Text>
          <Text style={styles.title}>BirdGo Atlas</Text>
          <Text style={styles.subtitle}>A real-world bird collecting adventure.</Text>
          <View style={styles.steps}>
            {STEPS.map((step) => <View key={step.title} style={styles.step}>
              <View style={[styles.iconWrap, { backgroundColor: step.color }]}><Ionicons name={step.icon} size={25} color="#132119" /></View>
              <View style={styles.stepCopy}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepText}>{step.copy}</Text>
              </View>
            </View>)}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Start exploring BirdGo" style={styles.startButton} onPress={onDone}>
            <Text style={styles.startText}>Start exploring</Text>
          </Pressable>
        </ScrollView>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(6, 18, 12, .72)", alignItems: "center", justifyContent: "center", padding: 22 },
  card: { width: "100%", maxWidth: 390, maxHeight: "88%", borderRadius: 24, backgroundColor: "#f4f8f1", overflow: "hidden", shadowColor: "#000", shadowOpacity: 0.28, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  scrollContent: { padding: 24, paddingBottom: 20 },
  kicker: { color: "#55705f", fontSize: 12, fontWeight: "900", letterSpacing: 1.2, textTransform: "uppercase", textAlign: "center" },
  title: { color: "#173c2b", fontSize: 31, fontWeight: "900", textAlign: "center", marginTop: 2 },
  subtitle: { color: "#5c7164", fontSize: 15, fontWeight: "600", textAlign: "center", marginTop: 5, marginBottom: 20 },
  steps: { gap: 13 },
  step: { flexDirection: "row", gap: 12, alignItems: "flex-start", backgroundColor: "#fff", borderRadius: 17, padding: 12, borderWidth: 1, borderColor: "#dfe9df" },
  iconWrap: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", marginTop: 2 },
  stepCopy: { flex: 1, minWidth: 0 },
  stepTitle: { color: "#173c2b", fontSize: 16, fontWeight: "900" },
  stepText: { color: "#52675b", fontSize: 13, lineHeight: 18, marginTop: 3 },
  startButton: { minHeight: 50, borderRadius: 25, backgroundColor: "#2f7d5b", alignItems: "center", justifyContent: "center", marginTop: 22 },
  startText: { color: "#fff", fontSize: 16, fontWeight: "900" },
});
