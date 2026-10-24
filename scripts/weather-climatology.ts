// npm run weather:climatology — writes content/weather/climatology.json: what the
// last ten mid-Novembers were like, hour by hour, at every 10-mile point of the
// route (ERA5 reanalysis via the Open-Meteo archive, no key needed). The weather
// page uses it as "typical" until the real forecast reaches the ride dates, and
// as the "normally…" comparison after that. Run it again if the route changes.
// The GitHub workflow .github/workflows/weather-climatology.yml does exactly this
// and commits the result.
import fs from "node:fs";
import path from "node:path";
import { loadProfiles } from "../src/lib/route";
import { samplePoints, segmentsFor, vectorMeanDir, windChill, type Climatology, type Hour, type PointTypical } from "../src/lib/weather";

const ARCHIVE = process.env.OPEN_METEO_ARCHIVE_URL || "https://archive-api.open-meteo.com/v1/archive";
const LAST_YEAR = new Date().getUTCFullYear() - 1;
const YEARS = Array.from({ length: 10 }, (_, i) => LAST_YEAR - 9 + i);
const WINDOW = ["11-11", "11-18"]; // eight days around the 14th/15th
const HOURLY = ["temperature_2m", "apparent_temperature", "precipitation", "wind_speed_10m", "wind_direction_10m", "wind_gusts_10m"];

type Acc = {
  hours: { t: number; feels: number; rainH: number; mm: number; ws: number; wx: number; wy: number; gust: number; n: number }[];
  days: { tMax: number; tMin: number; rainDays: number; n: number };
};

type Res = { hourly?: { time: string[]; [k: string]: (number | null)[] | string[] } };

async function main() {
  const points = samplePoints(loadProfiles().flatMap(segmentsFor));
  if (!points.length) throw new Error("no route points — are the GPX files in content/route/?");
  console.log(`${points.length} points, years ${YEARS[0]}–${YEARS[YEARS.length - 1]}`);
  const acc: Acc[] = points.map(() => ({ hours: Array.from({ length: 24 }, () => ({ t: 0, feels: 0, rainH: 0, mm: 0, ws: 0, wx: 0, wy: 0, gust: 0, n: 0 })), days: { tMax: 0, tMin: 0, rainDays: 0, n: 0 } }));

  for (const y of YEARS) {
    const q = new URLSearchParams({
      latitude: points.map((p) => p.lat.toFixed(4)).join(","),
      longitude: points.map((p) => p.lon.toFixed(4)).join(","),
      start_date: `${y}-${WINDOW[0]}`,
      end_date: `${y}-${WINDOW[1]}`,
      hourly: HOURLY.join(","),
      wind_speed_unit: "mph",
      timezone: "Europe/London",
    });
    const url = `${ARCHIVE}?${q}`;
    let json: unknown = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      const text = await res.text();
      if (res.ok) {
        json = JSON.parse(text);
        break;
      }
      console.warn(`${y}: ${res.status} ${text.slice(0, 120)}`);
      if (res.status === 429 || res.status >= 500) await new Promise((r) => setTimeout(r, 4000 * attempt));
      else throw new Error(`Open-Meteo archive ${res.status}: ${text.slice(0, 200)}`);
    }
    if (!json) throw new Error(`${y}: gave up`);
    const arr: Res[] = Array.isArray(json) ? json : [json as Res];
    if (arr.length !== points.length) throw new Error(`${y}: got ${arr.length} locations for ${points.length}`);
    arr.forEach((r, pi) => {
      const h = r.hourly;
      if (!h) return;
      const t = h.temperature_2m as (number | null)[];
      const feels = h.apparent_temperature as (number | null)[];
      const mm = h.precipitation as (number | null)[];
      const ws = h.wind_speed_10m as (number | null)[];
      const wd = h.wind_direction_10m as (number | null)[];
      const gust = h.wind_gusts_10m as (number | null)[];
      const byDay = new Map<string, { tMax: number; tMin: number; mm: number }>();
      h.time.forEach((ts, i) => {
        if (t[i] == null || ws[i] == null) return;
        const hr = Number(ts.slice(11, 13));
        const a = acc[pi].hours[hr];
        const speed = ws[i] ?? 0;
        const dir = ((wd[i] ?? 0) * Math.PI) / 180;
        a.t += t[i] ?? 0;
        a.feels += feels[i] ?? windChill(t[i] ?? 0, speed);
        a.rainH += (mm[i] ?? 0) >= 0.1 ? 1 : 0;
        a.mm += mm[i] ?? 0;
        a.ws += speed;
        a.wx += Math.sin(dir) * speed;
        a.wy += Math.cos(dir) * speed;
        a.gust += gust[i] ?? speed * 1.6;
        a.n++;
        const d = ts.slice(0, 10);
        const day = byDay.get(d) ?? { tMax: -99, tMin: 99, mm: 0 };
        day.tMax = Math.max(day.tMax, t[i] ?? -99);
        day.tMin = Math.min(day.tMin, t[i] ?? 99);
        day.mm += mm[i] ?? 0;
        byDay.set(d, day);
      });
      for (const d of byDay.values()) {
        const D = acc[pi].days;
        D.tMax += d.tMax;
        D.tMin += d.tMin;
        D.rainDays += d.mm >= 1 ? 1 : 0;
        D.n++;
      }
    });
    console.log(`${y}: ok`);
    await new Promise((r) => setTimeout(r, 1200));
  }

  const r1 = (n: number) => Math.round(n * 10) / 10;
  const out: PointTypical[] = points.map((p, pi) => {
    const a = acc[pi];
    const hours: Hour[] = a.hours.map((h) => {
      const n = Math.max(1, h.n);
      const ws = r1(h.ws / n);
      return {
        t: r1(h.t / n),
        feels: r1(h.feels / n),
        pp: Math.round((100 * h.rainH) / n),
        mm: r1(h.mm / n),
        code: -1,
        cloud: null,
        ws,
        wd: vectorMeanDir([{ deg: (Math.atan2(h.wx, h.wy) * 180) / Math.PI, w: 1 }]),
        gust: r1(h.gust / n),
      };
    });
    const dn = Math.max(1, a.days.n);
    return { lat: p.lat, lon: p.lon, hours, tMax: r1(a.days.tMax / dn), tMin: r1(a.days.tMin / dn), rainDay: Math.round((100 * a.days.rainDays) / dn) };
  });
  const clim: Climatology = {
    source: "ERA5 reanalysis via the Open-Meteo archive",
    years: YEARS,
    window: "11–18 November",
    computedAt: new Date().toISOString(),
    points: out,
  };
  const file = path.join("content", "weather", "climatology.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(clim));
  console.log("wrote", file, `(${out.length} points)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
