import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { StyleSheet } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { buildLeafletHtml } from "./leafletHtml";
import { buildMapLibreHtml } from "./mapLibreHtml";
import type { Coordinates, EbirdObservation } from "../types";

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
  mode: BirdMapMode;
  firstPerson: boolean;
  heading?: number;
  recenterRequest?: number;
  overviewRequest?: number;
  nearestRequest?: number;
  trackRequest?: Coordinates & { name: string };
  loading?: boolean;
  safeArea?: SafeAreaInsets;
  onCapture: (bird: EbirdObservation) => void;
  onDirections: (coordinates: Coordinates & { name: string }) => void;
  onAbout: (bird: { speciesCode: string; comName: string }) => void;
  onPopupChange?: (open: boolean) => void;
  onToastChange?: (open: boolean) => void;
  onNearbyStateChange?: (state: "peek" | "half", height?: number) => void;
  onFollowChange?: (paused: boolean) => void;
  onTrackingChange?: (active: boolean) => void;
  onRegionChange: (coordinates: Coordinates) => void;
}

interface LeafletMarker {
  id: string;
  latitude: number;
  longitude: number;
  comName: string;
  sciName?: string;
  locName?: string;
  relativeTime: string;
  howMany?: number;
  speciesCode: string;
  isNotable: boolean;
  imageUrl?: string;
}

interface LeafletData {
  center: Coordinates;
  userLocation?: Coordinates;
  loading?: boolean;
  heading?: number;
  markers: LeafletMarker[];
  command?: "recenter" | "setView" | "overview" | "nearest" | "track";
  trackTarget?: Coordinates & { name: string };
  firstPerson?: boolean;
  safeArea?: SafeAreaInsets;
}

interface LeafletMessage {
  type: "capture" | "directions" | "about" | "regionChange" | "popup" | "toast" | "nearbyState" | "follow" | "tracking";
  open?: boolean;
  paused?: boolean;
  state?: "peek" | "half";
  height?: number;
  id?: string;
  speciesCode?: string;
  comName?: string;
  name?: string;
  latitude?: number;
  longitude?: number;
}

function relativeTime(date?: string): string {
  if (!date) return "recently";
  const hours = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 3600000));
  return hours < 1 ? "now" : hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

function markerId(bird: EbirdObservation): string {
  return `${bird.speciesCode}:${bird.locId ?? `${bird.latitude}:${bird.longitude}`}`;
}

export const BirdMap = forwardRef<WebView, BirdMapProps>(function BirdMap(
  { center, userLocation, birds, mode, firstPerson, heading, recenterRequest, overviewRequest, nearestRequest, trackRequest, safeArea, loading, onCapture, onDirections, onAbout, onPopupChange, onToastChange, onNearbyStateChange, onFollowChange, onTrackingChange, onRegionChange },
  forwardedRef,
) {
  const webViewRef = useRef<WebView>(null);
  const lastRecenterRef = useRef(0);
  const lastFirstPersonRef = useRef(firstPerson);
  const lastOverviewRef = useRef(0);
  const lastNearestRef = useRef(0);
  const dataRef = useRef<LeafletData | null>(null);
  useImperativeHandle(forwardedRef, () => webViewRef.current as WebView);
  const markerLookup = useMemo(() => new Map(birds.map((bird) => [markerId(bird), bird])), [birds]);
  const data = useMemo<LeafletData>(() => ({
    center,
    userLocation,
    heading,
    firstPerson,
    safeArea,
    loading,
    markers: birds.map((bird) => ({
      id: markerId(bird),
      latitude: bird.latitude,
      longitude: bird.longitude,
      comName: bird.comName ?? "Bird",
      sciName: bird.sciName,
      locName: bird.locName,
      relativeTime: relativeTime(bird.obsDt),
      howMany: bird.howMany,
      speciesCode: bird.speciesCode,
      isNotable: Boolean(bird.isNotable),
      imageUrl: bird.imageUrl,
    })),
  }), [birds, center, firstPerson, heading, safeArea, userLocation]);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const pushData = useCallback(() => {
    webViewRef.current?.injectJavaScript(`window.postMessage(${JSON.stringify(JSON.stringify(data))}, '*'); true;`);
  }, [data]);
  useEffect(() => { pushData(); }, [pushData]);
  useEffect(() => {
    if (!recenterRequest || recenterRequest === lastRecenterRef.current) return;
    lastRecenterRef.current = recenterRequest;
    const latestData = dataRef.current;
    if (latestData) {
      webViewRef.current?.injectJavaScript(`window.postMessage(${JSON.stringify(JSON.stringify({ ...latestData, command: "recenter" }))}, '*'); true;`);
    }
  }, [recenterRequest]);
  useEffect(() => {
    if (firstPerson === lastFirstPersonRef.current) return;
    lastFirstPersonRef.current = firstPerson;
    const latestData = dataRef.current;
    if (latestData) {
      webViewRef.current?.injectJavaScript(`window.postMessage(${JSON.stringify(JSON.stringify({ ...latestData, command: "setView", firstPerson }))}, '*'); true;`);
    }
  }, [firstPerson]);
  useEffect(() => {
    if (!overviewRequest || overviewRequest === lastOverviewRef.current) return;
    lastOverviewRef.current = overviewRequest;
    const latestData = dataRef.current;
    if (latestData) {
      webViewRef.current?.injectJavaScript(`window.postMessage(${JSON.stringify(JSON.stringify({ ...latestData, command: "overview" }))}, '*'); true;`);
    }
  }, [overviewRequest]);
  useEffect(() => {
    if (!nearestRequest || nearestRequest === lastNearestRef.current) return;
    lastNearestRef.current = nearestRequest;
    const latestData = dataRef.current;
    if (latestData) {
      webViewRef.current?.injectJavaScript(`window.postMessage(${JSON.stringify(JSON.stringify({ ...latestData, command: "nearest" }))}, '*'); true;`);
    }
  }, [nearestRequest]);
  useEffect(() => {
    if (!trackRequest) return;
    const latestData = dataRef.current;
    if (latestData) {
      webViewRef.current?.injectJavaScript(`window.postMessage(${JSON.stringify(JSON.stringify({ ...latestData, command: "track", trackTarget: trackRequest }))}, '*'); true;`);
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
      onDirections({ latitude: message.latitude, longitude: message.longitude, name: message.name });
    } else if (message.type === "about" && message.speciesCode && message.comName) {
      onAbout({ speciesCode: message.speciesCode, comName: message.comName });
    } else if (message.type === "popup") {
      onPopupChange?.(Boolean(message.open));
    } else if (message.type === "toast") {
      onToastChange?.(Boolean(message.open));
    } else if (message.type === "nearbyState" && (message.state === "peek" || message.state === "half")) {
      onNearbyStateChange?.(message.state, message.height);
    } else if (message.type === "follow") {
      onFollowChange?.(Boolean(message.paused));
    } else if (message.type === "tracking") {
      onTrackingChange?.(Boolean(message.open));
    } else if (message.type === "regionChange" && typeof message.latitude === "number" && typeof message.longitude === "number") {
      onRegionChange({ latitude: message.latitude, longitude: message.longitude });
    }
  };

  const html = mode === "adventure" ? buildMapLibreHtml() : buildLeafletHtml();
  return <WebView key={mode} ref={webViewRef} style={styles.map} source={{ html }} onLoadEnd={pushData} onMessage={handleMessage} originWhitelist={["*"]} />;
});

const styles = StyleSheet.create({ map: { flex: 1 } });
