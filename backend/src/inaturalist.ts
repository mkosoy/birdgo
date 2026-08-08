import type { EbirdObservation } from "./ebird.js";

const INATURALIST_BASE_URL = "https://api.inaturalist.org/v1/observations";

interface InatPhoto {
  url?: string;
}

interface InatTaxon {
  id?: number;
  name?: string;
  preferred_common_name?: string;
  rank?: string;
}

interface InatObservation {
  geojson?: {
    coordinates?: unknown;
  };
  location?: string | null;
  taxon?: InatTaxon | null;
  place_guess?: string | null;
  time_observed_at?: string | null;
  observed_on?: string | null;
  photos?: InatPhoto[];
}

interface InatResponse {
  results?: InatObservation[];
}

function coordinatesFor(observation: InatObservation): { lat: number; lng: number } | null {
  const coordinates = observation.geojson?.coordinates;
  if (Array.isArray(coordinates) && coordinates.length >= 2) {
    const [lng, lat] = coordinates;
    if (typeof lat === "number" && Number.isFinite(lat) && typeof lng === "number" && Number.isFinite(lng)) {
      return { lat, lng };
    }
  }
  if (typeof observation.location === "string") {
    const [latText, lngText] = observation.location.split(",");
    const lat = Number(latText);
    const lng = Number(lngText);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  return null;
}

export async function fetchInatBirds(
  lat: number,
  lng: number,
  radiusKm: number,
): Promise<EbirdObservation[]> {
  const params = new URLSearchParams({
    taxon_id: "3",
    lat: String(lat),
    lng: String(lng),
    radius: String(radiusKm),
    order: "desc",
    order_by: "observed_on",
    per_page: "200",
    photos: "true",
    geo: "true",
    geoprivacy: "open",
  });
  params.append("rank", "species");
  params.append("rank", "subspecies");
  try {
    const response = await fetch(`${INATURALIST_BASE_URL}?${params.toString()}`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`iNaturalist request failed with status ${response.status}`);
    }
    const payload = (await response.json()) as InatResponse;
    if (!Array.isArray(payload.results)) throw new Error("iNaturalist response did not include results");
    return payload.results.flatMap((observation) => {
      const coordinates = coordinatesFor(observation);
      const taxon = observation.taxon;
      if (
        !coordinates
        || !taxon
        || typeof taxon.id !== "number"
        || !Number.isFinite(taxon.id)
        || !taxon.name
        || (taxon.rank !== "species" && taxon.rank !== "subspecies")
      ) {
        return [];
      }
      const rawImageUrl = observation.photos?.[0]?.url;
      const imageUrl = typeof rawImageUrl === "string" && rawImageUrl
        ? rawImageUrl.replace("square", "medium")
        : undefined;
      return [{
        lat: coordinates.lat,
        lng: coordinates.lng,
        speciesCode: `inat-${taxon.id}`,
        comName: taxon.preferred_common_name ?? taxon.name,
        sciName: taxon.name,
        locName: observation.place_guess ?? undefined,
        obsDt: observation.time_observed_at ?? observation.observed_on ?? undefined,
        ...(imageUrl ? { imageUrl } : {}),
        source: "inaturalist",
      }];
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    throw new Error(`Unable to fetch iNaturalist bird observations: ${message}`);
  }
}
