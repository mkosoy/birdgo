import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { useNavigation } from "@react-navigation/native";
import { SF_COORDS } from "../config";
import { BirdMap } from "../components/BirdMap";
import type { BirdMapMode } from "../components/BirdMap";
import { useBirds } from "../hooks/useBirds";
import { useCollection } from "../hooks/useCollection";
import type { Coordinates, SeenSpecies } from "../types";

export function MapScreen({ onCapture }: { onCapture?: (hint?: SeenSpecies) => void }) {
  const navigation = useNavigation();
  const [location, setLocation] = useState<Coordinates>(SF_COORDS);
  const [center, setCenter] = useState<Coordinates>(SF_COORDS);
  const [mode, setMode] = useState<BirdMapMode>("adventure");
  const [firstPerson, setFirstPerson] = useState(true);
  const [heading, setHeading] = useState<number | undefined>();
  const [recenterRequest, setRecenterRequest] = useState(0);
  const [overviewRequest, setOverviewRequest] = useState(0);
  const [nearestRequest, setNearestRequest] = useState(0);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const [rareDismissed, setRareDismissed] = useState(false);
  const { birds, notable, loading, error, refresh } = useBirds(center.latitude, center.longitude);
  const { saveSeen } = useCollection();

  useEffect(() => {
    let mounted = true;
    let subscription: Location.LocationSubscription | undefined;
    void (async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        if (mounted) setLocationNotice("Location unavailable — showing San Francisco.");
        return;
      }
      try {
        const current = await Location.getCurrentPositionAsync({});
        if (mounted) {
          const firstFix = { latitude: current.coords.latitude, longitude: current.coords.longitude };
          setLocation(firstFix);
          setCenter(firstFix);
          setFirstPerson(true);
          setRecenterRequest((request) => request + 1);
        }
      } catch {
        if (mounted) setLocationNotice("Location unavailable — showing San Francisco.");
      }
      if (!mounted) return;
      const nextSubscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 10 },
        (update) => {
          if (mounted) setLocation({ latitude: update.coords.latitude, longitude: update.coords.longitude });
        },
      );
      if (mounted) subscription = nextSubscription;
      else nextSubscription.remove();
    })().catch(() => {
      if (mounted) setLocationNotice("Location unavailable — showing San Francisco.");
    });
    return () => {
      mounted = false;
      subscription?.remove();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === "web" || !firstPerson) {
      setHeading(undefined);
      return;
    }
    let mounted = true;
    let subscription: Location.LocationSubscription | undefined;
    void Location.watchHeadingAsync((update) => {
      const nextHeading = update.trueHeading >= 0 ? update.trueHeading : update.magHeading;
      if (Number.isFinite(nextHeading)) setHeading(nextHeading);
    }).then((nextSubscription) => {
      if (mounted) subscription = nextSubscription;
      else nextSubscription.remove();
    }).catch(() => undefined);
    return () => {
      mounted = false;
      subscription?.remove();
    };
  }, [firstPerson]);

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

  const toggleMode = () => {
    if (mode === "adventure") {
      setFirstPerson(false);
      setMode("classic");
    } else {
      setMode("adventure");
    }
  };

  return (
    <View style={styles.container}>
      <BirdMap
        center={center}
        userLocation={location}
        birds={birds}
        mode={mode}
        firstPerson={firstPerson}
        heading={heading}
        recenterRequest={recenterRequest}
        overviewRequest={overviewRequest}
        nearestRequest={nearestRequest}
        onCapture={(bird) => {
          onCapture?.({ speciesCode: bird.speciesCode, comName: bird.comName ?? "Unknown bird" });
          navigation.navigate("Capture" as never);
        }}
        onDirections={({ latitude, longitude }) => {
          void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`);
        }}
        onAbout={({ speciesCode, comName }) => {
          const url = speciesCode.startsWith("inat-")
            ? `https://www.inaturalist.org/taxa/${speciesCode.slice(5)}`
            : speciesCode
            ? `https://ebird.org/species/${speciesCode}`
            : `https://ebird.org/search?q=${encodeURIComponent(comName)}`;
          void Linking.openURL(url);
        }}
        onRegionChange={setCenter}
      />
      <View style={styles.topOverlay}>
        <Pressable style={styles.modeButton} onPress={toggleMode}>
          <Text style={styles.modeButtonText}>{mode === "classic" ? "🌿 Adventure" : "🗺 Classic"}</Text>
        </Pressable>
        {mode === "adventure" && (
          <Pressable style={styles.modeButton} onPress={() => setFirstPerson((current) => !current)}>
            <Text style={styles.modeButtonText}>{firstPerson ? "🗺 Overhead" : "👣 First-person"}</Text>
          </Pressable>
        )}
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
      {mode === "adventure" && (
        <>
          <Pressable accessibilityLabel="Find closest bird" style={styles.nearestButton} onPress={() => setNearestRequest((request) => request + 1)}><Text style={styles.recenterText}>🐦</Text></Pressable>
          <Pressable accessibilityLabel="See all birds" style={styles.overviewButton} onPress={() => setOverviewRequest((request) => request + 1)}><Text style={styles.recenterText}>🗺</Text></Pressable>
        </>
      )}
      <Pressable accessibilityLabel="Back to me" style={styles.recenterButton} onPress={() => setRecenterRequest((request) => request + 1)}><Text style={styles.recenterText}>◎</Text></Pressable>
      <Pressable style={styles.captureButton} onPress={() => { onCapture?.(); navigation.navigate("Capture" as never); }}><Text style={styles.captureText}>📷</Text><Text style={styles.captureLabel}>Capture</Text></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topOverlay: { position: "absolute", top: 52, left: 16, right: 16, gap: 8 },
  modeButton: { alignSelf: "flex-end", backgroundColor: "#ffffffee", paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, elevation: 3 },
  modeButtonText: { color: "#173c2b", fontWeight: "700" },
  notice: { backgroundColor: "#fff", padding: 8, borderRadius: 8, color: "#555" },
  rareBanner: { backgroundColor: "#d99d21", padding: 14, borderRadius: 12 },
  bannerText: { color: "#fff", fontWeight: "700" },
  error: { backgroundColor: "#ffd9d9", padding: 12, borderRadius: 8 },
  empty: { position: "absolute", top: "42%", left: 35, right: 35, backgroundColor: "#ffffffe8", padding: 16, borderRadius: 12 },
  emptyText: { textAlign: "center", color: "#555" },
  recenterButton: { position: "absolute", right: 16, bottom: 190, width: 52, height: 52, borderRadius: 26, backgroundColor: "#ffffffee", alignItems: "center", justifyContent: "center", elevation: 4 },
  overviewButton: { position: "absolute", right: 16, bottom: 250, width: 52, height: 52, borderRadius: 26, backgroundColor: "#ffffffee", alignItems: "center", justifyContent: "center", elevation: 4 },
  nearestButton: { position: "absolute", right: 16, bottom: 310, width: 52, height: 52, borderRadius: 26, backgroundColor: "#ffffffee", alignItems: "center", justifyContent: "center", elevation: 4 },
  recenterText: { color: "#2878d1", fontSize: 30, lineHeight: 32 },
  captureButton: { position: "absolute", bottom: 22, alignSelf: "center", width: 82, height: 82, borderRadius: 41, backgroundColor: "#2f7d5b", alignItems: "center", justifyContent: "center", borderWidth: 5, borderColor: "#fff", elevation: 5 },
  captureText: { fontSize: 28 },
  captureLabel: { color: "#fff", fontWeight: "700", fontSize: 11 },
});
