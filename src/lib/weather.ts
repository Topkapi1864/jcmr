// Weather along the course. Pure TypeScript shared by the crew page (the
// cross-section and the table) and the server (fetching and caching).
//
// The route is cut into 10-mile segments. For each segment we know where it
// is, which way it points (so a wind can be called head, tail or cross) and,
// from the crew plan, when the riders pass through. Each segment then gets the
// hour of weather that matters: the forecast hour if the date is inside the
// 16-day forecast range, otherwise what mid-November is typically like there.

import type { ProfilePoint, RouteProfile } from "./route";
import type { DayResult } from "./plan";
import { RIDE_DATES, fmtHm, pointAtMile, timeAtMile } from "./plan";

export const SEGMENT_MI = 10;
/** Open-Meteo's forecast runs 16 days: today plus 15. */
export const FORECAST_DAYS_AHEAD = 15;

export type Segment = {
  day: number;
  i: number;
  fromMi: number;
  toMi: number;
  midMi: number;
  lat: number;
  lon: number;
  eleM: number;
  /** Compass bearing of travel across the segment, degrees (0 = north, 90 = east). */
  heading: number;
  /** 1 = dead straight, 0 = ends up where it started. */
  straight: number;
};

/** One hour of weather at one point. The same shape whether it is a forecast or a typical value. */
export type Hour = {
  /** Air temperature, °C. */
  t: number;
  /** Feels like, °C. */
  feels: number;
  /** Chance of rain in the hour, % (null when the model has none). */
  pp: number | null;
  /** Precipitation in the hour, mm. */
  mm: number;
  /** WMO weather code; -1 for a typical value (none). */
  code: number;
  /** Cloud cover, % (null when unknown). */
  cloud: number | null;
  /** Wind speed, mph. */
  ws: number;
  /** Wind *from* direction, degrees. */
  wd: number;
  /** Gusts, mph. */
  gust: number;
};

/** A point's forecast: 24 hours for each date fetched. */
export type PointForecast = { lat: number; lon: number; days: Record<string, Hour[]> };

/** A point's typical day: 24 hours of averages, plus the daily feel of the date. */
export type PointTypical = {
  lat: number;
  lon: number;
  hours: Hour[];
  /** Mean daily max / min, °C. */
  tMax: number;
  tMin: number;
  /** Chance that a day sees ≥ 1 mm of rain, %. */
  rainDay: number;
};

export type Climatology = {
  source: string;
  years: number[];
  window: string;
  computedAt: string;
  points: PointTypical[];
};

export type ForecastCache = {
  fetchedAt: string;
  dates: string[];
  model: string;
  points: PointForecast[];
};

export type WindKind = "head" | "tail" | "cross";
export type WindRel = {
  /** Wind-from direction relative to the direction of travel, -180…180 (0 = straight in the face). */
  rel: number;
  kind: WindKind;
  side: "left" | "right" | null;
  /** Along-track component, mph; positive slows you (headwind). */
  along: number;
  /** Across-track component, mph. */
  across: number;
};

export type Source = "forecast" | "typical";

export type SegmentWx = Segment & {
  /** Minutes after midnight when the riders pass the middle of the segment. */
  eta: number;
  etaHm: string;
  dark: boolean;
  /** The weather hour used, and the typical hour for comparison (same when the source is typical). */
  hour: Hour;
  typical: Hour;
  wind: WindRel;
  source: Source;
};

export type Confidence = { level: 0 | 1 | 2 | 3 | 4; label: string; note: string };

export type DaySummary = {
  tMin: number;
  tMax: number;
  feelsMin: number;
  rainChance: number | null;
  rainMm: number;
  windMean: number;
  gustMax: number;
  windFrom: number;
  headMi: number;
  tailMi: number;
  crossMi: number;
  snow: boolean;
  fog: boolean;
  thunder: boolean;
};

export type DayWx = {
  day: number;
  date: string;
  source: Source;
  daysOut: number;
  confidence: Confidence;
  /** When the forecast was fetched (ISO), if the source is a forecast. */
  fetchedAt: string | null;
  model: string | null;
  /** The date on which the forecast first reaches this day (ISO date). */
  forecastFrom: string;
  sunrise: number;
  sunset: number;
  segments: SegmentWx[];
  summary: DaySummary;
  /** The typical day at the route's midpoint, for the "normally…" line. */
  typicalDay: { tMax: number; tMin: number; rainDay: number; windMean: number; windFrom: number };
};

export type RideWeather = {
  generatedAt: string;
  today: string;
  climatology: { source: string; note: string };
  forecast: { fetchedAt: string | null; model: string | null; stale: boolean; error: string | null };
  days: DayWx[];
};

const MI = 1609.344;

// ---- the route in segments -------------------------------------------------

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR;
  const dLon = (lon2 - lon1) * toR;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Bearing in compass degrees from one point to the next. */
export function bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toR = Math.PI / 180;
  const dLon = (lon2 - lon1) * toR;
  const y = Math.sin(dLon) * Math.cos(lat2 * toR);
  const x = Math.cos(lat1 * toR) * Math.sin(lat2 * toR) - Math.sin(lat1 * toR) * Math.cos(lat2 * toR) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** The route cut into SEGMENT_MI pieces, the last one shorter. */
export function segmentsFor(profile: RouteProfile): Segment[] {
  const out: Segment[] = [];
  const total = profile.miles;
  if (!total || !profile.points.length) return out;
  const n = Math.ceil(total / SEGMENT_MI - 1e-6);
  for (let i = 0; i < n; i++) {
    const fromMi = i * SEGMENT_MI;
    const toMi = Math.min(total, (i + 1) * SEGMENT_MI);
    const midMi = (fromMi + toMi) / 2;
    const mid = pointAtMile(profile.points, midMi);
    // Direction of travel: the sum of every step inside the segment, weighted
    // by its length, so a wiggly lane still gets the direction it makes good.
    let sx = 0;
    let sy = 0;
    let len = 0;
    const pts = profile.points.filter((p) => p[3] >= fromMi && p[3] <= toMi);
    const first = pointAtMile(profile.points, fromMi);
    const last = pointAtMile(profile.points, toMi);
    const walk: ProfilePoint[] = [first, ...pts, last];
    for (let k = 1; k < walk.length; k++) {
      const a = walk[k - 1];
      const b = walk[k];
      const d = haversineM(a[1], a[0], b[1], b[0]);
      if (d <= 0) continue;
      const br = (bearing(a[1], a[0], b[1], b[0]) * Math.PI) / 180;
      sx += Math.sin(br) * d;
      sy += Math.cos(br) * d;
      len += d;
    }
    const heading = len ? ((Math.atan2(sx, sy) * 180) / Math.PI + 360) % 360 : bearing(first[1], first[0], last[1], last[0]);
    const straight = len ? Math.min(1, Math.hypot(sx, sy) / len) : 1;
    out.push({ day: profile.day, i, fromMi, toMi, midMi: round1(midMi), lat: round(mid[1], 4), lon: round(mid[0], 4), eleM: Math.round(mid[2]), heading: Math.round(heading), straight: round(straight, 2) });
  }
  return out;
}

/** The distinct points the forecast is fetched for (both days). */
export function samplePoints(segments: Segment[]): { lat: number; lon: number }[] {
  const seen = new Set<string>();
  const out: { lat: number; lon: number }[] = [];
  for (const s of segments) {
    const k = `${s.lat.toFixed(3)},${s.lon.toFixed(3)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ lat: s.lat, lon: s.lon });
  }
  return out;
}

export function pointKey(lat: number, lon: number): string {
  return `${lat.toFixed(3)},${lon.toFixed(3)}`;
}

/** Nearest of a list of points to (lat, lon), with the distance in miles. */
export function nearestPoint<T extends { lat: number; lon: number }>(list: T[], lat: number, lon: number): { p: T; distMi: number } | null {
  let best: T | null = null;
  let bestD = Infinity;
  for (const p of list) {
    const d = haversineM(lat, lon, p.lat, p.lon);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best ? { p: best, distMi: bestD / MI } : null;
}

// ---- wind relative to the road ---------------------------------------------

/** Where a wind *from* `windFrom` sits relative to a rider heading `heading`. */
export function windRelative(windFrom: number, heading: number, ws: number): WindRel {
  const rel = ((((windFrom - heading) % 360) + 540) % 360) - 180; // -180 … 180
  const a = Math.abs(rel);
  const kind: WindKind = a <= 45 ? "head" : a >= 135 ? "tail" : "cross";
  const side = kind === "cross" ? (rel > 0 ? "right" : "left") : null;
  const r = (rel * Math.PI) / 180;
  return { rel: Math.round(rel), kind, side, along: round1(ws * Math.cos(r)), across: round1(Math.abs(ws * Math.sin(r))) };
}

export const WIND_LABEL: Record<WindKind, string> = { head: "headwind", tail: "tailwind", cross: "crosswind" };

/** "SW" from degrees. */
export function compass(deg: number): string {
  const names = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return names[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

/** Coarser: "north-west" for a heading. */
export function compass8(deg: number): string {
  const names = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
  return names[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

// ---- weather codes (WMO 4677) -----------------------------------------------

export type RainGlyph = "none" | "maybe" | "light" | "rain" | "heavy" | "snow" | "storm";

export function isSnowCode(code: number): boolean {
  return (code >= 71 && code <= 77) || code === 85 || code === 86;
}
export function isThunderCode(code: number): boolean {
  return code >= 95 && code <= 99;
}
export function isFogCode(code: number): boolean {
  return code === 45 || code === 48;
}

/** Which rain mark a cell gets. */
export function rainGlyph(h: Hour): RainGlyph {
  if (isSnowCode(h.code)) return "snow";
  if (isThunderCode(h.code)) return "storm";
  if (h.mm >= 3) return "heavy";
  if (h.mm >= 1) return "rain";
  if (h.mm >= 0.2) return "light";
  if ((h.pp ?? 0) >= 40) return "maybe";
  return "none";
}

export function describeCode(code: number): string {
  if (code === 0) return "clear";
  if (code === 1) return "mainly clear";
  if (code === 2) return "partly cloudy";
  if (code === 3) return "overcast";
  if (isFogCode(code)) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if (code === 66 || code === 67) return "freezing rain";
  if (code >= 61 && code <= 65) return code === 61 ? "light rain" : code === 63 ? "rain" : "heavy rain";
  if (code >= 71 && code <= 77) return "snow";
  if (code >= 80 && code <= 82) return code === 80 ? "light showers" : code === 81 ? "showers" : "heavy showers";
  if (code === 85 || code === 86) return "snow showers";
  if (isThunderCode(code)) return "thunder";
  return "";
}

// ---- temperature bins (the heat-map key) ------------------------------------

/** Bin index 0…6 for the heat map: <0, 0–3, 3–6, 6–9, 9–12, 12–15, >15 °C. */
export function tempBin(t: number): number {
  if (t < 0) return 0;
  if (t < 3) return 1;
  if (t < 6) return 2;
  if (t < 9) return 3;
  if (t < 12) return 4;
  if (t < 15) return 5;
  return 6;
}
export const TEMP_BINS = ["below 0", "0–3", "3–6", "6–9", "9–12", "12–15", "15+"];

// ---- confidence ----------------------------------------------------------------

export function confidenceFor(daysOut: number, source: Source): Confidence {
  if (source === "typical") return { level: 0, label: "typical", note: "beyond the 16-day forecast range — what mid-November is usually like here" };
  if (daysOut <= 2) return { level: 4, label: "high", note: "a proper forecast — plan on it" };
  if (daysOut <= 5) return { level: 3, label: "good", note: "the shape of the day is settled; times and amounts will still shift" };
  if (daysOut <= 9) return { level: 2, label: "fair", note: "expect changes — the pattern is more trustworthy than the detail" };
  return { level: 1, label: "low", note: "a trend, not a forecast — it will change" };
}

// ---- a typical day when no climatology file exists -----------------------------
//
// Long-term mid-November averages for the Midlands and Yorkshire, shaped into a
// day: coldest just after dawn, warmest early afternoon, a little colder with
// height and further north, a south-westerly breeze. Replaced by the ERA5
// numbers in content/weather/climatology.json when that has been generated.

export function typicalFallback(lat: number, lon: number, eleM: number): PointTypical {
  const lapse = Math.max(0, eleM - 40) * 0.0065; // °C lost with height
  const north = Math.max(0, lat - 51.5) * 0.35; // and a touch with latitude
  const tMax = round1(9.6 - lapse - north);
  const tMin = round1(4.0 - lapse - north);
  const hours: Hour[] = [];
  for (let h = 0; h < 24; h++) {
    // Coldest at 06:30, warmest at 14:00, a slow fall through the evening.
    let f: number;
    if (h >= 6.5 && h <= 14) f = (1 - Math.cos((Math.PI * (h - 6.5)) / 7.5)) / 2;
    else {
      const x = h < 6.5 ? h + 24 : h; // 14 … 30.5
      f = (1 + Math.cos((Math.PI * (x - 14)) / 16.5)) / 2;
    }
    const t = round1(tMin + (tMax - tMin) * f);
    const ws = round1(10 + 2.5 * Math.sin(((h - 8) / 24) * 2 * Math.PI)); // breezier in the afternoon
    hours.push({ t, feels: windChill(t, ws), pp: 16, mm: 0.1, code: -1, cloud: 72, ws, wd: 225, gust: round1(ws * 2) });
  }
  return { lat, lon, hours, tMax, tMin, rainDay: 55 };
}

/** Feels-like on a bike: the standard wind-chill formula (°C, mph in), air temperature when it doesn't apply. */
export function windChill(tC: number, mph: number): number {
  const kmh = mph * 1.609344;
  if (tC > 10 || kmh < 4.8) return round1(tC);
  const v = kmh ** 0.16;
  return round1(13.12 + 0.6215 * tC - 11.37 * v + 0.3965 * tC * v);
}

// ---- assembling a day -----------------------------------------------------------

export type DayInputs = {
  profile: RouteProfile;
  result: DayResult;
  today: string;
  forecast: ForecastCache | null;
  climatology: Climatology | null;
  forecastError: string | null;
};

/** ISO date `days` after `ymd`. */
export function addDays(ymd: string, days: number): string {
  const d = new Date(ymd + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromYmd: string, toYmd: string): number {
  return Math.round((Date.parse(toYmd + "T00:00:00Z") - Date.parse(fromYmd + "T00:00:00Z")) / 86_400_000);
}

/** Does the 16-day forecast reach this date from today? */
export function inForecastRange(today: string, date: string): boolean {
  const d = daysBetween(today, date);
  return d >= 0 && d <= FORECAST_DAYS_AHEAD;
}

function typicalFor(clim: Climatology | null, s: Segment): PointTypical {
  if (clim && clim.points.length) {
    const n = nearestPoint(clim.points, s.lat, s.lon);
    if (n && n.distMi <= 8) return n.p;
  }
  return typicalFallback(s.lat, s.lon, s.eleM);
}

function forecastFor(fc: ForecastCache | null, date: string, s: Segment): Hour[] | null {
  if (!fc || !fc.dates.includes(date)) return null;
  const n = nearestPoint(fc.points, s.lat, s.lon);
  if (!n || n.distMi > 8) return null;
  const hours = n.p.days[date];
  return hours && hours.length === 24 ? hours : null;
}

export function buildDay(inp: DayInputs): DayWx {
  const { profile, result, today, forecast, climatology } = inp;
  const day = profile.day;
  const date = RIDE_DATES[day];
  const daysOut = daysBetween(today, date);
  const minPerMile = 60 / result.speedMph;
  const segs = segmentsFor(profile);
  const segments: SegmentWx[] = [];
  let anyForecast = false;
  for (const s of segs) {
    const eta = timeAtMile(result.events, s.midMi, minPerMile);
    const h = Math.min(23, Math.max(0, Math.round(eta / 60)));
    const typ = typicalFor(climatology, s);
    const typical = typ.hours[h];
    const fh = forecastFor(forecast, date, s);
    const hour = fh ? fh[h] : typical;
    if (fh) anyForecast = true;
    segments.push({
      ...s,
      eta,
      etaHm: fmtHm(eta),
      dark: eta < result.sunrise || eta > result.sunset,
      hour,
      typical,
      wind: windRelative(hour.wd, s.heading, hour.ws),
      source: fh ? "forecast" : "typical",
    });
  }
  const source: Source = anyForecast ? "forecast" : "typical";
  const mid = segs[Math.floor(segs.length / 2)];
  const typMid = mid ? typicalFor(climatology, mid) : typicalFallback(52.8, -1.2, 100);
  const typWind = typMid.hours.slice(7, 18);
  return {
    day,
    date,
    source,
    daysOut,
    confidence: confidenceFor(daysOut, source),
    fetchedAt: source === "forecast" ? forecast?.fetchedAt ?? null : null,
    model: source === "forecast" ? forecast?.model ?? null : null,
    forecastFrom: addDays(date, -FORECAST_DAYS_AHEAD),
    sunrise: result.sunrise,
    sunset: result.sunset,
    segments,
    summary: summarise(segments),
    typicalDay: {
      tMax: typMid.tMax,
      tMin: typMid.tMin,
      rainDay: typMid.rainDay,
      windMean: round1(typWind.reduce((a, x) => a + x.ws, 0) / Math.max(1, typWind.length)),
      windFrom: vectorMeanDir(typWind.map((x) => ({ deg: x.wd, w: x.ws }))),
    },
  };
}

export function summarise(segments: SegmentWx[]): DaySummary {
  const hs = segments.map((s) => s.hour);
  const len = (s: SegmentWx) => s.toMi - s.fromMi;
  const sum = (f: (s: SegmentWx) => number) => segments.reduce((a, s) => a + f(s), 0);
  const pps = hs.map((h) => h.pp).filter((p): p is number => p != null);
  return {
    tMin: Math.min(...hs.map((h) => h.t)),
    tMax: Math.max(...hs.map((h) => h.t)),
    feelsMin: Math.min(...hs.map((h) => h.feels)),
    rainChance: pps.length ? Math.max(...pps) : null,
    rainMm: round1(sum((s) => s.hour.mm * (len(s) / SEGMENT_MI))),
    windMean: round1(sum((s) => s.hour.ws * len(s)) / Math.max(1, sum(len))),
    gustMax: Math.max(...hs.map((h) => h.gust)),
    windFrom: vectorMeanDir(hs.map((h) => ({ deg: h.wd, w: h.ws }))),
    headMi: round1(sum((s) => (s.wind.kind === "head" ? len(s) : 0))),
    tailMi: round1(sum((s) => (s.wind.kind === "tail" ? len(s) : 0))),
    crossMi: round1(sum((s) => (s.wind.kind === "cross" ? len(s) : 0))),
    snow: hs.some((h) => isSnowCode(h.code)),
    fog: hs.some((h) => isFogCode(h.code)),
    thunder: hs.some((h) => isThunderCode(h.code)),
  };
}

/** Mean of directions, weighted (degrees from). */
export function vectorMeanDir(items: { deg: number; w: number }[]): number {
  let x = 0;
  let y = 0;
  for (const it of items) {
    const r = (it.deg * Math.PI) / 180;
    x += Math.sin(r) * it.w;
    y += Math.cos(r) * it.w;
  }
  if (!x && !y) return 225;
  return Math.round(((Math.atan2(x, y) * 180) / Math.PI + 360) % 360);
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/** "5–9 °C", "rain 40%", "SW 12 mph" — the one-line day. */
export function dayLine(d: DayWx): string {
  const s = d.summary;
  const bits = [`${Math.round(s.tMin)}–${Math.round(s.tMax)} °C`];
  if (s.rainChance != null) bits.push(`rain ${Math.round(s.rainChance)}%${s.rainMm >= 0.5 ? ` (${s.rainMm} mm)` : ""}`);
  else if (s.rainMm >= 0.5) bits.push(`${s.rainMm} mm rain`);
  bits.push(`wind ${compass(s.windFrom)} ${Math.round(s.windMean)} mph`);
  return bits.join(" · ");
}
