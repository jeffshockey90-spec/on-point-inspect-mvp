// Weather via Open-Meteo (https://open-meteo.com) - free, no API key required.
// Used for: auto-filling a report's Temperature / Weather Conditions at the time
// of inspection, showing a forecast for upcoming scheduled jobs, and a simple
// current-conditions widget. Geocoding reuses lib/geocode (Google), so we only
// hit Open-Meteo with lat/long.

export type WeatherResult = {
  temperatureF: number | null;
  temperatureC: number | null;
  weatherCode: number | null;
  conditionText: string; // e.g. "Partly cloudy"
  conditionSimple: string; // Clear | Cloudy | Rain | Snow | Fog | Storm
  highF?: number | null;
  lowF?: number | null;
  source: "current" | "hourly" | "archive" | "daily";
};

// WMO weather interpretation codes -> human text.
const WMO_TEXT: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  56: "Freezing drizzle",
  57: "Heavy freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Heavy freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Light rain showers",
  81: "Rain showers",
  82: "Heavy rain showers",
  85: "Light snow showers",
  86: "Snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Thunderstorm with heavy hail",
};

export function weatherCodeText(code: number | null | undefined): string {
  if (code == null) return "Unknown";
  return WMO_TEXT[code] || "Unknown";
}

// Collapse the detailed WMO code into a short bucket. This is what we try to
// match against the report's "Weather Conditions" checklist options.
export function weatherCodeSimple(code: number | null | undefined): string {
  if (code == null) return "Clear";
  if (code === 0 || code === 1) return "Clear";
  if (code === 2 || code === 3) return "Cloudy";
  if (code >= 45 && code <= 48) return "Fog";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "Rain";
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return "Snow";
  if (code >= 95) return "Storm";
  return "Clear";
}

export function weatherEmoji(code: number | null | undefined): string {
  const simple = weatherCodeSimple(code);
  switch (simple) {
    case "Clear":
      return "☀️";
    case "Cloudy":
      return "☁️";
    case "Rain":
      return "🌧️";
    case "Snow":
      return "❄️";
    case "Fog":
      return "🌫️";
    case "Storm":
      return "⛈️";
    default:
      return "🌡️";
  }
}

function cToF(c: number | null | undefined): number | null {
  if (c == null || !Number.isFinite(c)) return null;
  return Math.round((c * 9) / 5 + 32);
}

function fToC(f: number | null | undefined): number | null {
  if (f == null || !Number.isFinite(f)) return null;
  return Math.round(((f - 32) * 5) / 9);
}

async function fetchJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch (error) {
    console.error("Open-Meteo fetch error:", error);
    return null;
  }
}

/**
 * Current conditions at a point.
 */
export async function getCurrentWeather(
  lat: number,
  lng: number,
): Promise<WeatherResult | null> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min` +
    `&temperature_unit=fahrenheit&timezone=auto&forecast_days=1`;

  const json = await fetchJson(url);
  const tempF = json?.current?.temperature_2m;
  const code = json?.current?.weather_code;
  if (tempF == null && code == null) return null;

  return {
    temperatureF: tempF == null ? null : Math.round(tempF),
    temperatureC: fToC(tempF),
    weatherCode: code ?? null,
    conditionText: weatherCodeText(code),
    conditionSimple: weatherCodeSimple(code),
    highF: json?.daily?.temperature_2m_max?.[0] != null ? Math.round(json.daily.temperature_2m_max[0]) : null,
    lowF: json?.daily?.temperature_2m_min?.[0] != null ? Math.round(json.daily.temperature_2m_min[0]) : null,
    source: "current",
  };
}

/**
 * Weather for a specific calendar date (and optional hour, 0-23) at a point.
 * Tries the forecast API first (covers ~past 92 days through +16 days future),
 * then falls back to the historical archive API for older dates.
 */
export async function getWeatherForDate(
  lat: number,
  lng: number,
  date: string,
  hour?: number | null,
): Promise<WeatherResult | null> {
  const targetHour = Number.isFinite(hour as number)
    ? Math.max(0, Math.min(23, Math.round(hour as number)))
    : 12;

  const pickFromHourly = (
    json: any,
    source: WeatherResult["source"],
  ): WeatherResult | null => {
    const times: string[] = json?.hourly?.time || [];
    const temps: number[] = json?.hourly?.temperature_2m || [];
    const codes: number[] = json?.hourly?.weather_code || [];
    if (!times.length) return null;

    // Find the entry matching the requested hour (times look like "2026-08-05T14:00").
    let idx = times.findIndex((t) => t.startsWith(`${date}T`) && Number(t.slice(11, 13)) === targetHour);
    if (idx === -1) idx = times.findIndex((t) => t.startsWith(`${date}T`));
    if (idx === -1) idx = 0;

    const tempF = temps[idx];
    const code = codes[idx];
    const dailyMax = json?.daily?.temperature_2m_max?.[0];
    const dailyMin = json?.daily?.temperature_2m_min?.[0];

    return {
      temperatureF: tempF == null ? null : Math.round(tempF),
      temperatureC: fToC(tempF),
      weatherCode: code ?? null,
      conditionText: weatherCodeText(code),
      conditionSimple: weatherCodeSimple(code),
      highF: dailyMax != null ? Math.round(dailyMax) : null,
      lowF: dailyMin != null ? Math.round(dailyMin) : null,
      source,
    };
  };

  const forecastUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&hourly=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min` +
    `&temperature_unit=fahrenheit&timezone=auto&start_date=${date}&end_date=${date}`;

  const forecast = await fetchJson(forecastUrl);
  const fromForecast = forecast ? pickFromHourly(forecast, "hourly") : null;
  if (fromForecast && fromForecast.temperatureF != null) return fromForecast;

  // Fall back to the historical archive for older dates.
  const archiveUrl =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}` +
    `&hourly=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min` +
    `&temperature_unit=fahrenheit&timezone=auto&start_date=${date}&end_date=${date}`;

  const archive = await fetchJson(archiveUrl);
  const fromArchive = archive ? pickFromHourly(archive, "archive") : null;
  return fromArchive || fromForecast;
}

/**
 * Daily forecast for a date range (used for upcoming scheduled jobs).
 */
export async function getDailyForecast(
  lat: number,
  lng: number,
  startDate: string,
  endDate: string,
): Promise<Array<{ date: string; highF: number | null; lowF: number | null; weatherCode: number | null; conditionText: string; conditionSimple: string; precipChance: number | null }>> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max` +
    `&temperature_unit=fahrenheit&timezone=auto&start_date=${startDate}&end_date=${endDate}`;

  const json = await fetchJson(url);
  const days: string[] = json?.daily?.time || [];
  if (!days.length) return [];

  return days.map((d: string, i: number) => {
    const code = json.daily.weather_code?.[i] ?? null;
    return {
      date: d,
      highF: json.daily.temperature_2m_max?.[i] != null ? Math.round(json.daily.temperature_2m_max[i]) : null,
      lowF: json.daily.temperature_2m_min?.[i] != null ? Math.round(json.daily.temperature_2m_min[i]) : null,
      weatherCode: code,
      conditionText: weatherCodeText(code),
      conditionSimple: weatherCodeSimple(code),
      precipChance: json.daily.precipitation_probability_max?.[i] ?? null,
    };
  });
}
