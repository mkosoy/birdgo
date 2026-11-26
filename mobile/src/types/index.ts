export type TrainerAccessory = "none" | "cap" | "visor" | "hood";

export interface TrainerProfile {
  name: string;
  avatarColor: string;
  accentColor: string;
  accessory: TrainerAccessory;
}

export type WeatherCondition = "clear" | "cloudy" | "rain" | "snow" | "fog" | "storm";

export interface WeatherAtmosphere {
  condition: WeatherCondition;
  temperatureC?: number;
  isDay?: boolean;
}

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
  virtual?: boolean;
  frequency?: number;
  reportCount?: number;
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
  encounterId?: string;
  virtual?: boolean;
  frequency?: number;
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

export interface SkyfriendRecord {
  id: string;
  encounterId?: string;
  speciesCode?: string;
  commonName: string;
  sciName?: string | null;
  canonicalKey?: string;
  timestamp: string;
  location: Coordinates;
  rarity?: BirdRarity;
  imageUrl?: string;
}

export interface CanonicalSpeciesResult {
  speciesCode?: string;
  comName?: string;
  commonName?: string;
  sciName?: string | null;
  canonicalKey?: string;
  canonicalSciName?: string;
}
