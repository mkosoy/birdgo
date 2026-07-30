const EBIRD_BASE_URL = "https://api.ebird.org/v2";

export interface EbirdObservation {
  speciesCode: string;
  comName?: string;
  sciName?: string;
  locId?: string;
  locName?: string;
  lat?: number;
  lng?: number;
  obsDt?: string;
  [key: string]: unknown;
}

export class EbirdError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "EbirdError";
  }
}

export async function ebirdGet<T>(
  path: string,
  token: string | undefined,
): Promise<T> {
  if (!token) {
    throw new EbirdError(503, "eBird API token is not configured");
  }
  const response = await fetch(`${EBIRD_BASE_URL}${path}`, {
    headers: { "X-eBirdApiToken": token, Accept: "application/json" },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new EbirdError(
      response.status,
      detail || `eBird request failed with status ${response.status}`,
    );
  }
  return (await response.json()) as T;
}

export function deduplicateObservations(
  observations: EbirdObservation[],
): EbirdObservation[] {
  const byKey = new Map<string, EbirdObservation>();
  for (const observation of observations) {
    const key = `${observation.speciesCode}:${observation.locId ?? ""}`;
    const existing = byKey.get(key);
    if (
      !existing ||
      new Date(observation.obsDt ?? 0).getTime() >
        new Date(existing.obsDt ?? 0).getTime()
    ) {
      byKey.set(key, observation);
    }
  }
  return [...byKey.values()];
}
