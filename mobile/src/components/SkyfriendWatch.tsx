import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dimensions, Modal, PanResponder, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import type { BirdRarity, EbirdObservation } from "../types";
import { RARITY_COLORS, rarityForSpecies } from "../utils/progression";

type Phase = "intro" | "playing" | "success" | "escaped";

interface SkyfriendWatchProps {
  bird: EbirdObservation;
  onSuccess: () => void;
  onEscape: () => void;
  onClose: () => void;
}

interface Difficulty {
  speed: number;
  focusSeconds: number;
  durationSeconds: number;
  focusRadius: number;
  orbitPadding: number;
  copy: string;
}

const DIFFICULTY: Record<BirdRarity, Difficulty> = {
  common: { speed: 0.68, focusSeconds: 1.8, durationSeconds: 11, focusRadius: 64, orbitPadding: 40, copy: "Calm and slow" },
  uncommon: { speed: 0.78, focusSeconds: 2.2, durationSeconds: 11.5, focusRadius: 60, orbitPadding: 28, copy: "A little fluttery" },
  rare: { speed: 0.92, focusSeconds: 2.8, durationSeconds: 12, focusRadius: 56, orbitPadding: 22, copy: "Quick and wary" },
  epic: { speed: 1.05, focusSeconds: 3.3, durationSeconds: 12.5, focusRadius: 52, orbitPadding: 24, copy: "Very jumpy" },
  legendary: { speed: 1.18, focusSeconds: 3.8, durationSeconds: 13, focusRadius: 48, orbitPadding: 26, copy: "A master escape artist" },
};

const STARS = [
  [9, 18], [24, 10], [39, 19], [58, 9], [76, 17], [88, 28],
  [14, 38], [32, 31], [51, 36], [70, 34], [84, 46], [22, 55], [63, 55],
] as const;

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function noise(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

type SkyfriendKind = "songbird" | "wader" | "owl" | "raptor" | "waterfowl" | "hummingbird" | "woodpecker";

function hasNameToken(lowerName: string, terms: string[]): boolean {
  return new RegExp(`(^|[^a-z])(${terms.join("|")})($|[^a-z])`).test(lowerName);
}

function skyfriendKindFor(commonName: string, sciName?: string | null): SkyfriendKind {
  const lowerName = `${commonName} ${sciName ?? ""}`.toLowerCase();
  if (hasNameToken(lowerName, ["heron", "egret", "crane", "bittern", "sandpiper", "plover", "curlew", "godwit", "dowitcher", "snipe", "stilt", "avocet", "yellowlegs", "killdeer"])) return "wader";
  if (hasNameToken(lowerName, ["owl"])) return "owl";
  if (hasNameToken(lowerName, ["hawk", "eagle", "falcon", "osprey", "kite", "harrier", "vulture", "kestrel"])) return "raptor";
  if (hasNameToken(lowerName, ["duck", "goose", "swan", "mallard", "teal", "merganser", "grebe", "pelican", "cormorant", "gull", "tern", "coot"])) return "waterfowl";
  if (hasNameToken(lowerName, ["hummingbird"])) return "hummingbird";
  if (hasNameToken(lowerName, ["woodpecker", "flicker", "sapsucker"])) return "woodpecker";
  return "songbird";
}

interface HoloShape {
  scale: number;
  body: { left: number; top: number; width: number; height: number; radius: number };
  head: { left: number; top: number; size: number };
  wing: { left: number; top: number; width: number; height: number };
  tail: { left: number; top: number; width: number; height: number };
  beak: { length: number; height: number };
  legs?: boolean;
}

const HOLO_SHAPES: Record<SkyfriendKind, HoloShape> = {
  songbird: { scale: 1, body: { left: 15, top: 15, width: 33, height: 22, radius: 16 }, head: { left: 39, top: 7, size: 18 }, wing: { left: 18, top: 10, width: 28, height: 13 }, tail: { left: 2, top: 20, width: 20, height: 8 }, beak: { length: 10, height: 6 } },
  wader: { scale: 1.03, body: { left: 14, top: 14, width: 30, height: 18, radius: 15 }, head: { left: 38, top: 4, size: 15 }, wing: { left: 17, top: 10, width: 26, height: 11 }, tail: { left: 3, top: 20, width: 17, height: 7 }, beak: { length: 24, height: 4 }, legs: true },
  owl: { scale: 1.02, body: { left: 13, top: 13, width: 36, height: 25, radius: 18 }, head: { left: 35, top: 5, size: 21 }, wing: { left: 18, top: 13, width: 25, height: 12 }, tail: { left: 5, top: 24, width: 16, height: 8 }, beak: { length: 7, height: 5 } },
  raptor: { scale: 1.05, body: { left: 13, top: 15, width: 35, height: 21, radius: 17 }, head: { left: 38, top: 7, size: 17 }, wing: { left: 12, top: 7, width: 38, height: 15 }, tail: { left: 1, top: 21, width: 20, height: 9 }, beak: { length: 11, height: 8 } },
  waterfowl: { scale: 1.04, body: { left: 10, top: 17, width: 39, height: 20, radius: 17 }, head: { left: 42, top: 8, size: 16 }, wing: { left: 17, top: 15, width: 28, height: 11 }, tail: { left: 1, top: 21, width: 16, height: 7 }, beak: { length: 11, height: 7 } },
  hummingbird: { scale: 0.82, body: { left: 17, top: 17, width: 26, height: 16, radius: 13 }, head: { left: 39, top: 10, size: 14 }, wing: { left: 20, top: 8, width: 20, height: 9 }, tail: { left: 5, top: 22, width: 17, height: 6 }, beak: { length: 23, height: 3 } },
  woodpecker: { scale: 0.95, body: { left: 15, top: 14, width: 31, height: 21, radius: 15 }, head: { left: 39, top: 6, size: 17 }, wing: { left: 18, top: 11, width: 24, height: 11 }, tail: { left: 0, top: 22, width: 24, height: 7 }, beak: { length: 15, height: 5 } },
};

function HoloBird({ x, y, facing, wing, large = false, centered = false, prismatic = false, kind = "songbird" }: { x: number; y: number; facing: number; wing: number; large?: boolean; centered?: boolean; prismatic?: boolean; kind?: SkyfriendKind }) {
  const shape = HOLO_SHAPES[kind];
  const visualScale = (large ? 1.35 : 1) * shape.scale;
  const beakLeft = shape.head.left + shape.head.size - 1;
  const beakTop = shape.head.top + shape.head.size * 0.42;
  return (
    <View pointerEvents="none" style={[styles.birdAnchor, { transform: [{ translateX: x }, { translateY: y }, { scaleX: facing * visualScale }, { scaleY: visualScale }] }]}>
      <View style={[styles.birdGlow, centered && styles.birdGlowCentered, prismatic && styles.birdGlowPrismatic]} />
      {prismatic ? <><View style={[styles.prismaticSparkle, styles.sparkleOne]} /><View style={[styles.prismaticSparkle, styles.sparkleTwo]} /><View style={[styles.prismaticSparkle, styles.sparkleThree]} /></> : null}
      <View style={[styles.birdTail, prismatic && styles.birdTailPrismatic, { left: shape.tail.left, top: shape.tail.top, width: shape.tail.width, height: shape.tail.height }]} />
      <View style={[styles.birdBody, prismatic && styles.birdBodyPrismatic, { left: shape.body.left, top: shape.body.top, width: shape.body.width, height: shape.body.height, borderRadius: shape.body.radius }]} />
      <View style={[styles.birdWing, prismatic && styles.birdWingPrismatic, { left: shape.wing.left, top: shape.wing.top, width: shape.wing.width, height: shape.wing.height, transform: [{ rotate: `${wing}deg` }] }]} />
      <View style={[styles.birdHead, prismatic && styles.birdHeadPrismatic, { left: shape.head.left, top: shape.head.top, width: shape.head.size, height: shape.head.size, borderRadius: shape.head.size / 2 }]} />
      <View style={[styles.birdBeak, prismatic && styles.birdBeakPrismatic, { left: beakLeft, top: beakTop, borderLeftWidth: shape.beak.length, borderTopWidth: shape.beak.height / 2, borderBottomWidth: shape.beak.height / 2 }]} />
      {kind === "owl" ? <>
        <View style={[styles.owlTuft, prismatic && styles.owlTuftPrismatic, { left: shape.head.left + 1, top: shape.head.top - 5, transform: [{ rotate: "-18deg" }] }]} />
        <View style={[styles.owlTuft, prismatic && styles.owlTuftPrismatic, { left: shape.head.left + shape.head.size - 8, top: shape.head.top - 5, transform: [{ rotate: "18deg" }] }]} />
      </> : null}
      <View style={[styles.birdEye, { left: shape.head.left + shape.head.size * 0.62, top: shape.head.top + shape.head.size * 0.28 }]} />
      {shape.legs ? <><View style={[styles.birdLeg, { left: 25 }]} /><View style={[styles.birdLeg, { left: 34 }]} /></> : null}
    </View>
  );
}

export function SkyfriendWatch({ bird, onSuccess, onEscape, onClose }: SkyfriendWatchProps) {
  const speciesName = bird.comName ?? "Skyfriend";
  const skyfriendKind = skyfriendKindFor(speciesName, bird.sciName);
  const rarity = rarityForSpecies(bird.speciesCode, speciesName, Boolean(bird.isNotable), bird.sciName, bird.canonicalKey, bird.frequency, bird.abundanceCount);
  const difficulty = DIFFICULTY[rarity];
  const prismatic = Boolean(bird.prismatic);
  const rarityColor = RARITY_COLORS[rarity];
  const birdKey = `${bird.speciesCode}:${bird.locId ?? `${bird.latitude}:${bird.longitude}`}`;
  const seed = useMemo(() => hash(birdKey) % 1000, [birdKey]);
  const width = Dimensions.get("window").width;
  const scopeSize = Math.min(310, Math.max(250, width - 52));
  const scopeRadius = scopeSize / 2;
  const [phase, setPhase] = useState<Phase>("intro");
  const [frame, setFrame] = useState({ x: 0, y: 0, focus: 0, timeLeft: difficulty.durationSeconds, centered: false, facing: 1, wing: -14, intensified: false });
  const panRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });
  const finishedRef = useRef(false);
  const interactionBoostRef = useRef(0);
  const focusHapticAtRef = useRef(0);
  const wasCenteredRef = useRef(false);
  const callbacksRef = useRef({ onSuccess, onEscape });
  callbacksRef.current = { onSuccess, onEscape };

  useEffect(() => {
    setPhase("intro");
    setFrame({ x: 0, y: 0, focus: 0, timeLeft: difficulty.durationSeconds, centered: false, facing: 1, wing: -14, intensified: false });
    panRef.current = { x: 0, y: 0 };
    panStartRef.current = { x: 0, y: 0 };
    finishedRef.current = false;
  }, [birdKey, difficulty.durationSeconds]);

  const finish = useCallback((nextPhase: "success" | "escaped") => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setPhase(nextPhase);
    const haptic = nextPhase === "success" ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    void haptic.catch(() => undefined);
    if (nextPhase === "success") callbacksRef.current.onSuccess();
    else callbacksRef.current.onEscape();
  }, []);

  useEffect(() => {
    if (phase !== "playing") {
      wasCenteredRef.current = false;
      return;
    }
    if (frame.centered && !wasCenteredRef.current) {
      const now = Date.now();
      if (now - focusHapticAtRef.current > 850) {
        focusHapticAtRef.current = now;
        void Haptics.selectionAsync().catch(() => undefined);
      }
    }
    wasCenteredRef.current = frame.centered;
  }, [frame.centered, phase]);

  useEffect(() => {
    if (phase !== "playing") return undefined;
    let active = true;
    let animationFrame = 0;
    let focus = 0;
    let intensified = false;
    let lastX = 0;
    let startedAt: number | null = null;
    let lastAt: number | null = null;
    let lastRender = 0;

    const tick = (now: number) => {
      if (!active || finishedRef.current) return;
      if (startedAt == null) {
        startedAt = now;
        lastAt = now;
      }
      const elapsed = (now - startedAt) / 1000;
      const delta = Math.min(0.08, Math.max(0, (now - (lastAt ?? now)) / 1000));
      lastAt = now;
      if (focus >= 0.6) intensified = true;
      const speed = difficulty.speed * (intensified ? 1.1 : 1);
      const dartBoost = intensified ? 1.1 : 1;
      const dartClock = elapsed * (1.18 + speed * 0.28);
      const dartStep = Math.floor(dartClock);
      const dartProgress = dartClock - dartStep;
      const dartShape = Math.sin(dartProgress * Math.PI);
      const dartX = (noise(seed + dartStep * 17) - 0.5) * 72 * dartShape * dartBoost;
      const dartY = (noise(seed + 91 + dartStep * 23) - 0.5) * 50 * dartShape * dartBoost;
      const orbitRadius = difficulty.focusRadius + difficulty.orbitPadding;
      const orbitAngle = elapsed * 1.08 * speed + seed * 0.037;
      const baseX = Math.cos(orbitAngle) * orbitRadius + Math.sin(elapsed * 3.25 * speed + seed * 0.11) * 11 + dartX * 0.62;
      const baseY = Math.sin(orbitAngle * 0.91 + seed * 0.021) * orbitRadius * 0.76 + Math.cos(elapsed * 2.55 * speed + seed * 0.05) * 9 + dartY * 0.62;
      const unclampedX = baseX + panRef.current.x;
      const unclampedY = baseY + panRef.current.y;
      const maxCenterDistance = scopeRadius - 34;
      const unclampedDistance = Math.hypot(unclampedX, unclampedY);
      const visibleScale = unclampedDistance > maxCenterDistance ? maxCenterDistance / unclampedDistance : 1;
      const x = unclampedX * visibleScale;
      const y = unclampedY * visibleScale;
      const distance = Math.hypot(x, y);
      const centered = distance <= difficulty.focusRadius;
      interactionBoostRef.current = Math.max(0, interactionBoostRef.current - delta * 1000);
      const activelySteering = interactionBoostRef.current > 0;
      focus = clamp(focus + (centered ? delta / difficulty.focusSeconds : -delta / (difficulty.focusSeconds * (activelySteering ? 2.5 : 1.55))), 0, 1);
      const timeLeft = Math.max(0, difficulty.durationSeconds - elapsed);
      const velocityX = x - lastX;
      lastX = x;
      const facing = Math.abs(velocityX) > 0.04 ? (velocityX >= 0 ? 1 : -1) : undefined;

      if (now - lastRender > 28) {
        lastRender = now;
        setFrame((current) => ({
          x,
          y,
          focus,
          timeLeft,
          centered,
          facing: facing ?? current.facing,
          intensified,
          wing: -18 + Math.sin(elapsed * 18) * 18,
        }));
      }

      if (focus >= 1) {
        setFrame((current) => ({ ...current, x, y, focus: 1, timeLeft, centered: true }));
        finish("success");
        return;
      }
      if (timeLeft <= 0) {
        setFrame((current) => ({ ...current, x, y, focus, timeLeft: 0, centered: false }));
        finish("escaped");
        return;
      }
      animationFrame = requestAnimationFrame(tick);
    };

    animationFrame = requestAnimationFrame(tick);
    return () => {
      active = false;
      cancelAnimationFrame(animationFrame);
    };
  }, [difficulty, finish, phase, scopeRadius, seed]);

  useEffect(() => {
    if (phase !== "playing" || Platform.OS !== "web") return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      const step = event.shiftKey ? 16 : 8;
      const key = event.key.toLowerCase();
      const dx = key === "arrowleft" || key === "a" ? -step : key === "arrowright" || key === "d" ? step : 0;
      const dy = key === "arrowup" || key === "w" ? -step : key === "arrowdown" || key === "s" ? step : 0;
      if (!dx && !dy) return;
      event.preventDefault();
      interactionBoostRef.current = 700;
      panRef.current = {
        x: clamp(panRef.current.x + dx, -112, 112),
        y: clamp(panRef.current.y + dy, -112, 112),
      };
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [phase]);

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      interactionBoostRef.current = 700;
      panStartRef.current = { ...panRef.current };
    },
    onPanResponderMove: (_event, gesture) => {
      interactionBoostRef.current = 700;
      panRef.current = {
        x: clamp(panStartRef.current.x + gesture.dx * 0.9, -112, 112),
        y: clamp(panStartRef.current.y + gesture.dy * 0.9, -112, 112),
      };
    },
    onPanResponderRelease: () => {
      interactionBoostRef.current = 0;
    },
    onPanResponderTerminate: () => {
      interactionBoostRef.current = 0;
    },
  })).current;

  const startWatch = () => {
    panRef.current = { x: 0, y: 0 };
    panStartRef.current = { x: 0, y: 0 };
    finishedRef.current = false;
    setFrame({ x: 0, y: 0, focus: 0, timeLeft: difficulty.durationSeconds, centered: false, facing: 1, wing: -14, intensified: false });
    setPhase("playing");
  };

  const closeIntroOrResult = () => {
    if (phase === "playing") finish("escaped");
    else onClose();
  };

  return (
    <Modal visible animationType="fade" onRequestClose={closeIntroOrResult}>
    <View style={styles.overlay}>
      <View style={styles.topBar}>
        <View style={styles.titleBlock}>
          <Text style={styles.kicker}>Skyfriend Watch</Text>
          <Text style={styles.title} numberOfLines={1}>{speciesName}</Text>
        </View>
        <Pressable accessibilityLabel={phase === "playing" ? "Stop watching and let it escape" : "Close Skyfriend watch"} style={styles.closeButton} onPress={closeIntroOrResult}>
          <Ionicons name="close" size={25} color="#e8fbff" />
        </Pressable>
      </View>

      {phase === "intro" && (
        <View style={styles.introCard}>
          <View style={styles.introScope}>
            <HoloBird x={0} y={0} facing={1} wing={-8} large centered prismatic={prismatic} kind={skyfriendKind} />
          </View>
          <View style={[styles.rarityPill, { backgroundColor: rarityColor }, prismatic && styles.rarityPillPrismatic]}><Text style={styles.rarityText}>{prismatic ? "PRISMATIC SKYFRIEND" : `${rarity.toUpperCase()} SKYFRIEND`}</Text></View>
          <Text style={styles.introHeading}>Spot it through the binoculars.</Text>
          <Text style={styles.introCopy}>Drag anywhere inside the scope{Platform.OS === "web" ? " or use the arrow keys" : ""} to keep the holographic bird inside the focus ring. Fill the focus meter before time runs out, or it slips away for a while.</Text>
          {prismatic ? <Text style={styles.prismaticCopy}>A rare shimmering variant — keep your focus steady.</Text> : null}
          <Text style={styles.difficultyCopy}>{difficulty.copy} · {difficulty.focusSeconds.toFixed(1)} seconds of clean focus needed</Text>
          <Pressable accessibilityLabel="Start Skyfriend watch" style={styles.primaryButton} onPress={startWatch}><Text style={styles.primaryButtonText}>Start watching</Text></Pressable>
          <Pressable accessibilityLabel="Not now" style={styles.secondaryButton} onPress={onClose}><Text style={styles.secondaryButtonText}>Not now</Text></Pressable>
        </View>
      )}

      {phase === "playing" && (
        <>
          <View style={styles.statusRow}>
            <View style={[styles.statusPill, frame.centered && styles.statusPillFocused]}><Text style={styles.statusText}>{frame.centered ? "FOCUSING" : "TRACK IT"}</Text></View>
            <Text style={styles.timerText}>{Math.ceil(frame.timeLeft)}s</Text>
          </View>
          <View style={styles.playArea}>
          <View style={[styles.scopeOuter, { width: scopeSize, height: scopeSize, borderRadius: scopeRadius }]} {...panResponder.panHandlers}>
            <View style={[styles.scopeSky, { borderRadius: scopeRadius }]}>
              {STARS.map(([left, top]) => <View key={`${left}-${top}`} style={[styles.star, { left: `${left}%`, top: `${top}%` }]} />)}
              <View style={styles.scopeHorizon} />
              <HoloBird x={frame.x} y={frame.y} facing={frame.facing} wing={frame.wing} centered={frame.centered} prismatic={prismatic} kind={skyfriendKind} />
              <View style={[styles.focusRing, { width: difficulty.focusRadius * 2, height: difficulty.focusRadius * 2, borderRadius: difficulty.focusRadius, marginLeft: -difficulty.focusRadius, marginTop: -difficulty.focusRadius }, frame.centered && styles.focusRingActive]} />
              <View style={styles.crosshairHorizontal} />
              <View style={styles.crosshairVertical} />
            </View>
          </View>
          <View style={styles.meterWrap}>
            <View style={styles.meterTrack}><View style={[styles.meterFill, { width: `${Math.round(frame.focus * 100)}%` }]} /></View>
            <Text style={styles.meterLabel}>Focus {Math.round(frame.focus * 100)}%</Text>
          </View>
          <Text style={styles.playInstructions}>{frame.intensified ? "It’s startled — stay smooth and don’t overcorrect." : Platform.OS === "web" ? "Drag inside the scope or steer with arrow keys. Small steady movements work best." : "Drag inside the scope. Small steady movements work better than chasing wildly."}</Text>
          </View>
        </>
      )}

      {(phase === "success" || phase === "escaped") && (
        <View style={styles.resultCard}>
          <View style={[styles.resultBadge, phase === "success" ? styles.resultSuccess : styles.resultEscaped]}>
            {phase === "success"
              ? <HoloBird x={0} y={0} facing={1} wing={-10} large centered prismatic={prismatic} kind={skyfriendKind} />
              : <Ionicons name="airplane" size={34} color="#fff" />}
          </View>
          <Text style={styles.resultTitle}>{phase === "success" ? prismatic ? "Prismatic Skyfriend collected!" : "Skyfriend collected!" : "It slipped away"}</Text>
          <Text style={styles.resultCopy}>{phase === "success"
            ? `${speciesName} joined your virtual field guide${prismatic ? " as a rare prismatic variant" : ""}.`
            : `${speciesName} spooked and left this spot. It may return after a short cooldown.`}</Text>
          <Pressable accessibilityLabel="Back to map" style={styles.primaryButton} onPress={onClose}><Text style={styles.primaryButtonText}>Back to map</Text></Pressable>
        </View>
      )}
    </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 30, backgroundColor: "#051127", paddingHorizontal: 18, paddingTop: 18, paddingBottom: 22 },
  topBar: { flexDirection: "row", alignItems: "center", gap: 12 },
  titleBlock: { flex: 1, minWidth: 0 },
  kicker: { color: "#73e5ff", fontSize: 12, fontWeight: "900", letterSpacing: 1.1, textTransform: "uppercase" },
  title: { color: "#fff", fontSize: 26, fontWeight: "900", marginTop: 2 },
  closeButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,.12)" },
  introCard: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 24 },
  introScope: { width: 168, height: 168, borderRadius: 84, backgroundColor: "#132b58", borderWidth: 5, borderColor: "#76e6ff", alignItems: "center", justifyContent: "center", overflow: "hidden", marginBottom: 18 },
  rarityPill: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5, marginBottom: 12 },
  rarityText: { color: "#fff", fontWeight: "900", fontSize: 11, letterSpacing: 0.8 },
  rarityPillPrismatic: { backgroundColor: "#c99b22", borderWidth: 1, borderColor: "#fff3bd" },
  prismaticCopy: { color: "#ffe28a", fontSize: 13, fontWeight: "900", textAlign: "center", marginTop: 10 },
  introHeading: { color: "#fff", fontSize: 22, fontWeight: "900", textAlign: "center", marginBottom: 8 },
  introCopy: { color: "#c7d8ea", fontSize: 14, lineHeight: 21, textAlign: "center", maxWidth: 330 },
  difficultyCopy: { color: "#73e5ff", fontSize: 12, fontWeight: "800", textAlign: "center", marginTop: 10, marginBottom: 18 },
  primaryButton: { minHeight: 48, minWidth: 190, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: "#2fbfbf", paddingHorizontal: 24, marginTop: 8 },
  primaryButtonText: { color: "#062735", fontSize: 15, fontWeight: "900" },
  secondaryButton: { minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 20, marginTop: 6 },
  secondaryButtonText: { color: "#c7d8ea", fontSize: 14, fontWeight: "800" },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8, marginBottom: 12 },
  statusPill: { borderRadius: 15, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "rgba(255,255,255,.14)", borderWidth: 1, borderColor: "rgba(255,255,255,.18)" },
  statusPillFocused: { backgroundColor: "rgba(74,231,255,.28)", borderColor: "#73e5ff" },
  statusText: { color: "#fff", fontSize: 12, fontWeight: "900", letterSpacing: 0.8 },
  timerText: { color: "#fff", fontSize: 24, fontWeight: "900" },
  scopeOuter: { alignSelf: "center", backgroundColor: "#101a3d", borderWidth: 7, borderColor: "#24345f", overflow: "hidden", shadowColor: "#59dbff", shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 0 }, elevation: 8 },
  scopeSky: { flex: 1, overflow: "hidden", backgroundColor: "#102653" },
  star: { position: "absolute", width: 3, height: 3, borderRadius: 2, backgroundColor: "rgba(196,245,255,.75)" },
  scopeHorizon: { position: "absolute", left: -20, right: -20, bottom: -18, height: 84, borderRadius: 60, backgroundColor: "rgba(69,148,119,.36)" },
  birdAnchor: { position: "absolute", left: "50%", top: "50%", width: 62, height: 44, marginLeft: -31, marginTop: -22 },
  birdGlow: { position: "absolute", left: -13, top: -14, width: 86, height: 72, borderRadius: 42, backgroundColor: "rgba(80,226,255,.13)" },
  birdGlowCentered: { backgroundColor: "rgba(130,255,226,.24)" },
  birdGlowPrismatic: { backgroundColor: "rgba(255,215,102,.28)" },
  prismaticSparkle: { position: "absolute", width: 5, height: 5, borderRadius: 3, backgroundColor: "#fff3bd", shadowColor: "#ffd766", shadowOpacity: 0.9, shadowRadius: 5 },
  sparkleOne: { left: 8, top: 4 },
  sparkleTwo: { right: 2, top: 20 },
  sparkleThree: { left: 20, bottom: 0 },
  birdBody: { position: "absolute", left: 15, top: 15, width: 33, height: 22, borderRadius: 16, backgroundColor: "#65e9ff", borderWidth: 2, borderColor: "#d9fbff" },
  birdBodyPrismatic: { backgroundColor: "#ffd766", borderColor: "#fff8cf" },
  birdHeadPrismatic: { backgroundColor: "#ffd766", borderColor: "#fff8cf" },
  birdWingPrismatic: { backgroundColor: "#8f78ff", borderColor: "#fff3bd" },
  birdTailPrismatic: { backgroundColor: "#28e0c8", borderWidth: 1, borderColor: "#fff3bd" },
  birdWing: { position: "absolute", left: 18, top: 10, width: 28, height: 13, borderRadius: 9, backgroundColor: "#7569f2", borderWidth: 1, borderColor: "#bff8ff" },
  birdHead: { position: "absolute", left: 39, top: 7, width: 18, height: 18, borderRadius: 9, backgroundColor: "#65e9ff", borderWidth: 2, borderColor: "#d9fbff" },
  birdBeak: { position: "absolute", width: 0, height: 0, borderLeftColor: "#ffd766", borderTopColor: "transparent", borderBottomColor: "transparent" },
  birdBeakPrismatic: { borderLeftColor: "#fff8cf" },
  owlTuft: { position: "absolute", width: 0, height: 0, borderLeftWidth: 4, borderRightWidth: 4, borderBottomWidth: 9, borderLeftColor: "transparent", borderRightColor: "transparent", borderBottomColor: "#65e9ff" },
  owlTuftPrismatic: { borderBottomColor: "#ffd766" },
  birdLeg: { position: "absolute", top: 34, width: 2, height: 19, borderRadius: 1, backgroundColor: "#d9fbff", opacity: 0.86 },
  birdEye: { position: "absolute", width: 4, height: 4, borderRadius: 2, backgroundColor: "#18244e" },
  birdTail: { position: "absolute", left: 2, top: 20, width: 20, height: 8, borderRadius: 5, backgroundColor: "#7569f2", transform: [{ rotate: "-16deg" }] },
  focusRing: { position: "absolute", left: "50%", top: "50%", borderWidth: 3, borderColor: "rgba(255,255,255,.56)" },
  focusRingActive: { borderColor: "#72ffd8", shadowColor: "#72ffd8", shadowOpacity: 0.75, shadowRadius: 10 },
  crosshairHorizontal: { position: "absolute", left: "18%", right: "18%", top: "50%", height: 1, backgroundColor: "rgba(255,255,255,.26)" },
  crosshairVertical: { position: "absolute", top: "18%", bottom: "18%", left: "50%", width: 1, backgroundColor: "rgba(255,255,255,.26)" },
  playArea: { flex: 1, justifyContent: "center" },
  meterWrap: { marginTop: 16, alignItems: "center" },
  meterTrack: { width: "82%", height: 12, borderRadius: 8, overflow: "hidden", backgroundColor: "rgba(255,255,255,.17)", borderWidth: 1, borderColor: "rgba(255,255,255,.14)" },
  meterFill: { height: "100%", borderRadius: 8, backgroundColor: "#72ffd8" },
  meterLabel: { color: "#dff8ff", fontWeight: "900", fontSize: 12, marginTop: 6 },
  playInstructions: { color: "#b9cddd", textAlign: "center", fontSize: 13, lineHeight: 19, marginTop: 12, paddingHorizontal: 12 },
  resultCard: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 32 },
  resultBadge: { width: 82, height: 82, borderRadius: 41, alignItems: "center", justifyContent: "center", marginBottom: 18 },
  resultSuccess: { backgroundColor: "#2fbf9b" },
  resultEscaped: { backgroundColor: "#7569f2" },
  resultTitle: { color: "#fff", fontSize: 25, fontWeight: "900", marginBottom: 8 },
  resultCopy: { color: "#c7d8ea", fontSize: 14, lineHeight: 21, textAlign: "center", maxWidth: 310, marginBottom: 14 },
});
