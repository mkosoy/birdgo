export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface EbirdObservation extends Coordinates {
  speciesCode: string;
  comName?: string;
  sciName?: string;
  canonicalKey?: string;
  locId?: string;
  locName?: string;
  obsDt?: string;
  howMany?: number;
  isNotable?: boolean;
  imageUrl?: string;
  source?: string;
}

export type BirdRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

export interface SeenSpecies {
  speciesCode: string;
  comName: string;
  sciName?: string;
  canonicalKey?: string;
  location?: Coordinates;
  isNotable?: boolean;
  imageUrl?: string;
}

export interface TaxonomyEntry {
  speciesCode: string;
  comName: string;
  sciName: string;
}

export interface CaptureRecord {
  id: string;
  speciesCode?: string;
  commonName: string;
  sciName?: string | null;
  canonicalKey?: string;
  photoUri: string;
  timestamp: string;
  location: Coordinates;
  rarity?: BirdRarity;
  verified?: boolean;
  xpAwarded?: number;
}

export interface IdentificationResult {
  isBird: boolean;
  commonName: string | null;
  sciName: string | null;
  canonicalKey?: string;
  canonicalSciName?: string;
  confidence: number;
  provider: string;
}

export interface CanonicalSpeciesResult {
  speciesCode?: string;
  comName?: string;
  commonName?: string;
  sciName?: string | null;
  canonicalKey?: string;
  canonicalSciName?: string;
}
