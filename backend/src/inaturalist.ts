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

export interface BirdAbundance {
  scientificName: string;
  commonName?: string;
  count: number;
}

export async function fetchInatBirdAbundance(
  lat: number,
  lng: number,
  radiusKm: number,
  days = 90,
): Promise<BirdAbundance[]> {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const params = new URLSearchParams({
    taxon_id: "3",
    lat: String(lat),
    lng: String(lng),
    radius: String(radiusKm),
    per_page: "200",
    d1: startDate,
  });
  const results: Array<{ count?: number; taxon?: InatTaxon | null }> = [];
  for (let page = 1; page <= 3; page += 1) {
    params.set("page", String(page));
    const response = await fetch(`https://api.inaturalist.org/v1/observations/species_counts?${params.toString()}`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`iNaturalist abundance request failed with status ${response.status}`);
    const payload = (await response.json()) as { results?: Array<{ count?: number; taxon?: InatTaxon | null }> };
    if (!Array.isArray(payload.results)) throw new Error("iNaturalist abundance response did not include results");
    results.push(...payload.results);
    if (payload.results.length < 200) break;
  }
  return results.flatMap((result) => {
    const taxon = result.taxon;
    if (!taxon?.name || typeof result.count !== "number" || !Number.isFinite(result.count)) return [];
    return [{
      scientificName: taxon.name,
      ...(taxon.preferred_common_name ? { commonName: taxon.preferred_common_name } : {}),
      count: result.count,
    }];
  });
}

export async function fetchInatBirds(
  lat: number,
  lng: number,
  radiusKm: number,
  backDays = 14,
): Promise<EbirdObservation[]> {
  const cutoffTime = Date.now() - backDays * 24 * 60 * 60 * 1000;
  const cutoffDate = new Date(cutoffTime).toISOString().slice(0, 10);
  const startDate = new Date(cutoffTime - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
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
    d1: startDate,
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
      const observedAt = observation.time_observed_at ? Date.parse(observation.time_observed_at) : Number.NaN;
      if (Number.isFinite(observedAt) && observedAt < cutoffTime) return [];
      if (!Number.isFinite(observedAt) && (!observation.observed_on || observation.observed_on < cutoffDate)) return [];
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
