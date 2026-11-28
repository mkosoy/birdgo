export interface HuntWeather {
  temperatureC: number;
  precipitationMm: number;
  weatherCode: number;
  condition: string;
  windSpeedKph: number;
  isDay: boolean;
  observedAt?: string;
}

interface OpenMeteoCurrent {
  temperature_2m?: number;
  precipitation?: number;
  weather_code?: number;
  wind_speed_10m?: number;
  is_day?: number;
  time?: string;
}

const WEATHER_CACHE_TTL_MS = 10 * 60 * 1000;
const WEATHER_CACHE_MAX_ENTRIES = 200;
const weatherCache = new Map<string, { expiresAt: number; weather: HuntWeather }>();

function conditionLabel(code: number): string {
  if (code === 0) return "clear";
  if (code === 1) return "mostly clear";
  if (code === 2) return "partly cloudy";
  if (code === 3) return "overcast";
  if (code === 45 || code === 48) return "fog";
  if (code === 56 || code === 57) return "freezing drizzle";
  if (code >= 51 && code <= 55) return "drizzle";
  if (code === 66) return "light freezing rain";
  if (code === 67) return "heavy freezing rain";
  if (code >= 61 && code <= 65) return code === 65 ? "heavy rain" : "rain";
  if (code >= 71 && code <= 77) return "snow";
  if (code >= 80 && code <= 82) return "rain showers";
  if (code === 85 || code === 86) return "snow showers";
  if (code === 95) return "thunderstorm";
  if (code === 96 || code === 99) return "thunderstorm with hail";
  return "weather unknown";
}

function cacheKey(latitude: number, longitude: number): string {
  return `${latitude.toFixed(4)}:${longitude.toFixed(4)}`;
}

export async function fetchHuntWeather(latitude: number, longitude: number): Promise<HuntWeather> {
  const key = cacheKey(latitude, longitude);
  const cached = weatherCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.weather;
  const params = new URLSearchParams({
    latitude: latitude.toFixed(4),
    longitude: longitude.toFixed(4),
    current: "temperature_2m,precipitation,weather_code,wind_speed_10m,is_day",
    timezone: "auto",
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Open-Meteo failed with status ${response.status}`);
    const payload = (await response.json()) as { current?: OpenMeteoCurrent };
    const current = payload.current;
    if (!current || typeof current.temperature_2m !== "number" || typeof current.weather_code !== "number") {
      throw new Error("Open-Meteo returned incomplete current weather");
    }
    const weather: HuntWeather = {
      temperatureC: current.temperature_2m,
      precipitationMm: typeof current.precipitation === "number" ? current.precipitation : 0,
      weatherCode: current.weather_code,
      condition: conditionLabel(current.weather_code),
      windSpeedKph: typeof current.wind_speed_10m === "number" ? current.wind_speed_10m : 0,
      isDay: current.is_day !== 0,
      observedAt: current.time,
    };
    const now = Date.now();
    for (const [entryKey, entry] of weatherCache) {
      if (entry.expiresAt <= now) weatherCache.delete(entryKey);
    }
    if (!weatherCache.has(key) && weatherCache.size >= WEATHER_CACHE_MAX_ENTRIES) {
      const oldest = weatherCache.keys().next().value;
      if (oldest) weatherCache.delete(oldest);
    }
    weatherCache.set(key, { weather, expiresAt: now + WEATHER_CACHE_TTL_MS });
    return weather;
  } finally {
    clearTimeout(timeout);
  }
}
