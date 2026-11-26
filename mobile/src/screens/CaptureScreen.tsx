import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions, type CameraType } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import * as FileSystem from "expo-file-system";
import { identifyBird } from "../api";
import { SF_COORDS } from "../config";
import { useCollection } from "../hooks/useCollection";
import type { Coordinates } from "../types";
import type { SeenSpecies } from "../types";
import { Bird3DPreview } from "../components/Bird3DPreview";
import { rarityForSpecies, speciesKey } from "../utils/progression";

type Props = { hint?: SeenSpecies; onHintConsumed?: () => void };

export function CaptureScreen({ hint, onHintConsumed }: Props) {
  const insets = useSafeAreaInsets();
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraType] = useState<CameraType>("back");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [result, setResult] = useState<Awaited<ReturnType<typeof identifyBird>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { saveCapture, captures } = useCollection();
  const [encounterHint, setEncounterHint] = useState<SeenSpecies | undefined>(hint);
  const previousHint = useRef<SeenSpecies | undefined>(hint);

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
      }
    } else if (!photoUri) {
      setEncounterHint(undefined);
    }
  }, [hint, photoUri]);

  const processPhoto = async (uri: string, base64?: string | null) => {
    setPhotoUri(uri);
    setConfirmation(null);
    setNotice(null);
    setBusy(true);
    try {
      const encoded = base64 ?? await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      setResult(await identifyBird(encoded, encounterHint?.comName ? [encounterHint.comName] : []));
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

  const addToCollection = async () => {
    if (!result || !photoUri) return;
    let location: Coordinates = SF_COORDS;
    try {
      const current = await Location.getCurrentPositionAsync({});
      location = { latitude: current.coords.latitude, longitude: current.coords.longitude };
    } catch { /* SF fallback is intentional */ }
    const commonName = encounterHint?.comName ?? result.commonName ?? "Unidentified bird";
    const rarity = rarityForSpecies(encounterHint?.speciesCode, commonName, encounterHint?.isNotable);
    const verified = Boolean(!encounterHint?.comName && result.isBird && result.provider !== "heuristic");
    const isNewSpecies = !captures.some((capture) => speciesKey(capture.speciesCode, capture.commonName) === speciesKey(encounterHint?.speciesCode, commonName));
    const record = await saveCapture({
      id: `${Date.now()}`,
      speciesCode: encounterHint?.speciesCode,
      commonName,
      sciName: encounterHint?.sciName ?? result.sciName,
      photoUri,
      timestamp: new Date().toISOString(),
      location,
      rarity,
      verified,
    });
    const firstBonus = isNewSpecies ? " First species bonus!" : "";
    setConfirmation(`${commonName} joined your Bird-dex. +${record.xpAwarded ?? 0} XP.${firstBonus}`);
    if (encounterHint) onHintConsumed?.();
  };

  const resultName = encounterHint?.comName ?? result?.commonName ?? "Unidentified bird";
  const resultRarity = rarityForSpecies(encounterHint?.speciesCode, resultName, encounterHint?.isNotable);

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
      {!photoUri && permission?.granted && <Pressable style={styles.shutter} onPress={() => void takePhoto()}><Text style={styles.shutterText}>●</Text></Pressable>}
      {photoUri && <Pressable style={styles.button} onPress={() => { setPhotoUri(null); setResult(null); setConfirmation(null); setEncounterHint(undefined); }}><Text style={styles.buttonText}>Try another</Text></Pressable>}
      {photoUri && <Pressable style={styles.secondaryDark} onPress={() => void pickPhoto()}><Text style={styles.lightText}>Pick from library</Text></Pressable>}
      {busy && <ActivityIndicator color="#fff" />}
      {result && !busy && <View style={styles.result}>
        <Bird3DPreview commonName={resultName} rarity={resultRarity} height={118} />
        <Text style={[styles.rarity, { color: resultRarity === "legendary" ? "#ffd45e" : "#bde8c9" }]}>{resultRarity.toUpperCase()} ENCOUNTER</Text>
        <Text style={styles.resultTitle}>{encounterHint?.comName ?? (result.isBird ? result.commonName : result.provider === "heuristic" ? "Unverified photo" : "Unable to identify as a bird")}</Text>
        {encounterHint?.comName
          ? <Text style={styles.confidence}>Using nearby species hint — not model-verified</Text>
          : result.isBird
            ? <><Text style={styles.scientific}>{result.sciName ?? "Scientific name unknown"}</Text><Text style={styles.confidence}>{result.provider === "heuristic" ? "Unverified identification" : `${Math.round(result.confidence * 100)}% confidence`}</Text></>
            : <Text style={styles.confidence}>No species identified. You can save this as an unidentified photo.</Text>}
        <Pressable style={styles.button} onPress={() => void addToCollection()}><Text style={styles.buttonText}>{encounterHint?.comName || result.isBird ? "Add to collection" : "Save unidentified photo"}</Text></Pressable>
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
  secondary: { minHeight: 44, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, backgroundColor: "#e2eee5", justifyContent: "center" },
  secondaryText: { color: "#173c2b", fontWeight: "700" },
  secondaryDark: { minHeight: 44, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, backgroundColor: "#2f7d5b", justifyContent: "center" },
  lightText: { color: "#fff" },
  result: { width: "100%", maxWidth: 390, alignItems: "center", gap: 5 },
  rarity: { fontSize: 11, fontWeight: "900", letterSpacing: 1.1 },
  resultTitle: { color: "#fff", fontSize: 21, fontWeight: "700" },
  scientific: { color: "#c9ddce", fontStyle: "italic" },
  confidence: { color: "#d7e8da" },
  confirmation: { color: "#bde8c9", fontWeight: "700", textAlign: "center" },
  notice: { color: "#ffd0a8", fontWeight: "700", textAlign: "center" },
});
