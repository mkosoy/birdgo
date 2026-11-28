import { useCallback, useEffect, useMemo, useRef } from "react";
import type { EbirdObservation, Coordinates, TrainerProfile, WeatherAtmosphere } from "../types";
import { buildLeafletHtml } from "./leafletHtml";
import { buildMapLibreHtml } from "./mapLibreHtml";
import type { BirdMapProps, LeafletData, LeafletDataPayload, LeafletMarker } from "./BirdMap";
import { speciesKey } from "../utils/progression";
import { observationTimeMs } from "../utils/observationTime";
import { API_BASE_URL } from "../config";

interface LeafletMessage {
  type: "capture" | "directions" | "about" | "regionChange" | "popup" | "toast" | "nearbyState" | "follow" | "tracking" | "hotspotArrived";
  open?: boolean;
  paused?: boolean;
  state?: "peek" | "half";
  height?: number;
  id?: string;
  speciesCode?: string;
  kind?: "hotspot" | "rare";
  comName?: string;
  sciName?: string;
  name?: string;
  latitude?: number;
  longitude?: number;
  imageUrl?: string;
}

function markerId(bird: EbirdObservation): string {
  return `${bird.speciesCode}:${bird.locId ?? `${bird.latitude}:${bird.longitude}`}`;
}

function relativeTime(date?: string, longitude?: number, latitude?: number): string {
  if (!date) return "recently";
  const observedAt = observationTimeMs(date, longitude, latitude);
  if (observedAt == null) return "recently";
  const hours = Math.max(0, Math.floor((Date.now() - observedAt) / 3600000));
  return hours < 1 ? "now" : hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

export function BirdMap({ center, userLocation, birds, captureCounts, mode, firstPerson, heading, weather, trainer, recenterRequest, overviewRequest, nearestRequest, trackRequest, stopTrackRequest, closePopupRequest, safeArea, loading, onCapture, onDirections, onAbout, onPopupChange, onToastChange, onNearbyStateChange, onFollowChange, onTrackingChange, onHotspotArrived, onRegionChange }: BirdMapProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const lastRecenterRef = useRef(0);
  const lastFirstPersonRef = useRef(firstPerson);
  const lastOverviewRef = useRef(0);
  const lastNearestRef = useRef(0);
  const markerLookup = useMemo(() => new Map(birds.map((bird) => [markerId(bird), bird])), [birds]);
  const postedMarkersRef = useRef<LeafletMarker[] | null>(null);
  const markers = useMemo<LeafletMarker[]>(() => birds.map((bird) => ({
    id: markerId(bird),
    latitude: bird.latitude,
    longitude: bird.longitude,
    comName: bird.comName ?? "Bird",
    sciName: bird.sciName,
    locName: bird.locName,
    obsDt: bird.obsDt,
    relativeTime: relativeTime(bird.obsDt, bird.longitude, bird.latitude),
    howMany: bird.howMany,
    frequency: bird.frequency,
    reportCount: bird.reportCount,
    speciesCode: bird.speciesCode,
    isNotable: Boolean(bird.isNotable),
    imageUrl: bird.imageUrl,
    audioUrl: bird.audioUrl,
    audioStartTime: bird.audioStartTime,
    audioEndTime: bird.audioEndTime,
    virtual: Boolean(bird.virtual),
    prismatic: Boolean(bird.prismatic),
    source: bird.source,
    obsValid: bird.obsValid,
    rarity: bird.rarity,
    captureCount: captureCounts?.[speciesKey(bird.speciesCode, bird.comName, bird.sciName)] ?? captureCounts?.[speciesKey(bird.speciesCode, bird.comName)] ?? 0,
  })), [birds, captureCounts]);
  const data = useMemo<LeafletData>(() => ({
    center,
    loading,
    weather,
    trainer,
    userLocation,
    heading,
    firstPerson,
    safeArea,
    markers,
  }), [markers, center, firstPerson, heading, safeArea, userLocation, weather, trainer, loading]);
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
        const fallbackRareBird = message.kind === "rare" && message.speciesCode && message.comName && typeof message.latitude === "number" && typeof message.longitude === "number"
          ? {
              latitude: message.latitude,
              longitude: message.longitude,
              comName: message.comName,
              sciName: message.sciName,
              speciesCode: message.speciesCode,
              isNotable: true,
              imageUrl: message.imageUrl,
            }
          : undefined;
        const bird = markerLookup.get(message.id) ?? fallbackRareBird;
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
          ? { latitude: message.latitude, longitude: message.longitude, name: message.name, id: message.id, speciesCode: message.speciesCode, kind: message.kind }
          : undefined,
      );
    } else if (message.type === "hotspotArrived") {
      onHotspotArrived?.({ id: message.id, name: message.name });
      } else if (message.type === "regionChange" && typeof message.latitude === "number" && typeof message.longitude === "number") {
        onRegionChange({ latitude: message.latitude, longitude: message.longitude });
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [markerLookup, onAbout, onCapture, onDirections, onNearbyStateChange, onPopupChange, onRegionChange, onToastChange, onFollowChange, onTrackingChange, onHotspotArrived]);

  const postData = useCallback((latestData: LeafletData, forceMarkers = false) => {
    const includeMarkers = forceMarkers || latestData.markers !== postedMarkersRef.current;
    const payload: LeafletDataPayload = includeMarkers ? latestData : { ...latestData, markers: undefined };
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify(payload), "*");
    if (includeMarkers) postedMarkersRef.current = latestData.markers;
  }, []);
  useEffect(() => {
    postData(data);
  }, [data, postData]);
  useEffect(() => {
    if (!recenterRequest || recenterRequest === lastRecenterRef.current) return;
    lastRecenterRef.current = recenterRequest;
    const latestData = dataRef.current;
    if (latestData) postData({ ...latestData, command: "recenter" });
  }, [recenterRequest]);
  useEffect(() => {
    if (firstPerson === lastFirstPersonRef.current) return;
    lastFirstPersonRef.current = firstPerson;
    const latestData = dataRef.current;
    if (latestData) postData({ ...latestData, command: "setView", firstPerson });
  }, [firstPerson]);
  useEffect(() => {
    if (!overviewRequest || overviewRequest === lastOverviewRef.current) return;
    lastOverviewRef.current = overviewRequest;
    const latestData = dataRef.current;
    if (latestData) postData({ ...latestData, command: "overview" });
  }, [overviewRequest]);
  useEffect(() => {
    if (!nearestRequest || nearestRequest === lastNearestRef.current) return;
    lastNearestRef.current = nearestRequest;
    const latestData = dataRef.current;
    if (latestData) postData({ ...latestData, command: "nearest" });
  }, [nearestRequest]);
  useEffect(() => {
    if (!trackRequest) return;
    const latestData = dataRef.current;
    if (latestData) postData({
      ...latestData,
      command: "track",
      trackTarget: trackRequest,
    });
  }, [trackRequest]);

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

  const html = useMemo(() => (mode === "adventure" ? buildMapLibreHtml({ apiBaseUrl: API_BASE_URL || window.location.origin }) : buildLeafletHtml({ apiBaseUrl: API_BASE_URL || window.location.origin })), [mode]);
  const blobUrl = useMemo(() => URL.createObjectURL(new Blob([html], { type: "text/html" })), [html]);
  useEffect(() => () => URL.revokeObjectURL(blobUrl), [blobUrl]);
  return <iframe ref={iframeRef} src={blobUrl} onLoad={() => postData(dataRef.current ?? data, true)} style={{ border: 0, width: "100%", height: "100%" }} title="BirdGo map" />;
}
