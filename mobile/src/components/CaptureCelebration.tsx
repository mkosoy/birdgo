import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, Image, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Bird3DPreview } from "./Bird3DPreview";
import { RARITY_COLORS } from "../utils/progression";
import type { BirdRarity } from "../types";

interface CaptureCelebrationProps {
  commonName: string;
  sciName?: string | null;
  rarity: BirdRarity;
  xp: number;
  firstSpecies: boolean;
  verified: boolean;
  honorSystem: boolean;
  photoUri?: string | null;
  referenceImageUrl?: string;
  onClose: () => void;
}

const CONFETTI_COLORS = ["#ffd766", "#72e7ff", "#65d184", "#f0a6c1", "#d7ccff", "#ffffff"];

export function CaptureCelebration({ commonName, sciName, rarity, xp, firstSpecies, verified, honorSystem, photoUri, referenceImageUrl, onClose }: CaptureCelebrationProps) {
  const { height } = useWindowDimensions();
  const entrance = useRef(new Animated.Value(0)).current;
  const confetti = useRef(new Animated.Value(0)).current;
  const particles = useMemo(() => Array.from({ length: 20 }, (_, index) => ({
    id: index,
    left: 4 + ((index * 17) % 92),
    delay: (index % 7) * 70,
    size: 6 + (index % 3) * 3,
    color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
    drift: ((index % 5) - 2) * 16,
  })), []);

  useEffect(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    Animated.parallel([
      Animated.spring(entrance, { toValue: 1, useNativeDriver: true, tension: 72, friction: 9 }),
      Animated.timing(confetti, { toValue: 1, duration: 1900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [confetti, entrance]);

  const imageUri = photoUri ?? referenceImageUrl;
  const rarityColor = RARITY_COLORS[rarity];
  const identified = commonName !== "Unidentified bird";
  const headline = honorSystem ? "Sighting logged!" : firstSpecies ? "New species!" : identified ? "Captured!" : "Observation saved";
  const provenance = honorSystem
    ? "Honor-system record · no photo"
    : verified
      ? "AI-verified photo"
      : photoUri
        ? "Unverified photo record"
        : "Honor-system record";
  const collectionNote = firstSpecies
    ? "First time in your Bird-dex"
    : identified
      ? "Duplicate species training"
      : "Kept as an unidentified observation";

  return <Modal visible transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {particles.map((particle) => {
          const translateY = confetti.interpolate({ inputRange: [0, 1], outputRange: [-30, height * 0.78 + particle.delay / 3] });
          const translateX = confetti.interpolate({ inputRange: [0, 1], outputRange: [0, particle.drift] });
          const rotate = confetti.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${particle.drift * 8 + 180}deg`] });
          const opacity = confetti.interpolate({ inputRange: [0, 0.12, 0.78, 1], outputRange: [0, 1, 1, 0] });
          return <Animated.View key={particle.id} style={[styles.particle, { left: `${particle.left}%`, width: particle.size, height: particle.size * 1.45, backgroundColor: particle.color, opacity, transform: [{ translateX }, { translateY }, { rotate }] }]} />;
        })}
      </View>
      <Animated.View style={[styles.card, { opacity: entrance, transform: [{ scale: entrance.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }) }, { translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) }] }]}>
        <Text style={styles.eyebrow}>{headline}</Text>
        <View style={[styles.heroFrame, { borderColor: rarityColor }]}>
          {imageUri
            ? <>
              <Image source={{ uri: imageUri }} style={styles.heroImage} resizeMode="cover" />
              <View style={styles.imageBadge}><Text style={styles.imageBadgeText}>{photoUri ? "Your photo" : "Reference"}</Text></View>
            </>
            : <Bird3DPreview commonName={commonName} rarity={rarity} height={168} />}
        </View>
        <Text style={styles.name}>{commonName}</Text>
        {sciName && identified ? <Text style={styles.scientific}>{sciName}</Text> : null}
        <View style={styles.metaRow}>
          <View style={[styles.rarityPill, { backgroundColor: rarityColor }]}><Text style={styles.rarityText}>{rarity.toUpperCase()}</Text></View>
          <View style={styles.xpPill}><Text style={styles.xpText}>{xp > 0 ? `+${xp} XP` : "No XP"}</Text></View>
        </View>
        <Text style={styles.provenance}>{provenance}</Text>
        <Text style={styles.collectionNote}>{collectionNote}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Keep birding" style={styles.keepButton} onPress={onClose}>
          <Text style={styles.keepButtonText}>Keep birding</Text>
        </Pressable>
      </Animated.View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 22, backgroundColor: "rgba(5, 16, 10, 0.72)" },
  particle: { position: "absolute", top: 0, borderRadius: 3 },
  card: { width: "100%", maxWidth: 360, alignItems: "center", padding: 18, borderRadius: 24, backgroundColor: "#fffdf6", borderWidth: 1, borderColor: "#e4ddc8", elevation: 8 },
  eyebrow: { color: "#2f7d5b", fontSize: 13, fontWeight: "900", letterSpacing: 1.1, textTransform: "uppercase" },
  heroFrame: { width: "100%", height: 168, marginTop: 12, borderRadius: 20, overflow: "hidden", borderWidth: 3, backgroundColor: "#dce6df" },
  heroImage: { width: "100%", height: "100%" },
  imageBadge: { position: "absolute", right: 8, top: 8, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4, backgroundColor: "rgba(31,45,39,.8)" },
  imageBadgeText: { color: "#fff", fontSize: 9, fontWeight: "900", textTransform: "uppercase" },
  name: { color: "#173c2b", fontSize: 26, lineHeight: 31, fontWeight: "900", textAlign: "center", marginTop: 13 },
  scientific: { color: "#68796f", fontSize: 13, fontStyle: "italic", marginTop: 2 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 11 },
  rarityPill: { borderRadius: 13, paddingHorizontal: 11, paddingVertical: 6 },
  rarityText: { color: "#fff", fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  xpPill: { borderRadius: 13, paddingHorizontal: 11, paddingVertical: 6, backgroundColor: "#173c2b" },
  xpText: { color: "#dff4e7", fontSize: 11, fontWeight: "900" },
  provenance: { color: "#4c6255", fontSize: 12, fontWeight: "800", marginTop: 10 },
  collectionNote: { color: "#748379", fontSize: 11, marginTop: 3, textAlign: "center" },
  keepButton: { width: "100%", minHeight: 48, marginTop: 15, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "#2f7d5b" },
  keepButtonText: { color: "#fff", fontSize: 14, fontWeight: "900" },
});
