import type { ObserverLocation } from "@/features/sky-lens/accuracy/SkyLensAccuracyTypes";
import { fetchWithTimeout } from "@/utils/network";

export interface WeatherSnapshot {
  cloudPercent: number;
  humidity: number;
  tempCelsius: number;
  description: string;
  source: "live" | "unavailable";
}

const FALLBACK: WeatherSnapshot = {
  cloudPercent: 30,
  humidity: 50,
  tempCelsius: 20,
  description: "weather data unavailable",
  source: "unavailable"
};

// Open-Meteo gives no text summary for "current", so derive one from cloud cover.
function describeClouds(cloudPercent: number): string {
  if (cloudPercent < 10) return "clear sky";
  if (cloudPercent < 40) return "partly cloudy";
  if (cloudPercent < 70) return "mostly cloudy";
  return "overcast";
}

// Current conditions for the Tonight score. Uses Open-Meteo — the same keyless,
// account-free provider already disclosed in the privacy policy — so the only data sent
// is approximate latitude/longitude. (Replaces the old OpenWeatherMap path, which would
// have transmitted coordinates to an undisclosed third party.)
export async function fetchCurrentWeather(
  location: ObserverLocation
): Promise<WeatherSnapshot> {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?` +
      `latitude=${location.latitudeDegrees}&longitude=${location.longitudeDegrees}` +
      `&current=temperature_2m,relative_humidity_2m,cloud_cover`;
    const response = await fetchWithTimeout(url);
    if (!response.ok) throw new Error(`Weather ${response.status}`);

    const data = (await response.json()) as {
      current?: { temperature_2m?: number; relative_humidity_2m?: number; cloud_cover?: number };
    };
    const c = data.current;
    if (!c) return FALLBACK;

    const cloudPercent = c.cloud_cover ?? 30;
    return {
      cloudPercent,
      humidity: c.relative_humidity_2m ?? 50,
      tempCelsius: c.temperature_2m ?? 20,
      description: describeClouds(cloudPercent),
      source: "live"
    };
  } catch {
    return FALLBACK;
  }
}
