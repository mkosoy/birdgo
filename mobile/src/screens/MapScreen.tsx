import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import MapView, { Marker, PROVIDER_DEFAULT, UrlTile } from "react-native-maps";
import { useNavigation } from "@react-navigation/native";
import { SF_COORDS } from "../config";
import { useBirds } from "../hooks/useBirds";
import { useCollection } from "../hooks/useCollection";
import type { Coordinates, EbirdObservation, SeenSpecies } from "../types";

function relativeTime(date?: string): string {
  if (!date) return "recently";
  const hours = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 3600000));
  return hours < 1 ? "now" : hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

export function MapScreen({ onCapture }: { onCapture?: (hint?: SeenSpecies) => void }) {
  const navigation = useNavigation();
  const [location, setLocation] = useState<Coordinates>(SF_COORDS);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const [rareDismissed, setRareDismissed] = useState(false);
  const { birds, notable, loading, error, refresh } = useBirds(location.latitude, location.longitude);
  const { saveSeen } = useCollection();
  const rareNames = useMemo(() => new Set(notable.map((bird) => bird.speciesCode)), [notable]);

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

  const renderMarker = (bird: EbirdObservation, rare: boolean) => (
    <Marker
      key={`${bird.speciesCode}:${bird.locId ?? bird.latitude}`}
      coordinate={{ latitude: bird.latitude, longitude: bird.longitude }}
      pinColor={rare ? "#e4a72c" : "#2f7d5b"}
      onPress={() => { onCapture?.({ speciesCode: bird.speciesCode, comName: bird.comName ?? "Unknown bird" }); navigation.navigate("Capture" as never); }}
    >
      <View style={[styles.pin, rare && styles.rarePin]}>
        <Text style={styles.pinEmoji}>{rare ? "★" : "🐦"}</Text>
        <Text style={styles.pinLabel}>{bird.comName ?? "Bird"}</Text>
        <Text style={styles.pinTime}>{relativeTime(bird.obsDt)}</Text>
      </View>
    </Marker>
  );

  return (
    <View style={styles.container}>
      <MapView provider={PROVIDER_DEFAULT} style={StyleSheet.absoluteFill} region={{ ...location, latitudeDelta: 0.08, longitudeDelta: 0.08 }} onRegionChangeComplete={(region) => setLocation({ latitude: region.latitude, longitude: region.longitude })} showsUserLocation>
        <UrlTile urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maximumZ={19} />
        {birds.map((bird) => renderMarker(bird, rareNames.has(bird.speciesCode)))}
        {notable.filter((bird) => !birds.some((item) => item.speciesCode === bird.speciesCode && item.locId === bird.locId)).map((bird) => renderMarker(bird, true))}
      </MapView>
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
  pin: { backgroundColor: "#fff", borderRadius: 10, padding: 5, alignItems: "center", borderWidth: 1, borderColor: "#2f7d5b" },
  rarePin: { borderColor: "#d99d21", borderWidth: 2 },
  pinEmoji: { fontSize: 18 },
  pinLabel: { fontSize: 10, fontWeight: "700", maxWidth: 100 },
  pinTime: { fontSize: 9, color: "#666" },
  captureButton: { position: "absolute", bottom: 22, alignSelf: "center", width: 82, height: 82, borderRadius: 41, backgroundColor: "#2f7d5b", alignItems: "center", justifyContent: "center", borderWidth: 5, borderColor: "#fff", elevation: 5 },
  captureText: { fontSize: 28 },
  captureLabel: { color: "#fff", fontWeight: "700", fontSize: 11 },
});
