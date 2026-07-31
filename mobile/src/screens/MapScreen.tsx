import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { useNavigation } from "@react-navigation/native";
import { SF_COORDS } from "../config";
import { BirdMap } from "../components/BirdMap";
import { useBirds } from "../hooks/useBirds";
import { useCollection } from "../hooks/useCollection";
import type { Coordinates, SeenSpecies } from "../types";

export function MapScreen({ onCapture }: { onCapture?: (hint?: SeenSpecies) => void }) {
  const navigation = useNavigation();
  const [location, setLocation] = useState<Coordinates>(SF_COORDS);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const [rareDismissed, setRareDismissed] = useState(false);
  const { birds, notable, loading, error, refresh } = useBirds(location.latitude, location.longitude);
  const { saveSeen } = useCollection();

  useEffect(() => {
    void (async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setLocationNotice("Location unavailable — showing San Francisco.");
        return;
      }
      const current = await Location.getCurrentPositionAsync({});
      setLocation({ latitude: current.coords.latitude, longitude: current.coords.longitude });
    })().catch(() => setLocationNotice("Location unavailable — showing San Francisco."));
  }, []);

  useEffect(() => {
    void saveSeen(birds.flatMap((bird) => bird.comName ? [{ speciesCode: bird.speciesCode, comName: bird.comName }] : []));
  }, [birds, saveSeen]);

  useEffect(() => {
    if (!notable.length) return;
    void Notifications.getPermissionsAsync().then(async (permission) => {
      if (permission.status === "granted") {
        await Notifications.scheduleNotificationAsync({
          content: { title: "Rare bird nearby", body: `${notable[0].comName ?? "A rare bird"} was spotted.` },
          trigger: null,
        });
      }
    }).catch(() => undefined);
  }, [notable]);

  return (
    <View style={styles.container}>
      <BirdMap
        center={location}
        userLocation={location}
        birds={birds}
        onMarkerPress={(bird) => {
          onCapture?.({ speciesCode: bird.speciesCode, comName: bird.comName ?? "Unknown bird" });
          navigation.navigate("Capture" as never);
        }}
        onRegionChange={setLocation}
      />
      <View style={styles.topOverlay}>
        {locationNotice && <Text style={styles.notice}>{locationNotice}</Text>}
        {notable.length > 0 && !rareDismissed && (
          <Pressable style={styles.rareBanner} onPress={() => setRareDismissed(true)}>
            <Text style={styles.bannerText}>Rare bird nearby: {notable[0].comName ?? "Unknown"}!  ×</Text>
          </Pressable>
        )}
        {error && <Pressable style={styles.error} onPress={() => void refresh()}><Text>Couldn’t load birds. Tap to retry.</Text></Pressable>}
        {loading && <ActivityIndicator color="#fff" />}
      </View>
      {!loading && !error && birds.length === 0 && <View style={styles.empty}><Text style={styles.emptyText}>No birds spotted nearby — try moving the map.</Text></View>}
      <Pressable style={styles.captureButton} onPress={() => { onCapture?.(); navigation.navigate("Capture" as never); }}><Text style={styles.captureText}>📷</Text><Text style={styles.captureLabel}>Capture</Text></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topOverlay: { position: "absolute", top: 52, left: 16, right: 16, gap: 8 },
  notice: { backgroundColor: "#fff", padding: 8, borderRadius: 8, color: "#555" },
  rareBanner: { backgroundColor: "#d99d21", padding: 14, borderRadius: 12 },
  bannerText: { color: "#fff", fontWeight: "700" },
  error: { backgroundColor: "#ffd9d9", padding: 12, borderRadius: 8 },
  empty: { position: "absolute", top: "42%", left: 35, right: 35, backgroundColor: "#ffffffe8", padding: 16, borderRadius: 12 },
  emptyText: { textAlign: "center", color: "#555" },
  captureButton: { position: "absolute", bottom: 22, alignSelf: "center", width: 82, height: 82, borderRadius: 41, backgroundColor: "#2f7d5b", alignItems: "center", justifyContent: "center", borderWidth: 5, borderColor: "#fff", elevation: 5 },
  captureText: { fontSize: 28 },
  captureLabel: { color: "#fff", fontWeight: "700", fontSize: 11 },
});
