import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { StyleSheet } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { buildLeafletHtml } from "./leafletHtml";
import { buildMapLibreHtml } from "./mapLibreHtml";
import type { BirdRarity, Coordinates, EbirdObservation, TrainerProfile, WeatherAtmosphere } from "../types";
import { speciesKey } from "../utils/progression";
import { observationTimeMs } from "../utils/observationTime";
import { API_BASE_URL } from "../config";

export type BirdMapMode = "classic" | "adventure";
export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface BirdMapProps {
  center: Coordinates;
  userLocation?: Coordinates;
  birds: EbirdObservation[];
  captureCounts?: Record<string, number>;
  mode: BirdMapMode;
  firstPerson: boolean;
  heading?: number;
  recenterRequest?: number;
  overviewRequest?: number;
  nearestRequest?: number;
  trackRequest?: Coordinates & { name: string; id?: string };
  stopTrackRequest?: number;
  closePopupRequest?: number;
  loading?: boolean;
  weather?: WeatherAtmosphere;
  trainer?: TrainerProfile;
  safeArea?: SafeAreaInsets;
  onCapture: (bird: EbirdObservation) => void;
  onDirections: (coordinates: Coordinates & { name: string; id?: string }) => void;
  onAbout: (bird: { speciesCode: string; comName: string; sciName?: string }) => void;
  onPopupChange?: (open: boolean) => void;
  onToastChange?: (open: boolean) => void;
  onNearbyStateChange?: (state: "peek" | "half", height?: number) => void;
  onFollowChange?: (paused: boolean) => void;
  onTrackingChange?: (active: boolean, target?: Coordinates & { name: string; id?: string; speciesCode?: string }) => void;
  onRegionChange: (coordinates: Coordinates) => void;
}

export interface LeafletMarker {
  id: string;
  latitude: number;
  longitude: number;
  comName: string;
  sciName?: string;
  locName?: string;
  obsDt?: string;
  relativeTime: string;
  howMany?: number;
  frequency?: number;
  reportCount?: number;
  speciesCode: string;
  isNotable: boolean;
  imageUrl?: string;
  virtual?: boolean;
  prismatic?: boolean;
  source?: string;
  captureCount?: number;
  rarity?: BirdRarity;
}

export interface LeafletData {
  center: Coordinates;
  userLocation?: Coordinates;
  loading?: boolean;
  weather?: WeatherAtmosphere;
  trainer?: TrainerProfile;
  heading?: number;
  markers: LeafletMarker[];
  command?: "recenter" | "setView" | "overview" | "nearest" | "track" | "stopTrack" | "closePopup";
  trackTarget?: Coordinates & { name: string; id?: string; speciesCode?: string };
  firstPerson?: boolean;
  safeArea?: SafeAreaInsets;
}

export type LeafletDataPayload = Omit<LeafletData, "markers"> & { markers?: LeafletMarker[] };

interface LeafletMessage {
  type: "capture" | "directions" | "about" | "regionChange" | "popup" | "toast" | "nearbyState" | "follow" | "tracking";
  open?: boolean;
  paused?: boolean;
  state?: "peek" | "half";
  height?: number;
  id?: string;
  speciesCode?: string;
  comName?: string;
  sciName?: string;
  name?: string;
  latitude?: number;
  longitude?: number;
}

function relativeTime(date?: string, longitude?: number): string {
  if (!date) return "recently";
  const observedAt = observationTimeMs(date, longitude);
  if (observedAt == null) return "recently";
  const hours = Math.max(0, Math.floor((Date.now() - observedAt) / 3600000));
  return hours < 1 ? "now" : hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

function markerId(bird: EbirdObservation): string {
  return `${bird.speciesCode}:${bird.locId ?? `${bird.latitude}:${bird.longitude}`}`;
}

export const BirdMap = forwardRef<WebView, BirdMapProps>(function BirdMap(
  { center, userLocation, birds, captureCounts, mode, firstPerson, heading, weather, trainer, recenterRequest, overviewRequest, nearestRequest, trackRequest, stopTrackRequest, closePopupRequest, safeArea, loading, onCapture, onDirections, onAbout, onPopupChange, onToastChange, onNearbyStateChange, onFollowChange, onTrackingChange, onRegionChange },
  forwardedRef,
) {
  const webViewRef = useRef<WebView>(null);
  const lastRecenterRef = useRef(0);
  const lastFirstPersonRef = useRef(firstPerson);
  const lastOverviewRef = useRef(0);
  const lastNearestRef = useRef(0);
  const dataRef = useRef<LeafletData | null>(null);
  const postedMarkersRef = useRef<LeafletMarker[] | null>(null);
  useImperativeHandle(forwardedRef, () => webViewRef.current as WebView);
  const markerLookup = useMemo(() => new Map(birds.map((bird) => [markerId(bird), bird])), [birds]);
  const markers = useMemo<LeafletMarker[]>(() => birds.map((bird) => ({
    id: markerId(bird),
    latitude: bird.latitude,
    longitude: bird.longitude,
    comName: bird.comName ?? "Bird",
    sciName: bird.sciName,
    locName: bird.locName,
    obsDt: bird.obsDt,
    relativeTime: relativeTime(bird.obsDt, bird.longitude),
    howMany: bird.howMany,
    frequency: bird.frequency,
    reportCount: bird.reportCount,
    speciesCode: bird.speciesCode,
    isNotable: Boolean(bird.isNotable),
    imageUrl: bird.imageUrl,
    virtual: Boolean(bird.virtual),
    prismatic: Boolean(bird.prismatic),
    source: bird.source,
    rarity: bird.rarity,
    captureCount: captureCounts?.[speciesKey(bird.speciesCode, bird.comName, bird.sciName)] ?? captureCounts?.[speciesKey(bird.speciesCode, bird.comName)] ?? 0,
  })), [birds, captureCounts]);
  const data = useMemo<LeafletData>(() => ({
    center,
    userLocation,
    heading,
    firstPerson,
    safeArea,
    loading,
    weather,
    trainer,
    markers,
  }), [markers, center, firstPerson, heading, safeArea, userLocation, weather, trainer, loading]);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const postData = useCallback((latestData: LeafletData, forceMarkers = false) => {
    const includeMarkers = forceMarkers || latestData.markers !== postedMarkersRef.current;
    const payload: LeafletDataPayload = includeMarkers ? latestData : { ...latestData, markers: undefined };
    webViewRef.current?.injectJavaScript(`window.postMessage(${JSON.stringify(JSON.stringify(payload))}, '*'); true;`);
    if (includeMarkers) postedMarkersRef.current = latestData.markers;
  }, []);
  useEffect(() => { postData(data); }, [data, postData]);
  useEffect(() => {
    if (!recenterRequest || recenterRequest === lastRecenterRef.current) return;
    lastRecenterRef.current = recenterRequest;
    const latestData = dataRef.current;
    if (latestData) {
      postData({ ...latestData, command: "recenter" });
    }
  }, [recenterRequest]);
  useEffect(() => {
    if (firstPerson === lastFirstPersonRef.current) return;
    lastFirstPersonRef.current = firstPerson;
    const latestData = dataRef.current;
    if (latestData) {
      postData({ ...latestData, command: "setView", firstPerson });
    }
  }, [firstPerson]);
  useEffect(() => {
    if (!overviewRequest || overviewRequest === lastOverviewRef.current) return;
    lastOverviewRef.current = overviewRequest;
    const latestData = dataRef.current;
    if (latestData) {
      postData({ ...latestData, command: "overview" });
    }
  }, [overviewRequest]);
  useEffect(() => {
    if (!nearestRequest || nearestRequest === lastNearestRef.current) return;
    lastNearestRef.current = nearestRequest;
    const latestData = dataRef.current;
    if (latestData) {
      postData({ ...latestData, command: "nearest" });
    }
  }, [nearestRequest]);
  useEffect(() => {
    if (!trackRequest) return;
    const latestData = dataRef.current;
    if (latestData) {
      postData({ ...latestData, command: "track", trackTarget: trackRequest });
    }
  }, [trackRequest]);

  const handleMessage = (event: WebViewMessageEvent) => {
    let message: LeafletMessage;
    try {
      message = JSON.parse(event.nativeEvent.data) as LeafletMessage;
    } catch {
      return;
    }
    if (message.type === "capture" && message.id) {
      const bird = markerLookup.get(message.id);
      if (bird) onCapture(bird);
    } else if (message.type === "directions" && typeof message.latitude === "number" && typeof message.longitude === "number" && message.name) {
      onDirections({ latitude: message.latitude, longitude: message.longitude, name: message.name, id: message.id });
    } else if (message.type === "about" && message.speciesCode && message.comName) {
      onAbout({ speciesCode: message.speciesCode, comName: message.comName, sciName: message.sciName });
    } else if (message.type === "popup") {
      onPopupChange?.(Boolean(message.open));
    } else if (message.type === "toast") {
      onToastChange?.(Boolean(message.open));
    } else if (message.type === "nearbyState" && (message.state === "peek" || message.state === "half")) {
      onNearbyStateChange?.(message.state, message.height);
    } else if (message.type === "follow") {
      onFollowChange?.(Boolean(message.paused));
    } else if (message.type === "tracking") {
      onTrackingChange?.(
        Boolean(message.open),
        message.open && typeof message.latitude === "number" && typeof message.longitude === "number" && message.name
          ? { latitude: message.latitude, longitude: message.longitude, name: message.name, id: message.id, speciesCode: message.speciesCode }
          : undefined,
      );
    } else if (message.type === "regionChange" && typeof message.latitude === "number" && typeof message.longitude === "number") {
      onRegionChange({ latitude: message.latitude, longitude: message.longitude });
    }
  };

  useEffect(() => {
    if (!stopTrackRequest) return;
    const latestData = dataRef.current;
    if (latestData) {
      postData({ ...latestData, command: "stopTrack" });
    }
  }, [stopTrackRequest]);
  useEffect(() => {
    if (!closePopupRequest) return;
    const latestData = dataRef.current;
    if (latestData) {
      postData({ ...latestData, command: "closePopup" });
    }
  }, [closePopupRequest]);

  const html = useMemo(() => (mode === "adventure" ? buildMapLibreHtml({ apiBaseUrl: API_BASE_URL }) : buildLeafletHtml({ apiBaseUrl: API_BASE_URL })), [mode]);
  return <WebView key={mode} ref={webViewRef} style={styles.map} source={{ html }} onLoadEnd={() => postData(dataRef.current ?? data, true)} onMessage={handleMessage} originWhitelist={["*"]} />;
});

const styles = StyleSheet.create({ map: { flex: 1 } });
