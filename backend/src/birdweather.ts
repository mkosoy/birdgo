import type { EbirdObservation } from "./ebird.js";

const BIRDWEATHER_GRAPHQL_URL = "https://app.birdweather.com/graphql";
const BIRDWEATHER_QUERY = `
query NearbyDetections($ne: InputLocation, $sw: InputLocation) {
  detections(
    first: 100
    period: { count: 24, unit: "hours" }
    ne: $ne
    sw: $sw
    classifications: ["avian"]
    confidenceGte: 0.8
    scoreGte: 7
    sortBy: "latest"
  ) {
    nodes {
      id
      timestamp
      confidence
      score
      coords { lat lon }
      species {
        id
        commonName
        scientificName
        ebirdCode
        imageUrl
      }
      station { id name }
    }
  }
}`;

interface BirdweatherDetection {
  id: string;
  timestamp?: string;
  confidence: number;
  score: number;
  coords?: { lat?: number; lon?: number };
  species?: {
    id?: string;
    commonName?: string;
    scientificName?: string;
    ebirdCode?: string;
    imageUrl?: string;
  };
  station?: { id?: string; name?: string };
}

function kmToLatDegrees(distanceKm: number): number {
  return distanceKm / 111;
}

function kmToLngDegrees(distanceKm: number, latitude: number): number {
  const width = 111 * Math.max(0.2, Math.cos(latitude * Math.PI / 180));
  return distanceKm / width;
}

export async function fetchBirdweatherDetections(latitude: number, longitude: number, distanceKm: number): Promise<EbirdObservation[]> {
  const latDelta = kmToLatDegrees(distanceKm);
  const lngDelta = kmToLngDegrees(distanceKm, latitude);
  const response = await fetch(BIRDWEATHER_GRAPHQL_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "BirdGo (https://birdgo.vercel.app)" },
    body: JSON.stringify({
      query: BIRDWEATHER_QUERY,
      variables: {
        ne: { lat: latitude + latDelta, lon: longitude + lngDelta },
        sw: { lat: latitude - latDelta, lon: longitude - lngDelta },
      },
    }),
  });
  if (!response.ok) throw new Error(`BirdWeather request failed with ${response.status}`);
  const body = await response.json() as { data?: { detections?: { nodes?: BirdweatherDetection[] } }; errors?: { message?: string }[] };
  if (body.errors?.length) throw new Error(body.errors[0]?.message ?? "BirdWeather query failed");
  const detections = body.data?.detections?.nodes ?? [];
  const latestBySpeciesStation = new Map<string, BirdweatherDetection>();
  for (const detection of detections) {
    const speciesKey = detection.species?.ebirdCode ?? detection.species?.scientificName ?? detection.species?.commonName;
    const stationKey = detection.station?.id ?? `${detection.coords?.lat}:${detection.coords?.lon}`;
    if (!speciesKey || !detection.timestamp) continue;
    const key = `${speciesKey}:${stationKey}`;
    const existing = latestBySpeciesStation.get(key);
    if (!existing || String(detection.timestamp) > String(existing.timestamp)) latestBySpeciesStation.set(key, detection);
  }
  return [...latestBySpeciesStation.values()]
    .sort((left, right) => String(right.timestamp).localeCompare(String(left.timestamp)))
    .slice(0, 30)
    .flatMap((detection) => {
      const lat = detection.coords?.lat;
      const lng = detection.coords?.lon;
      const species = detection.species;
      if (typeof lat !== "number" || typeof lng !== "number" || !species) return [];
      return [{
        speciesCode: species.ebirdCode ?? `bw-${species.id ?? species.scientificName ?? species.commonName ?? "unknown"}`,
        comName: species.commonName,
        sciName: species.scientificName,
        locId: detection.station?.id ? `birdweather-${detection.station.id}` : undefined,
        locName: detection.station?.name ? `BirdWeather audio station · ${detection.station.name}` : "BirdWeather audio station",
        obsDt: detection.timestamp,
        lat,
        lng,
        imageUrl: species.imageUrl,
        source: "birdweather",
      }];
    });
}
