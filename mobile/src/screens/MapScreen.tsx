import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SF_COORDS } from "../config";
import { BirdMap } from "../components/BirdMap";
import type { BirdMapMode } from "../components/BirdMap";
import { useBirds } from "../hooks/useBirds";
import { useCollection } from "../hooks/useCollection";
import type { Coordinates, SeenSpecies } from "../types";

export function MapScreen({ onCapture }: { onCapture?: (hint?: SeenSpecies) => void }) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [location, setLocation] = useState<Coordinates>(SF_COORDS);
  const [center, setCenter] = useState<Coordinates>(SF_COORDS);
  const [mode, setMode] = useState<BirdMapMode>("adventure");
  const [firstPerson, setFirstPerson] = useState(true);
  const [heading, setHeading] = useState<number | undefined>();
  const [recenterRequest, setRecenterRequest] = useState(0);
  const [overviewRequest, setOverviewRequest] = useState(0);
  const [nearestRequest, setNearestRequest] = useState(0);
  const [trackRequest, setTrackRequest] = useState<(Coordinates & { name: string }) | undefined>();
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const [popupOpen, setPopupOpen] = useState(false);
  const [toastOpen, setToastOpen] = useState(false);
  const [nearbyState, setNearbyState] = useState<"peek" | "half">("peek");
  const [tracking, setTracking] = useState(false);
  const [followPaused, setFollowPaused] = useState(false);
  const [locationRetry, setLocationRetry] = useState(0);
  const hasRealLocation = useRef(false);
  const fallbackActive = useRef(true);
  const [rareDismissed, setRareDismissed] = useState(false);
  const { birds, notable, loading, error, loadedArea, refresh } = useBirds(center.latitude, center.longitude);
  const { saveSeen } = useCollection();
  const topMessage = locationNotice
    ? { text: locationNotice, onPress: () => setLocationRetry((request) => request + 1) }
    : error
      ? { text: "Couldn’t load birds. Tap to retry.", onPress: () => void refresh() }
      : followPaused
        ? { text: "Camera follow paused — tap ◎ to resume.", onPress: () => setRecenterRequest((request) => request + 1) }
        : notable.length > 0 && !rareDismissed && !toastOpen
          ? { text: `Rare bird nearby: ${notable[0].comName ?? "Unknown"}!`, onPress: () => setRareDismissed(true) }
          : null;
  const handleRegionChange = (next: Coordinates) => {
    if (
      hasRealLocation.current
      && Math.abs(next.latitude - SF_COORDS.latitude) < 0.0001
      && Math.abs(next.longitude - SF_COORDS.longitude) < 0.0001
    ) return;
    setCenter(next);
  };

  useEffect(() => {
    let mounted = true;
    let subscription: Location.LocationSubscription | undefined;
    let nativeWatchStarting = false;
    let webWatchId: number | undefined;
    let permissionStatus: PermissionStatus | undefined;
    const applyFix = (latitude: number, longitude: number) => {
      if (!mounted || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
      const next = { latitude, longitude };
      const firstFix = !hasRealLocation.current;
      const recoveringFromFallback = fallbackActive.current;
      hasRealLocation.current = true;
      fallbackActive.current = false;
      setLocation(next);
      setLocationNotice(null);
      if (firstFix || recoveringFromFallback) {
        setCenter(next);
        setFirstPerson(true);
        setRecenterRequest((request) => request + 1);
      }
    };
    const handleFailure = () => {
      if (mounted && !hasRealLocation.current) {
        fallbackActive.current = true;
        setLocationNotice("Location unavailable — tap to request access.");
      }
    };
    const startWebWatch = () => {
      if (!mounted || !navigator.geolocation) {
        handleFailure();
        return;
      }
      if (webWatchId !== undefined) navigator.geolocation.clearWatch(webWatchId);
      webWatchId = navigator.geolocation.watchPosition(
        (position) => applyFix(position.coords.latitude, position.coords.longitude),
        handleFailure,
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
      );
      navigator.geolocation.getCurrentPosition(
        (position) => applyFix(position.coords.latitude, position.coords.longitude),
        handleFailure,
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
      );
    };
    const startNativeWatch = async () => {
      if (!mounted || subscription || nativeWatchStarting) return;
      nativeWatchStarting = true;
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        nativeWatchStarting = false;
        handleFailure();
        return;
      }
      try {
        const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        applyFix(current.coords.latitude, current.coords.longitude);
        subscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, distanceInterval: 5 },
          (update) => applyFix(update.coords.latitude, update.coords.longitude),
        );
      } catch {
        handleFailure();
      } finally {
        nativeWatchStarting = false;
      }
    };
    if (Platform.OS === "web") {
      startWebWatch();
      void navigator.permissions?.query({ name: "geolocation" }).then((status) => {
        permissionStatus = status;
        status.onchange = () => {
          if (status.state === "granted") startWebWatch();
          else handleFailure();
        };
      }).catch(() => undefined);
    } else {
      void startNativeWatch();
    }
    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && Platform.OS !== "web") void startNativeWatch();
    });
    return () => {
      mounted = false;
      subscription?.remove();
      if (webWatchId !== undefined) navigator.geolocation?.clearWatch(webWatchId);
      if (permissionStatus) permissionStatus.onchange = null;
      appStateSubscription.remove();
    };
  }, [locationRetry]);

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
    if (!birds.length || !loadedArea) return;
    void saveSeen(
      birds.flatMap((bird) => bird.comName ? [{ speciesCode: bird.speciesCode, comName: bird.comName }] : []),
      loadedArea,
    );
  }, [birds, loadedArea, saveSeen]);

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
    setFollowPaused(false);
    setToastOpen(false);
    setNearbyState("peek");
    if (mode === "adventure") {
      setFirstPerson(false);
      setMode("classic");
    } else {
      setFirstPerson(true);
      setMode("adventure");
    }
  };

  return (
    <View style={styles.container}>
      <BirdMap
        center={center}
        userLocation={location}
        safeArea={insets}
        birds={birds}
        loading={loading}
        mode={mode}
        firstPerson={firstPerson}
        heading={heading}
        recenterRequest={recenterRequest}
        overviewRequest={overviewRequest}
        nearestRequest={nearestRequest}
        trackRequest={trackRequest}
        onCapture={(bird) => {
          onCapture?.({ speciesCode: bird.speciesCode, comName: bird.comName ?? "Unknown bird" });
          navigation.navigate("Capture" as never);
        }}
        onDirections={(target) => setTrackRequest(target)}
        onAbout={({ speciesCode, comName }) => {
          const url = speciesCode.startsWith("inat-")
            ? `https://www.inaturalist.org/taxa/${speciesCode.slice(5)}`
            : speciesCode
            ? `https://ebird.org/species/${speciesCode}`
            : `https://ebird.org/search?q=${encodeURIComponent(comName)}`;
          void Linking.openURL(url);
        }}
        onPopupChange={setPopupOpen}
        onToastChange={setToastOpen}
        onNearbyStateChange={setNearbyState}
        onFollowChange={setFollowPaused}
        onTrackingChange={setTracking}
        onRegionChange={handleRegionChange}
      />
      <View pointerEvents="box-none" style={[styles.topOverlay, { paddingTop: insets.top + 8 }]}>
        <View style={styles.controlRail}>
        <Pressable accessibilityLabel={`Current map mode: ${mode === "classic" ? "Classic" : "Adventure"}. Tap to switch.`} style={[styles.modeButton, styles.modeButtonActive]} onPress={toggleMode}>
          <Text style={styles.modeButtonText}>{mode === "classic" ? "🗺 2D" : "🌿 3D"}</Text>
        </Pressable>
        {mode === "adventure" && (
          <Pressable accessibilityLabel={`Current view: ${firstPerson ? "First-person" : "Overhead"}. Tap to switch.`} style={[styles.modeButton, styles.modeButtonActive]} onPress={() => setFirstPerson((current) => !current)}>
            <Text style={styles.modeButtonText}>{firstPerson ? "👣 Walk" : "🐦 Above"}</Text>
          </Pressable>
        )}
        </View>
        {topMessage && !popupOpen && (
          <Pressable style={styles.topMessage} onPress={topMessage.onPress}>
            <Text style={styles.topMessageText}>{topMessage.text}</Text>
            <Text style={styles.topMessageDismiss}>×</Text>
          </Pressable>
        )}
        {loading && <ActivityIndicator color="#fff" />}
      </View>
      {!loading && !error && birds.length === 0 && <View style={styles.empty}><Text style={styles.emptyText}>No birds spotted nearby — try moving the map.</Text></View>}
      {mode === "adventure" && (
        <>
          <View pointerEvents="box-none" style={[styles.actionRail, { top: insets.top + (nearbyState === "half" ? 56 : 112) }]}>
            <Pressable accessibilityLabel="Find closest bird" style={styles.actionButton} onPress={() => setNearestRequest((request) => request + 1)}><Text style={styles.recenterText}>🐦</Text></Pressable>
            <Pressable accessibilityLabel="See all birds" style={styles.actionButton} onPress={() => setOverviewRequest((request) => request + 1)}><Text style={styles.recenterText}>🗺</Text></Pressable>
            <Pressable accessibilityLabel="Back to me" style={styles.actionButton} onPress={() => setRecenterRequest((request) => request + 1)}><Text style={styles.recenterText}>◎</Text></Pressable>
          </View>
        </>
      )}
      {mode === "classic" && (
        <Pressable accessibilityLabel="Back to me" style={[styles.actionButton, styles.classicRecenter, { top: insets.top + 112 }]} onPress={() => setRecenterRequest((request) => request + 1)}><Text style={styles.recenterText}>◎</Text></Pressable>
      )}
      {nearbyState !== "half" && !tracking && (
        <Pressable
          disabled={popupOpen}
          pointerEvents={popupOpen ? "none" : "auto"}
          style={[styles.captureButton, { bottom: insets.bottom + 164 }, popupOpen && styles.captureButtonDimmed]}
          onPress={() => { onCapture?.(); navigation.navigate("Capture" as never); }}
        >
          <Text style={styles.captureText}>📷</Text>
          <Text style={styles.captureLabel}>Capture</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topOverlay: { position: "absolute", top: 0, left: 16, right: 16, paddingTop: 8, gap: 8 },
  controlRail: { alignSelf: "flex-end", flexDirection: "row", gap: 6 },
  modeButton: { minWidth: 64, height: 44, paddingHorizontal: 5, backgroundColor: "#ffffffee", borderRadius: 14, elevation: 3, alignItems: "center", justifyContent: "center" },
  modeButtonActive: { backgroundColor: "#d9efe1", borderWidth: 2, borderColor: "#2f7d5b" },
  modeButtonText: { color: "#173c2b", fontWeight: "700" },
  topMessage: { minHeight: 44, maxWidth: 360, alignSelf: "flex-start", backgroundColor: "#ffffffee", paddingHorizontal: 12, borderRadius: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  topMessageText: { flex: 1, color: "#173c2b", fontWeight: "700", fontSize: 13 },
  topMessageDismiss: { color: "#173c2b", fontSize: 22, lineHeight: 24 },
  empty: { position: "absolute", top: "42%", left: 35, right: 35, backgroundColor: "#ffffffe8", padding: 16, borderRadius: 12 },
  emptyText: { textAlign: "center", color: "#555" },
  actionRail: { position: "absolute", right: 16, gap: 8, alignItems: "center" },
  actionButton: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#ffffffee", alignItems: "center", justifyContent: "center", elevation: 4 },
  classicRecenter: { position: "absolute", right: 16 },
  recenterText: { color: "#2878d1", fontSize: 30, lineHeight: 32 },
  captureButton: { position: "absolute", left: 16, width: 82, height: 82, borderRadius: 41, backgroundColor: "#2f7d5b", alignItems: "center", justifyContent: "center", borderWidth: 5, borderColor: "#fff", elevation: 5 },
  captureButtonDimmed: { opacity: 0.35 },
  captureText: { fontSize: 28 },
  captureLabel: { color: "#fff", fontWeight: "700", fontSize: 11 },
});
