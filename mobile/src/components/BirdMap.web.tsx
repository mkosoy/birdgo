import { useEffect, useMemo, useRef } from "react";
import type { EbirdObservation, Coordinates } from "../types";
import { buildLeafletHtml } from "./leafletHtml";
import { buildMapLibreHtml } from "./mapLibreHtml";
import type { BirdMapProps } from "./BirdMap";

interface LeafletMessage {
  type: "capture" | "directions" | "about" | "regionChange";
  id?: string;
  speciesCode?: string;
  comName?: string;
  name?: string;
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

export function BirdMap({ center, userLocation, birds, mode, recenterRequest, onCapture, onDirections, onAbout, onRegionChange }: BirdMapProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const lastRecenterRef = useRef(0);
  const markerLookup = useMemo(() => new Map(birds.map((bird) => [markerId(bird), bird])), [birds]);
  const data = useMemo(() => ({
    center,
    userLocation,
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
    })),
  }), [birds, center, userLocation]);
  const dataRef = useRef<typeof data | null>(null);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      let message: LeafletMessage;
      try {
        message = typeof event.data === "string" ? JSON.parse(event.data) as LeafletMessage : event.data as LeafletMessage;
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
      } else if (message.type === "regionChange" && typeof message.latitude === "number" && typeof message.longitude === "number") {
        onRegionChange({ latitude: message.latitude, longitude: message.longitude });
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [markerLookup, onAbout, onCapture, onDirections, onRegionChange]);

  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify(data), "*");
  }, [data]);
  useEffect(() => {
    if (!recenterRequest || recenterRequest === lastRecenterRef.current) return;
    lastRecenterRef.current = recenterRequest;
    const latestData = dataRef.current;
    if (latestData) iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ ...latestData, command: "recenter" }), "*");
  }, [recenterRequest]);

  const html = mode === "adventure" ? buildMapLibreHtml() : buildLeafletHtml();
  const blobUrl = useMemo(() => URL.createObjectURL(new Blob([html], { type: "text/html" })), [html]);
  useEffect(() => () => URL.revokeObjectURL(blobUrl), [blobUrl]);
  return <iframe ref={iframeRef} src={blobUrl} onLoad={() => iframeRef.current?.contentWindow?.postMessage(JSON.stringify(data), "*")} style={{ border: 0, width: "100%", height: "100%" }} title="BirdGo map" />;
}
