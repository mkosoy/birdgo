import { useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions, type CameraType } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import * as FileSystem from "expo-file-system";
import { identifyBird } from "../api";
import { SF_COORDS } from "../config";
import { useCollection } from "../hooks/useCollection";
import type { Coordinates } from "../types";
import type { SeenSpecies } from "../types";

type Props = { hint?: SeenSpecies };

export function CaptureScreen({ hint }: Props) {
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraType] = useState<CameraType>("back");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [result, setResult] = useState<Awaited<ReturnType<typeof identifyBird>> | null>(null);
  const [busy, setBusy] = useState(false);
  const { saveCapture } = useCollection();

  const processPhoto = async (uri: string, base64?: string | null) => {
    setPhotoUri(uri);
    setBusy(true);
    try {
      const encoded = base64 ?? await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      setResult(await identifyBird(encoded, hint?.comName ? [hint.comName] : []));
    } catch {
      Alert.alert("Identification unavailable", "Check your connection and try again.");
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
    if (!permissionResult.granted) return Alert.alert("Photo permission needed", "Allow library access or use the camera.");
    const selected = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, base64: true, quality: 0.7 });
    if (!selected.canceled && selected.assets[0]) await processPhoto(selected.assets[0].uri, selected.assets[0].base64);
  };

  const addToCollection = async () => {
    if (!result?.isBird || !photoUri) return;
    let location: Coordinates = SF_COORDS;
    try {
      const current = await Location.getCurrentPositionAsync({});
      location = { latitude: current.coords.latitude, longitude: current.coords.longitude };
    } catch { /* SF fallback is intentional */ }
    await saveCapture({
      id: `${Date.now()}`,
      speciesCode: hint?.speciesCode,
      commonName: result.commonName ?? hint?.comName ?? "Unknown bird",
      sciName: result.sciName,
      photoUri,
      timestamp: new Date().toISOString(),
      location,
    });
    Alert.alert("Added to Bird-dex", `${result.commonName ?? hint?.comName ?? "Bird"} is now in your collection.`);
  };

  return <View style={styles.container}>
    {!photoUri
      ? permission?.granted
        ? <CameraView ref={camera} style={styles.camera} facing={cameraType} />
        : <View style={styles.noCamera}>
          <Text style={styles.title}>Camera access needed</Text>
          <Text style={styles.copy}>Allow camera access to photograph birds, or choose a photo from your library.</Text>
          <Pressable style={styles.button} onPress={() => void requestPermission()}><Text style={styles.buttonText}>Enable camera</Text></Pressable>
          <Pressable style={styles.secondary} onPress={() => void pickPhoto()}><Text>Pick from library</Text></Pressable>
        </View>
      : <Image source={{ uri: photoUri }} style={styles.camera} />}
    <View style={styles.controls}>
      {!photoUri && permission?.granted && <Pressable style={styles.shutter} onPress={() => void takePhoto()}><Text style={styles.shutterText}>●</Text></Pressable>}
      {photoUri && <Pressable style={styles.button} onPress={() => { setPhotoUri(null); setResult(null); }}><Text style={styles.buttonText}>Try another</Text></Pressable>}
      {photoUri && <Pressable style={styles.secondaryDark} onPress={() => void pickPhoto()}><Text style={styles.lightText}>Pick from library</Text></Pressable>}
      {busy && <ActivityIndicator color="#fff" />}
      {result && !busy && <View style={styles.result}><Text style={styles.resultTitle}>{result.isBird ? result.commonName : "That doesn't look like a bird"}</Text>{result.isBird && <><Text style={styles.scientific}>{result.sciName ?? "Species unknown"}</Text><Text style={styles.confidence}>{Math.round(result.confidence * 100)}% confidence</Text><Pressable style={styles.button} onPress={() => void addToCollection()}><Text style={styles.buttonText}>Add to collection</Text></Pressable></>}</View>}
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
  title: { fontSize: 24, fontWeight: "700", color: "#173c2b" },
  copy: { textAlign: "center", color: "#555", lineHeight: 22 },
  button: { backgroundColor: "#2f7d5b", paddingHorizontal: 18, paddingVertical: 12, borderRadius: 10 },
  buttonText: { color: "#fff", fontWeight: "700" },
  secondary: { padding: 12 },
  secondaryDark: { padding: 10 },
  lightText: { color: "#fff" },
  result: { alignItems: "center", gap: 5 },
  resultTitle: { color: "#fff", fontSize: 21, fontWeight: "700" },
  scientific: { color: "#c9ddce", fontStyle: "italic" },
  confidence: { color: "#d7e8da" },
});
