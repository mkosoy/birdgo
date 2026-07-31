import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { StyleSheet } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { buildLeafletHtml } from "./leafletHtml";
import type { Coordinates, EbirdObservation } from "../types";

export interface BirdMapProps {
  center: Coordinates;
  userLocation?: Coordinates;
  birds: EbirdObservation[];
  onMarkerPress: (bird: EbirdObservation) => void;
  onRegionChange: (coordinates: Coordinates) => void;
}

interface LeafletMarker {
  id: string;
  latitude: number;
  longitude: number;
  comName: string;
  relativeTime: string;
  isNotable: boolean;
}

interface LeafletData {
  center: Coordinates;
  userLocation?: Coordinates;
  markers: LeafletMarker[];
}

interface LeafletMessage {
  type: "markerPress" | "regionChange";
  id?: string;
  comName?: string;
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
  { center, userLocation, birds, onMarkerPress, onRegionChange },
  forwardedRef,
) {
  const webViewRef = useRef<WebView>(null);
  useImperativeHandle(forwardedRef, () => webViewRef.current as WebView);
  const markerLookup = useMemo(() => new Map(birds.map((bird) => [markerId(bird), bird])), [birds]);
  const data = useMemo<LeafletData>(() => ({
    center,
    userLocation,
    markers: birds.map((bird) => ({
      id: markerId(bird),
      latitude: bird.latitude,
      longitude: bird.longitude,
      comName: bird.comName ?? "Bird",
      relativeTime: relativeTime(bird.obsDt),
      isNotable: Boolean(bird.isNotable),
    })),
  }), [birds, center, userLocation]);

  const pushData = useCallback(() => {
    webViewRef.current?.injectJavaScript(`window.postMessage(${JSON.stringify(JSON.stringify(data))}, '*'); true;`);
  }, [data]);

  useEffect(() => { pushData(); }, [pushData]);

  const handleMessage = (event: WebViewMessageEvent) => {
    let message: LeafletMessage;
    try {
      message = JSON.parse(event.nativeEvent.data) as LeafletMessage;
    } catch {
      return;
    }
    if (message.type === "markerPress" && message.id) {
      const bird = markerLookup.get(message.id);
      if (bird) onMarkerPress(bird);
    } else if (message.type === "regionChange" && typeof message.latitude === "number" && typeof message.longitude === "number") {
      onRegionChange({ latitude: message.latitude, longitude: message.longitude });
    }
  };

  return <WebView ref={webViewRef} style={styles.map} source={{ html: buildLeafletHtml() }} onLoadEnd={pushData} onMessage={handleMessage} originWhitelist={["*"]} />;
});

const styles = StyleSheet.create({ map: { flex: 1 } });
