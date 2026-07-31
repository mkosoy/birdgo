import { useEffect, useMemo, useRef } from "react";
import type { EbirdObservation, Coordinates } from "../types";
import { buildLeafletHtml } from "./leafletHtml";
import type { BirdMapProps } from "./BirdMap";

interface LeafletMessage {
  type: "markerPress" | "regionChange";
  id?: string;
  latitude?: number;
  longitude?: number;
}

function markerId(bird: EbirdObservation): string {
  return `${bird.speciesCode}:${bird.locId ?? `${bird.latitude}:${bird.longitude}`}`;
}

function relativeTime(date?: string): string {
  if (!date) return "recently";
  const hours = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 3600000));
  return hours < 1 ? "now" : hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

export function BirdMap({ center, userLocation, birds, onMarkerPress, onRegionChange }: BirdMapProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const markerLookup = useMemo(() => new Map(birds.map((bird) => [markerId(bird), bird])), [birds]);
  const data = useMemo(() => ({
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

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      let message: LeafletMessage;
      try {
        message = typeof event.data === "string" ? JSON.parse(event.data) as LeafletMessage : event.data as LeafletMessage;
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
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [markerLookup, onMarkerPress, onRegionChange]);

  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify(data), "*");
  }, [data]);

  return <iframe ref={iframeRef} srcDoc={buildLeafletHtml()} onLoad={() => iframeRef.current?.contentWindow?.postMessage(JSON.stringify(data), "*")} style={{ border: 0, width: "100%", height: "100%" }} title="BirdGo map" />;
}
