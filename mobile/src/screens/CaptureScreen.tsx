import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions, type CameraType } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import * as FileSystem from "expo-file-system";
import { useFocusEffect } from "@react-navigation/native";
import { canonicalizeSpecies, identifyBird } from "../api";
import { SF_COORDS } from "../config";
import { useCollection } from "../hooks/useCollection";
import type { Coordinates } from "../types";
import type { SeenSpecies } from "../types";
import { Bird3DPreview } from "../components/Bird3DPreview";
import { rarityForSpecies, xpForCapture } from "../utils/progression";

type Props = { hint?: SeenSpecies; onHintConsumed?: () => void; onCaptureSaved?: (capture: { speciesCode?: string; commonName: string; sciName?: string | null; encounterId?: string }) => void };

function normalizeName(value?: string | null): string {
  return value?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
}

function couldBeSpecies(species: SeenSpecies, result: { isBird: boolean; commonName: string | null; sciName: string | null; canonicalKey?: string }): boolean {
  if (!result.isBird) return false;
  if (!result.commonName && !result.sciName) return false;
  return sameSpecies(species, result.commonName, result.sciName, result.canonicalKey);
}

function sameSpecies(species: SeenSpecies, commonName?: string | null, sciName?: string | null, canonicalKey?: string | null): boolean {
  const common = normalizeName(commonName);
  const scientific = normalizeName(sciName);
  const canonical = normalizeName(canonicalKey);
  const speciesCanonical = normalizeName(species.canonicalKey);
  if (canonical && speciesCanonical) return canonical === speciesCanonical;
  return Boolean(
    (common && normalizeName(species.comName) === common)
    || (scientific && normalizeName(species.sciName) === scientific)
  );
}

export function CaptureScreen({ hint, onHintConsumed, onCaptureSaved }: Props) {
  const insets = useSafeAreaInsets();
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraType] = useState<CameraType>("back");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [result, setResult] = useState<Awaited<ReturnType<typeof identifyBird>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedPhotoUri, setSavedPhotoUri] = useState<string | null>(null);
  const { saveCapture, seenSpecies, refresh: refreshCollection } = useCollection();
  const [encounterHint, setEncounterHint] = useState<SeenSpecies | undefined>(hint);
  const [visualMode, setVisualMode] = useState<"reference" | "model">("reference");
  const [confirmingHonor, setConfirmingHonor] = useState(false);
  const previousHint = useRef<SeenSpecies | undefined>(hint);

  useFocusEffect(useCallback(() => {
    void refreshCollection();
  }, [refreshCollection]));

  useEffect(() => {
    const hintChanged = hint !== previousHint.current;
    previousHint.current = hint;
    if (hint) {
      setEncounterHint(hint);
      if (hintChanged) {
        setPhotoUri(null);
        setResult(null);
        setConfirmation(null);
        setNotice(null);
        setConfirmingHonor(false);
      }
    } else if (!photoUri) {
      setEncounterHint(undefined);
    }
  }, [hint, photoUri]);

  const processPhoto = async (uri: string, base64?: string | null) => {
    setEncounterHint(hint);
    setPhotoUri(uri);
    setResult(null);
    setConfirmation(null);
    setNotice(null);
    setSavedPhotoUri(null);
    setVisualMode("reference");
    setBusy(true);
    try {
      const encoded = base64 ?? await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      setResult(await identifyBird(encoded, hint?.comName ? [hint.comName] : []));
    } catch {
      setNotice("Identification unavailable. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const takePhoto = async () => {
    const photo = await camera.current?.takePictureAsync({ base64: true, quality: 0.7 });
    if (photo?.uri) await processPhoto(photo.uri, photo.base64);
  };

  const pickPhoto = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      setNotice("Photo permission needed. Allow library access or use the camera.");
      return;
    }
    const selected = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, base64: true, quality: 0.7 });
    if (!selected.canceled && selected.assets[0]) await processPhoto(selected.assets[0].uri, selected.assets[0].base64);
  };

  const speciesContext = () => {
    const encounterMatches = Boolean(encounterHint && result && couldBeSpecies(encounterHint, result));
    const resultMatches = result && (result.commonName || result.sciName)
      ? seenSpecies.find((species) => sameSpecies(species, result.commonName, result.sciName, result.canonicalKey))
      : undefined;
    return encounterMatches ? encounterHint ?? resultMatches : resultMatches;
  };

  const quickLogEncounter = async () => {
    if (!encounterHint || saving) return;
    setSaving(true);
    setConfirmation(null);
    setNotice(null);
    try {
      let location: Coordinates = SF_COORDS;
      try {
        const current = await Location.getCurrentPositionAsync({});
        location = { latitude: current.coords.latitude, longitude: current.coords.longitude };
      } catch { /* SF fallback is intentional */ }
      let contextSpecies = encounterHint;
      if (!contextSpecies.canonicalKey) {
        try {
          const [canonical] = await canonicalizeSpecies([{
            speciesCode: contextSpecies.speciesCode,
            comName: contextSpecies.comName,
            sciName: contextSpecies.sciName,
          }]);
          if (canonical?.canonicalKey) {
            contextSpecies = {
              ...contextSpecies,
              sciName: canonical.canonicalSciName ?? contextSpecies.sciName,
              canonicalKey: canonical.canonicalKey,
            };
          }
        } catch { /* Saving still works with legacy identity fallback. */ }
      }
      const rarity = rarityForSpecies(contextSpecies.speciesCode, contextSpecies.comName, contextSpecies.isNotable, contextSpecies.sciName, contextSpecies.canonicalKey, contextSpecies.frequency, contextSpecies.abundanceCount);
      const record = await saveCapture({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        speciesCode: contextSpecies.speciesCode,
        commonName: contextSpecies.comName,
        sciName: contextSpecies.sciName,
        canonicalKey: contextSpecies.canonicalKey,
        timestamp: new Date().toISOString(),
        location,
        rarity,
        verified: false,
      });
      onCaptureSaved?.({ speciesCode: contextSpecies.speciesCode, commonName: contextSpecies.comName, sciName: contextSpecies.sciName, encounterId: contextSpecies.encounterId });
      setConfirmation(`${contextSpecies.comName} honor-logged in your Bird-dex. +${record.xpAwarded ?? 0} XP.`);
      onHintConsumed?.();
    } catch {
      setNotice("Could not save this honor log. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const addToCollection = async () => {
    if (!result || !photoUri || saving || savedPhotoUri === photoUri) return;
    setSaving(true);
    try {
      let location: Coordinates = SF_COORDS;
      try {
        const current = await Location.getCurrentPositionAsync({});
        location = { latitude: current.coords.latitude, longitude: current.coords.longitude };
      } catch { /* SF fallback is intentional */ }
      let contextSpecies = speciesContext();
      if (contextSpecies && !contextSpecies.canonicalKey) {
        try {
          const [canonical] = await canonicalizeSpecies([{
            speciesCode: contextSpecies.speciesCode,
            comName: contextSpecies.comName,
            sciName: contextSpecies.sciName,
          }]);
          if (canonical?.canonicalKey) {
            contextSpecies = {
              ...contextSpecies,
              sciName: canonical.canonicalSciName ?? contextSpecies.sciName,
              canonicalKey: canonical.canonicalKey,
            };
          }
        } catch { /* Saving still works with legacy identity fallback. */ }
      }
      const commonName = contextSpecies?.comName ?? result.commonName ?? "Unidentified bird";
      const canonicalKey = contextSpecies?.canonicalKey ?? result.canonicalKey;
      const sciName = contextSpecies?.canonicalKey
        ? contextSpecies.sciName
        : result.canonicalSciName ?? contextSpecies?.sciName ?? result.sciName;
      const rarity = rarityForSpecies(contextSpecies?.speciesCode, commonName, contextSpecies?.isNotable, sciName, canonicalKey, contextSpecies?.frequency, contextSpecies?.abundanceCount);
      const verified = Boolean(result.isBird && result.provider !== "heuristic" && (result.commonName || result.sciName));
      const record = await saveCapture({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        speciesCode: contextSpecies?.speciesCode,
        commonName,
        sciName,
        canonicalKey,
        photoUri,
        timestamp: new Date().toISOString(),
        location,
        rarity,
        verified,
      });
      const earnedXp = record.xpAwarded ?? 0;
      const firstSpecies = earnedXp > xpForCapture({ rarity, verified, speciesCode: contextSpecies?.speciesCode, commonName, sciName: contextSpecies?.sciName ?? result.sciName }, false);
      const progressionNote = firstSpecies ? " First species bonus!" : earnedXp > 0 ? " Duplicate species — diminishing XP." : "";
      onCaptureSaved?.({ speciesCode: contextSpecies?.speciesCode, commonName, sciName: contextSpecies?.sciName ?? result.sciName, encounterId: contextSpecies?.encounterId });
      setConfirmation(`${commonName} joined your Bird-dex. +${earnedXp} XP.${progressionNote}`);
      setSavedPhotoUri(photoUri);
      if (encounterHint) onHintConsumed?.();
    } catch {
      setNotice("Could not save this capture. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const contextSpecies = speciesContext();
  const resultName = contextSpecies?.comName ?? result?.commonName ?? "Unidentified bird";
  const resultCanonicalKey = contextSpecies?.canonicalKey ?? result?.canonicalKey;
  const resultSciName = contextSpecies?.canonicalKey
    ? contextSpecies.sciName
    : result?.canonicalSciName ?? contextSpecies?.sciName ?? result?.sciName;
  const resultRarity = rarityForSpecies(contextSpecies?.speciesCode, resultName, contextSpecies?.isNotable, resultSciName, resultCanonicalKey, contextSpecies?.frequency, contextSpecies?.abundanceCount);
  const referenceImageUrl = result?.imageUrl ?? contextSpecies?.imageUrl;
  const referenceImageAttribution = result?.imageUrl ? result.imageAttribution : undefined;
  const showReferenceImage = Boolean(referenceImageUrl && visualMode === "reference");
  const encounterMismatch = Boolean(encounterHint && result && (result.commonName || result.sciName) && !couldBeSpecies(encounterHint, result));
  const targetHintApplied = Boolean(encounterHint && contextSpecies === encounterHint);
  const targetHintUnverified = Boolean(targetHintApplied && (!result?.isBird || result.provider === "heuristic"));

  return <View style={styles.container}>
    {!photoUri
      ? permission?.granted
        ? <CameraView ref={camera} style={styles.camera} facing={cameraType} />
        : <View style={styles.noCamera}>
          <Text style={styles.title}>Camera access needed</Text>
          <Text style={styles.copy}>Allow camera access to photograph birds, or choose a photo from your library.</Text>
          <Pressable style={styles.button} onPress={() => void requestPermission()}><Text style={styles.buttonText}>Enable camera</Text></Pressable>
          <Pressable style={styles.secondary} onPress={() => void pickPhoto()}><Text style={styles.secondaryText}>Pick from library</Text></Pressable>
        </View>
      : <Image source={{ uri: photoUri }} style={styles.camera} />}
    <View style={[styles.controls, { paddingBottom: insets.bottom + 20 }]}>
      {!photoUri && encounterHint && <View style={styles.targetBanner}>
        {encounterHint.imageUrl ? <Image source={{ uri: encounterHint.imageUrl }} style={styles.targetImage} /> : null}
        <View style={styles.targetCopy}>
          <Text style={styles.targetLabel}>Target encounter</Text>
          <Text style={styles.targetName}>{encounterHint.comName}</Text>
        </View>
        <Pressable accessibilityLabel={`Honor log ${encounterHint.comName}`} disabled={saving} style={[styles.honorButton, saving && styles.disabledButton]} onPress={() => setConfirmingHonor(true)}>
          <Text style={styles.honorButtonText}>{saving ? "Logging…" : "I saw it"}</Text>
        </Pressable>
      </View>}
      {!photoUri && encounterHint && confirmingHonor && <View style={styles.honorConfirm}>
        <Text style={styles.honorConfirmText}>Log {encounterHint.comName} without a photo?</Text>
        <View style={styles.honorConfirmActions}>
          <Pressable accessibilityRole="button" style={styles.honorCancel} onPress={() => setConfirmingHonor(false)}><Text style={styles.honorCancelText}>Cancel</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={saving} style={[styles.honorConfirmButton, saving && styles.disabledButton]} onPress={() => { setConfirmingHonor(false); void quickLogEncounter(); }}><Text style={styles.honorConfirmButtonText}>{saving ? "Logging…" : "Log sighting"}</Text></Pressable>
        </View>
      </View>}
      {!photoUri && permission?.granted && <Pressable style={styles.shutter} onPress={() => void takePhoto()}><Text style={styles.shutterText}>●</Text></Pressable>}
      {photoUri && <View style={styles.buttonRow}><Pressable style={[styles.button, styles.flexButton]} onPress={() => { setPhotoUri(null); setResult(null); setConfirmation(null); setSavedPhotoUri(null); }}><Text style={styles.buttonText}>Try another</Text></Pressable><Pressable style={[styles.secondaryDark, styles.flexButton]} onPress={() => void pickPhoto()}><Text style={styles.lightText}>Library</Text></Pressable></View>}
      {busy && <ActivityIndicator color="#fff" />}
      {result && !busy && <View style={styles.result}>
        {(result.isBird || contextSpecies) ? (
          showReferenceImage && referenceImageUrl
            ? <View style={styles.referenceWrap}>
              <Image source={{ uri: referenceImageUrl }} style={styles.referenceImage} resizeMode="cover" />
              <Text numberOfLines={2} style={styles.referenceCaption}>{referenceImageAttribution ? `Reference photo · ${referenceImageAttribution}` : "Real species reference photo"}</Text>
            </View>
            : <Bird3DPreview commonName={resultName} rarity={resultRarity} height={118} />
        ) : null}
        {referenceImageUrl && (result.isBird || contextSpecies) ? <Pressable accessibilityLabel={visualMode === "reference" ? "View stylized 3D bird model" : "View real species reference photo"} style={styles.visualToggle} onPress={() => setVisualMode((mode) => mode === "reference" ? "model" : "reference")}>
          <Text style={styles.visualToggleText}>{visualMode === "reference" ? "View 3D model" : "View real species photo"}</Text>
        </Pressable> : null}
        {result.isBird || contextSpecies ? <Text style={[styles.rarity, { color: resultRarity === "legendary" ? "#ffd45e" : "#bde8c9" }]}>{resultRarity.toUpperCase()} ENCOUNTER</Text> : null}
        <Text style={styles.resultTitle}>{resultName !== "Unidentified bird" ? resultName : result.provider === "heuristic" ? "Unverified photo" : "Unable to identify as a bird"}</Text>
        {encounterMismatch
          ? <Text style={styles.confidence}>Model suggests {result?.commonName}, not target {encounterHint?.comName}.</Text>
          : targetHintUnverified
            ? <Text style={styles.confidence}>Using nearby species hint — not model-verified</Text>
            : result.isBird
            ? <><Text style={styles.scientific}>{resultSciName ?? "Scientific name unknown"}</Text><Text style={styles.confidence}>{result.provider === "heuristic" ? "Unverified identification" : `${Math.round(result.confidence * 100)}% confidence`}</Text></>
            : <Text style={styles.confidence}>No species identified. You can save this as an unidentified photo.</Text>}
        <Pressable disabled={saving || savedPhotoUri === photoUri} style={[styles.button, (saving || savedPhotoUri === photoUri) && styles.disabledButton]} onPress={() => void addToCollection()}><Text style={styles.buttonText}>{savedPhotoUri === photoUri ? "Added to collection" : targetHintApplied || result.isBird ? "Add to collection" : "Save unidentified photo"}</Text></Pressable>
      </View>}
      {confirmation && <Text style={styles.confirmation}>✓ {confirmation}</Text>}
      {notice && <Text style={styles.notice}>{notice}</Text>}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#101814" },
  camera: { flex: 1 },
  noCamera: { flex: 1, padding: 28, justifyContent: "center", alignItems: "center", gap: 14 },
  controls: { padding: 20, alignItems: "center", gap: 12 },
  shutter: { width: 72, height: 72, borderRadius: 36, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  shutterText: { color: "#2f7d5b", fontSize: 50, lineHeight: 50 },
  center: { flex: 1, padding: 28, justifyContent: "center", alignItems: "center", gap: 14 },
  title: { fontSize: 24, fontWeight: "700", color: "#d7e8da" },
  copy: { textAlign: "center", color: "#c9ddce", lineHeight: 22 },
  button: { minHeight: 44, backgroundColor: "#2f7d5b", paddingHorizontal: 18, paddingVertical: 12, borderRadius: 10, justifyContent: "center" },
  buttonText: { color: "#fff", fontWeight: "700" },
  disabledButton: { opacity: 0.58 },
  secondary: { minHeight: 44, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, backgroundColor: "#e2eee5", justifyContent: "center" },
  secondaryText: { color: "#173c2b", fontWeight: "700" },
  secondaryDark: { minHeight: 44, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, backgroundColor: "#2f7d5b", justifyContent: "center" },
  lightText: { color: "#fff" },
  result: { width: "100%", maxWidth: 390, alignItems: "center", gap: 5 },
  referenceWrap: { width: "100%", height: 118, borderRadius: 14, overflow: "hidden", backgroundColor: "#18291f" },
  referenceImage: { width: "100%", height: "100%" },
  referenceCaption: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: "rgba(5,16,10,.62)", color: "#d7e8da", fontSize: 9, fontWeight: "700", textAlign: "center" },
  visualToggle: { minHeight: 32, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: "#213f2e", borderWidth: 1, borderColor: "#4e8061" },
  visualToggleText: { color: "#d7e8da", fontSize: 11, fontWeight: "800" },
  buttonRow: { flexDirection: "row", gap: 8, width: "100%", maxWidth: 390 },
  flexButton: { flex: 1, alignItems: "center" },
  rarity: { fontSize: 11, fontWeight: "900", letterSpacing: 1.1 },
  resultTitle: { color: "#fff", fontSize: 21, fontWeight: "700" },
  scientific: { color: "#c9ddce", fontStyle: "italic" },
  confidence: { color: "#d7e8da" },
  targetBanner: { width: "100%", maxWidth: 390, minHeight: 58, borderRadius: 14, backgroundColor: "#1d3529", borderWidth: 1, borderColor: "#3f6a51", flexDirection: "row", alignItems: "center", padding: 8, gap: 10 },
  targetImage: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#dce6df" },
  targetCopy: { flex: 1, minWidth: 0 },
  targetLabel: { color: "#9fc7ad", fontSize: 10, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase" },
  targetName: { color: "#fff", fontSize: 16, fontWeight: "800", marginTop: 1 },
  honorButton: { minHeight: 38, paddingHorizontal: 12, borderRadius: 19, backgroundColor: "#f2cf5b", alignItems: "center", justifyContent: "center" },
  honorButtonText: { color: "#263019", fontSize: 12, fontWeight: "900" },
  honorConfirm: { position: "absolute", left: 20, right: 20, bottom: 112, zIndex: 5, maxWidth: 390, borderRadius: 14, backgroundColor: "#17281f", borderWidth: 1, borderColor: "#577457", padding: 12, gap: 10 },
  honorConfirmText: { color: "#e5f0e7", fontSize: 14, fontWeight: "700", textAlign: "center" },
  honorConfirmActions: { flexDirection: "row", gap: 8 },
  honorCancel: { flex: 1, minHeight: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "#294232" },
  honorCancelText: { color: "#d7e8da", fontWeight: "800" },
  honorConfirmButton: { flex: 1, minHeight: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "#f2cf5b" },
  honorConfirmButtonText: { color: "#263019", fontWeight: "900" },
  confirmation: { color: "#bde8c9", fontWeight: "700", textAlign: "center" },
  notice: { color: "#ffd0a8", fontWeight: "700", textAlign: "center" },
});
