import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { RouteProfile } from "./route";
import { loadRoutePlan } from "./plan-server";
import { RIDE_DATES, planAll, type DayResult } from "./plan";
import { getSetting, setSetting } from "./settings";
import { londonDate, minutesSince, nowIso } from "./time";
import {
  buildDay,
  inForecastRange,
  pointKey,
  samplePoints,
  segmentsFor,
  type Climatology,
  type ForecastCache,
  type Hour,
  type PointForecast,
  type RideWeather,
} from "./weather";

// The weather page's data. The forecast comes from Open-Meteo (free, no key,
// a blend of ECMWF, the Met Office and DWD models) for every 10-mile point on
// both days, kept in settings for half an hour so the crew don't hammer the
// API. Beyond the forecast's 16-day range the typical day comes from
// content/weather/climatology.json (ERA5 averages of the last ten mid-Novembers,
// written by `npm run weather:climatology`) or, until that exists, from
// long-term regional averages built into src/lib/weather.ts.

const CACHE_MINUTES = 30;
// Both overridable for a dry run (see README → Weather): point the URL at a mock
// server and pretend it is a date inside the forecast window.
const FORECAST_URL = process.env.OPEN_METEO_FORECAST_URL || "https://api.open-meteo.com/v1/forecast";
const TODAY_OVERRIDE = process.env.WEATHER_TODAY || "";
const MODEL = "best_match";
const HOURLY = ["temperature_2m", "apparent_temperature", "precipitation_probability", "precipitation", "weather_code", "cloud_cover", "wind_speed_10m", "wind_direction_10m", "wind_gusts_10m"];

type OpenMeteoHourly = {
  time: string[];
  temperature_2m?: (number | null)[];
  apparent_temperature?: (number | null)[];
  precipitation_probability?: (number | null)[];
  precipitation?: (number | null)[];
  weather_code?: (number | null)[];
  cloud_cover?: (number | null)[];
  wind_speed_10m?: (number | null)[];
  wind_direction_10m?: (number | null)[];
  wind_gusts_10m?: (number | null)[];
};
type OpenMeteoResult = { latitude: number; longitude: number; hourly?: OpenMeteoHourly; error?: boolean; reason?: string };

/** Open-Meteo's hourly rows for every point, for the dates asked. */
export async function fetchForecast(points: { lat: number; lon: number }[], dates: string[]): Promise<ForecastCache> {
  if (!points.length || !dates.length) throw new Error("nothing to fetch");
  const sorted = [...dates].sort();
  const q = new URLSearchParams({
    latitude: points.map((p) => p.lat.toFixed(4)).join(","),
    longitude: points.map((p) => p.lon.toFixed(4)).join(","),
    hourly: HOURLY.join(","),
    wind_speed_unit: "mph",
    timezone: "Europe/London",
    start_date: sorted[0],
    end_date: sorted[sorted.length - 1],
    models: MODEL,
  });
  const res = await fetch(`${FORECAST_URL}?${q}`, { cache: "no-store", signal: AbortSignal.timeout(15000), headers: { accept: "application/json" } });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Open-Meteo answered ${res.status} with something that isn't JSON`);
  }
  if (!res.ok) {
    const r = (json as { reason?: string })?.reason;
    throw new Error(`Open-Meteo ${res.status}${r ? `: ${r}` : ""}`);
  }
  const arr: OpenMeteoResult[] = Array.isArray(json) ? (json as OpenMeteoResult[]) : [json as OpenMeteoResult];
  if (arr.length !== points.length) throw new Error(`Open-Meteo returned ${arr.length} locations for ${points.length} asked`);
  const out: PointForecast[] = arr.map((r, i) => ({ lat: points[i].lat, lon: points[i].lon, days: hoursByDate(r.hourly) }));
  return { fetchedAt: nowIso(), dates: sorted, model: MODEL, points: out };
}

/** Group Open-Meteo's flat hourly arrays into 24-hour days. */
function hoursByDate(h: OpenMeteoHourly | undefined): Record<string, Hour[]> {
  const out: Record<string, Hour[]> = {};
  if (!h || !Array.isArray(h.time)) return out;
  const num = (arr: (number | null)[] | undefined, i: number, d: number) => {
    const v = arr?.[i];
    return typeof v === "number" && Number.isFinite(v) ? v : d;
  };
  const opt = (arr: (number | null)[] | undefined, i: number) => {
    const v = arr?.[i];
    return typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null;
  };
  for (let i = 0; i < h.time.length; i++) {
    const t = h.time[i];
    const date = t.slice(0, 10);
    const hr = Number(t.slice(11, 13));
    if (!out[date]) out[date] = [];
    const temp = num(h.temperature_2m, i, NaN);
    const ws = num(h.wind_speed_10m, i, 0);
    out[date][hr] = {
      t: round1(Number.isNaN(temp) ? 7 : temp),
      feels: round1(num(h.apparent_temperature, i, Number.isNaN(temp) ? 5 : temp)),
      pp: opt(h.precipitation_probability, i),
      mm: round1(num(h.precipitation, i, 0)),
      code: Math.round(num(h.weather_code, i, 3)),
      cloud: opt(h.cloud_cover, i),
      ws: round1(ws),
      wd: Math.round(num(h.wind_direction_10m, i, 225)),
      gust: round1(num(h.wind_gusts_10m, i, ws * 1.6)),
    };
  }
  // A day with gaps (the end of a model's horizon) is filled from its neighbours.
  for (const date of Object.keys(out)) {
    const hs = out[date];
    for (let k = 0; k < 24; k++) if (!hs[k]) hs[k] = hs[k - 1] ?? hs.find(Boolean) ?? { t: 7, feels: 5, pp: null, mm: 0, code: 3, cloud: null, ws: 8, wd: 225, gust: 14 };
    hs.length = 24;
  }
  return out;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ---- the climatology file --------------------------------------------------------

export function climatologyPath(): string {
  return path.join(process.cwd(), "content", "weather", "climatology.json");
}

let climCache: { mtime: number; clim: Climatology } | null = null;

export function loadClimatology(): Climatology | null {
  const p = climatologyPath();
  if (!fs.existsSync(p)) return null;
  const mtime = fs.statSync(p).mtimeMs;
  if (climCache && climCache.mtime === mtime) return climCache.clim;
  try {
    const clim = JSON.parse(fs.readFileSync(p, "utf8")) as Climatology;
    if (!Array.isArray(clim.points)) return null;
    climCache = { mtime, clim };
    return clim;
  } catch {
    return null;
  }
}

// ---- the cached forecast -----------------------------------------------------------

async function loadCache(): Promise<ForecastCache | null> {
  const raw = await getSetting("weather.forecast");
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as ForecastCache;
    return j && Array.isArray(j.points) && Array.isArray(j.dates) && typeof j.fetchedAt === "string" ? j : null;
  } catch {
    return null;
  }
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");
}

export type RideWeatherPage = { weather: RideWeather; profiles: RouteProfile[]; results: DayResult[] };

/** Everything the weather page shows. `force` ignores the half-hour cache. */
export async function getRideWeather(force = false): Promise<RideWeatherPage> {
  const { profiles, initial } = await loadRoutePlan();
  const results = planAll(initial, profiles);
  const today = /^\d{4}-\d{2}-\d{2}$/.test(TODAY_OVERRIDE) ? TODAY_OVERRIDE : londonDate();
  const points = samplePoints(profiles.flatMap(segmentsFor));
  const dates = [1, 2].map((d) => RIDE_DATES[d]).filter((d) => inForecastRange(today, d));

  let cache = await loadCache();
  let error: string | null = null;
  let stale = false;
  if (dates.length) {
    const matches = !!cache && sameSet(cache.dates, dates) && sameSet(cache.points.map((p) => pointKey(p.lat, p.lon)), points.map((p) => pointKey(p.lat, p.lon)));
    const fresh = !!cache && minutesSince(cache.fetchedAt) < CACHE_MINUTES;
    if (force || !matches || !fresh) {
      try {
        cache = await fetchForecast(points, dates);
        await setSetting("weather.forecast", JSON.stringify(cache));
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        if (!matches) cache = null; // an old cache for other points or dates is no use
        else stale = true;
      }
    }
  } else {
    cache = null;
  }

  const climatology = loadClimatology();
  const days = profiles.map((p) => buildDay({ profile: p, result: results.find((r) => r.day === p.day)!, today, forecast: cache, climatology, forecastError: error }));
  const weather: RideWeather = {
    generatedAt: nowIso(),
    today,
    climatology: climatology
      ? { source: climatology.source, note: `${climatology.window} averaged over ${climatology.years[0]}–${climatology.years[climatology.years.length - 1]}` }
      : { source: "regional long-term averages", note: "mid-November normals for the Midlands and Yorkshire, adjusted for height — the ERA5 file hasn't been generated yet" },
    forecast: { fetchedAt: cache?.fetchedAt ?? null, model: cache?.model ?? null, stale, error },
    days,
  };
  return { weather, profiles, results };
}
