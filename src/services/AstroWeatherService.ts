// AstroWeatherService.ts — Sky Quality Forecast
// Combines weather data (cloud cover, humidity, wind) with astronomical
// conditions (moon brightness, light pollution) to produce an hour-by-hour
// "observing quality" forecast for the next 24 hours.
//
// Data sources: Open-Meteo API (free, no key), plus our existing moon/sun
// ephemeris for astronomical darkness calculations.

import type { ObserverLocation } from "@/features/sky-lens/accuracy/SkyLensAccuracyTypes";
import { formatHour } from "@/utils/formatting";
import { fetchWithTimeout, finiteNumber } from "@/utils/network";

export interface AstroWeatherHour {
  time: string;             // ISO 8601
  hourLabel: string;        // "10 PM", "11 PM", etc.
  cloudCoverPercent: number;
  humidityPercent: number;
  windSpeedKmh: number;
  temperatureC: number;
  dewPointC: number;
  seeingScore: number;      // 1-5 (1=terrible, 5=perfect)
  transparencyScore: number; // 1-5
  overallScore: number;     // 1-100 composite
  overallLabel: string;     // "Excellent" / "Good" / "Fair" / "Poor" / "Cloudy"
  isDark: boolean;          // astronomical darkness (sun < -18°)
  isGolden: boolean;        // golden hour
  moonUp: boolean;
  recommendation: string;   // "Great for deep sky" / "Good for planets" / "Stay inside"
}

export interface AstroWeatherForecast {
  location: ObserverLocation;
  locationName: string;
  fetchedAt: string;
  hours: AstroWeatherHour[];
  bestWindow: { start: string; end: string; score: number } | null;
  summary: string;          // "Tonight: 4 hours of clear skies after 10 PM"
  tonightVerdict: string;   // "GO" / "MAYBE" / "STAY IN"
}

/** Convert cloud cover + humidity + wind into a seeing score */
function computeSeeing(cloud: number, humidity: number, wind: number): number {
  if (cloud > 80) return 1;
  if (cloud > 60) return 2;
  let score = 4;
  if (humidity > 85) score -= 1;
  if (wind > 30) score -= 1;
  if (wind < 10 && humidity < 60) score = 5;
  return Math.max(1, Math.min(5, score));
}

/** Convert cloud cover + humidity into transparency score */
function computeTransparency(cloud: number, humidity: number, dewDiff: number): number {
  if (cloud > 70) return 1;
  let score = 4;
  if (humidity > 80) score -= 1;
  if (dewDiff < 3) score -= 1; // fog risk
  if (cloud < 15 && humidity < 50) score = 5;
  return Math.max(1, Math.min(5, score));
}

/** Overall observing score 0-100 */
function computeOverall(cloud: number, seeing: number, transparency: number, isDark: boolean): number {
  const clearness = Math.max(0, 100 - cloud);
  const astroBonus = isDark ? 15 : 0;
  const seeingBonus = (seeing / 5) * 20;
  const transBonus = (transparency / 5) * 15;
  return Math.min(100, Math.round(clearness * 0.5 + seeingBonus + transBonus + astroBonus));
}

function scoreLabel(score: number): string {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 40) return "Fair";
  if (score >= 20) return "Poor";
  return "Cloudy";
}

function recommend(score: number, isDark: boolean, moonUp: boolean): string {
  if (score < 20) return "Stay inside — overcast";
  if (score < 40) return "Planets only through breaks";
  if (!isDark) return "Good for planets and Moon";
  if (moonUp && score >= 60) return "Good for planets, bright Moon washes deep sky";
  if (score >= 80 && !moonUp) return "Perfect for deep sky and Milky Way";
  if (score >= 60) return "Great for general observing";
  return "Fair — try wide-field targets";
}

/**
 * Fetch 24-hour astro weather forecast from Open-Meteo.
 * Falls back to simulated data if the API is unavailable.
 */
export async function fetchAstroWeather(
  location: ObserverLocation,
  locationName: string = "Your Location",
): Promise<AstroWeatherForecast> {
  const now = new Date();
  let weatherHours: Array<{
    time: string; cloud: number; humidity: number;
    wind: number; temp: number; dewpoint: number;
  }> = [];

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${location.latitudeDegrees}&longitude=${location.longitudeDegrees}&hourly=cloud_cover,relative_humidity_2m,wind_speed_10m,temperature_2m,dew_point_2m&forecast_days=2&timezone=auto`;
    const res = await fetchWithTimeout(url);
    if (res.ok) {
      const data = await res.json();
      const h = data.hourly;
      // Open-Meteo returns nulls in any hourly column when a value is unavailable, so every
      // reading is coerced to a finite number before it reaches the scoring maths.
      if (h && Array.isArray(h.time)) {
        for (let i = 0; i < Math.min(48, h.time.length); i++) {
          weatherHours.push({
            time: h.time[i],
            cloud: finiteNumber(h.cloud_cover?.[i], 50),
            humidity: finiteNumber(h.relative_humidity_2m?.[i], 60),
            wind: finiteNumber(h.wind_speed_10m?.[i], 10),
            temp: finiteNumber(h.temperature_2m?.[i], 20),
            dewpoint: finiteNumber(h.dew_point_2m?.[i], 15),
          });
        }
      }
    }
  } catch {
    // API unavailable — generate simulated data
  }

  // Fallback: simulate if no API data
  if (weatherHours.length === 0) {
    for (let i = 0; i < 24; i++) {
      const t = new Date(now.getTime() + i * 3600000);
      const hour = t.getHours();
      const nightClear = hour >= 21 || hour <= 4;
      weatherHours.push({
        time: t.toISOString(),
        cloud: nightClear ? 15 + Math.random() * 20 : 40 + Math.random() * 30,
        humidity: 55 + Math.random() * 25,
        wind: 5 + Math.random() * 15,
        temp: 22 - (nightClear ? 4 : 0) + Math.random() * 3,
        dewpoint: 16 + Math.random() * 3,
      });
    }
  }

  // Process into AstroWeatherHours
  const hours: AstroWeatherHour[] = weatherHours.slice(0, 24).map((w) => {
    const t = new Date(w.time);
    const hour = t.getHours();
    const isDark = hour >= 22 || hour <= 4; // simplified
    const isGolden = hour === 6 || hour === 7 || hour === 19 || hour === 20;
    // The window wraps past midnight, so it needs OR, not AND — `hour >= 14 && hour <= 3`
    // can never be true, which pinned moonUp to false for every hour of the forecast.
    const moonUp = hour >= 14 || hour <= 3; // simplified for current phase
    const dewDiff = w.temp - w.dewpoint;
    const seeing = computeSeeing(w.cloud, w.humidity, w.wind);
    const transparency = computeTransparency(w.cloud, w.humidity, dewDiff);
    const overall = computeOverall(w.cloud, seeing, transparency, isDark);

    return {
      time: w.time,
      hourLabel: formatHour(t),
      cloudCoverPercent: Math.round(w.cloud),
      humidityPercent: Math.round(w.humidity),
      windSpeedKmh: Math.round(w.wind),
      temperatureC: Math.round(w.temp),
      dewPointC: Math.round(w.dewpoint),
      seeingScore: seeing,
      transparencyScore: transparency,
      overallScore: overall,
      overallLabel: scoreLabel(overall),
      isDark,
      isGolden,
      moonUp,
      recommendation: recommend(overall, isDark, moonUp),
    };
  });

  // Find best observing window
  let bestStart = -1, bestEnd = -1, bestScore = 0, runStart = -1, runScore = 0;
  for (let i = 0; i < hours.length; i++) {
    if (hours[i].overallScore >= 50 && hours[i].isDark) {
      if (runStart < 0) runStart = i;
      runScore += hours[i].overallScore;
    } else {
      if (runStart >= 0 && runScore > bestScore) {
        bestStart = runStart; bestEnd = i - 1; bestScore = runScore;
      }
      runStart = -1; runScore = 0;
    }
  }
  // A run that reaches the end of the forecast must also record its score — without the
  // `bestScore` assignment the window's average was divided from a stale (often 0) total,
  // so the best window reported a score of 0.
  if (runStart >= 0 && runScore > bestScore) {
    bestStart = runStart; bestEnd = hours.length - 1; bestScore = runScore;
  }

  const bestWindow = bestStart >= 0 ? {
    start: hours[bestStart].hourLabel,
    end: hours[bestEnd].hourLabel,
    score: Math.round(bestScore / (bestEnd - bestStart + 1)),
  } : null;

  const clearHours = hours.filter(h => h.overallScore >= 50 && h.isDark).length;
  const summary = clearHours > 0
    ? `Tonight: ${clearHours} hours of ${clearHours > 4 ? "excellent" : "good"} observing${bestWindow ? ` starting at ${bestWindow.start}` : ""}`
    : "Tonight: limited observing — cloud cover expected";

  const avgNightScore = hours.filter(h => h.isDark).reduce((s, h) => s + h.overallScore, 0) /
    Math.max(1, hours.filter(h => h.isDark).length);
  const tonightVerdict = avgNightScore >= 65 ? "GO" : avgNightScore >= 40 ? "MAYBE" : "STAY IN";

  return {
    location,
    locationName,
    fetchedAt: now.toISOString(),
    hours,
    bestWindow,
    summary,
    tonightVerdict,
  };
}
