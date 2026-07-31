export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface EbirdObservation extends Coordinates {
  speciesCode: string;
  comName?: string;
  sciName?: string;
  locId?: string;
  locName?: string;
  obsDt?: string;
  howMany?: number;
  isNotable?: boolean;
  imageUrl?: string;
  source?: string;
}

export interface SeenSpecies {
  speciesCode: string;
  comName: string;
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
  photoUri: string;
  timestamp: string;
  location: Coordinates;
}

export interface IdentificationResult {
  isBird: boolean;
  commonName: string | null;
  sciName: string | null;
  confidence: number;
  provider: string;
}
