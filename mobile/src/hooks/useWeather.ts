import { useEffect, useState } from "react";
import type { Coordinates, WeatherAtmosphere, WeatherCondition } from "../types";

function conditionForCode(code?: number): WeatherCondition {
  if (code == null) return "clear";
  if ([95, 96, 99].includes(code)) return "storm";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "rain";
  if ([45, 48].includes(code)) return "fog";
  if ([1, 2, 3].includes(code)) return "cloudy";
  return "clear";
}

export function useWeather(location: Coordinates): WeatherAtmosphere | undefined {
  const [weather, setWeather] = useState<WeatherAtmosphere>();
  const areaKey = `${location.latitude.toFixed(2)}:${location.longitude.toFixed(2)}`;

  useEffect(() => {
    let active = true;
    const [latitude, longitude] = areaKey.split(":");
    const load = () => {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`;
      fetch(url)
        .then((response) => response.ok ? response.json() : Promise.reject(new Error("weather unavailable")))
        .then((data) => {
          if (!active) return;
          const current = data?.current_weather;
          setWeather({
            condition: conditionForCode(current?.weathercode),
            temperatureC: typeof current?.temperature === "number" ? current.temperature : undefined,
            isDay: typeof current?.is_day === "number" ? current.is_day === 1 : undefined,
          });
        })
        .catch(() => { if (active) setWeather(undefined); });
    };
    load();
    const interval = setInterval(load, 10 * 60 * 1000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [areaKey]);

  return weather;
}
