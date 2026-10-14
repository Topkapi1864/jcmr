import fs from "node:fs";
import { gpxExists, gpxPathFor } from "./gpx";

// The route as the planner and the crew map see it: every track point with its
// cumulative mile, the GPX waypoints (Simon's pins) placed on the line, and the
// towns the line passes. Everything here is derived from the files under
// content/route/; nothing is typed in twice.

export type ProfilePoint = [lon: number, lat: number, eleM: number, mile: number];

export type RouteWaypoint = { name: string; desc: string; lat: number; lon: number; mile: number };
export type RouteTown = { name: string; lat: number; lon: number; mile: number; offMi: number };

export type RouteProfile = {
  day: number;
  /** false → the GPX is not in yet; `points` is a schematic from the roadbook. */
  present: boolean;
  miles: number;
  climbFt: number;
  descentFt: number;
  points: ProfilePoint[];
  waypoints: RouteWaypoint[];
  towns: RouteTown[];
};

const MI = 1609.344;

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR;
  const dLon = (lon2 - lon1) * toR;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Towns worth naming along either day. The line decides which it actually
// passes (within 2.5 miles) and at what mile; the rest are ignored.
const TOWNS: { name: string; lat: number; lon: number }[] = [
  { name: "Barnes", lat: 51.4745, lon: -0.2415 },
  { name: "Hammersmith", lat: 51.4927, lon: -0.2229 },
  { name: "Acton", lat: 51.5081, lon: -0.2731 },
  { name: "Wembley", lat: 51.5528, lon: -0.2979 },
  { name: "Harrow", lat: 51.5806, lon: -0.342 },
  { name: "Watford", lat: 51.6565, lon: -0.3903 },
  { name: "St Albans", lat: 51.7527, lon: -0.3394 },
  { name: "Hemel Hempstead", lat: 51.7526, lon: -0.4692 },
  { name: "Harpenden", lat: 51.8175, lon: -0.3524 },
  { name: "Berkhamsted", lat: 51.7601, lon: -0.5631 },
  { name: "Tring", lat: 51.7962, lon: -0.6597 },
  { name: "Ivinghoe", lat: 51.8385, lon: -0.626 },
  { name: "Pitstone", lat: 51.8295, lon: -0.6354 },
  { name: "Dunstable", lat: 51.886, lon: -0.5209 },
  { name: "Leighton Buzzard", lat: 51.9165, lon: -0.6617 },
  { name: "Milton Keynes", lat: 52.0406, lon: -0.7594 },
  { name: "Newport Pagnell", lat: 52.0872, lon: -0.7223 },
  { name: "Stony Stratford", lat: 52.0565, lon: -0.8535 },
  { name: "Towcester", lat: 52.1312, lon: -0.9898 },
  { name: "Northampton", lat: 52.2405, lon: -0.9027 },
  { name: "Daventry", lat: 52.2577, lon: -1.1626 },
  { name: "Market Harborough", lat: 52.4776, lon: -0.9208 },
  { name: "Lutterworth", lat: 52.4566, lon: -1.2008 },
  { name: "Kibworth", lat: 52.5386, lon: -0.9926 },
  { name: "Countesthorpe", lat: 52.5533, lon: -1.1424 },
  { name: "Leicester", lat: 52.6369, lon: -1.1398 },
  { name: "Loughborough", lat: 52.7721, lon: -1.2062 },
  { name: "Shepshed", lat: 52.7693, lon: -1.2947 },
  { name: "Castle Donington", lat: 52.8445, lon: -1.3414 },
  { name: "Derby", lat: 52.9225, lon: -1.4746 },
  { name: "Belper", lat: 53.0244, lon: -1.4824 },
  { name: "Duffield", lat: 52.9856, lon: -1.4876 },
  { name: "Ambergate", lat: 53.0608, lon: -1.481 },
  { name: "Cromford", lat: 53.1081, lon: -1.5597 },
  { name: "Matlock", lat: 53.1371, lon: -1.5532 },
  { name: "Matlock Bath", lat: 53.1216, lon: -1.5612 },
  { name: "Bakewell", lat: 53.214, lon: -1.675 },
  { name: "Rowsley", lat: 53.1904, lon: -1.6154 },
  { name: "Baslow", lat: 53.2487, lon: -1.6225 },
  { name: "Chatsworth", lat: 53.2277, lon: -1.6111 },
  { name: "Owler Bar", lat: 53.3014, lon: -1.5693 },
  { name: "Totley", lat: 53.3194, lon: -1.5306 },
  { name: "Dore", lat: 53.3284, lon: -1.5406 },
  { name: "Sheffield", lat: 53.3811, lon: -1.4701 },
  { name: "Hillsborough", lat: 53.4091, lon: -1.5008 },
  { name: "Chapeltown", lat: 53.4615, lon: -1.4654 },
  { name: "Stocksbridge", lat: 53.4815, lon: -1.5925 },
  { name: "Wortley", lat: 53.5154, lon: -1.5512 },
  { name: "Penistone", lat: 53.5261, lon: -1.6294 },
  { name: "Silkstone", lat: 53.5492, lon: -1.5663 },
  { name: "Barnsley", lat: 53.5526, lon: -1.4797 },
  { name: "Darton", lat: 53.5861, lon: -1.5288 },
  { name: "Wombwell", lat: 53.5214, lon: -1.4 },
  { name: "Clayton West", lat: 53.6082, lon: -1.6166 },
  { name: "Emley", lat: 53.6168, lon: -1.6392 },
  { name: "Horbury", lat: 53.6598, lon: -1.5563 },
  { name: "Wakefield", lat: 53.683, lon: -1.4977 },
  { name: "Ossett", lat: 53.6797, lon: -1.5801 },
  { name: "Dewsbury", lat: 53.691, lon: -1.6328 },
  { name: "Batley", lat: 53.7167, lon: -1.6356 },
  { name: "Morley", lat: 53.7492, lon: -1.6023 },
  { name: "Leeds", lat: 53.8008, lon: -1.5491 },
  { name: "Headingley", lat: 53.8197, lon: -1.5775 },
  { name: "Horsforth", lat: 53.8419, lon: -1.6414 },
  { name: "Rawdon", lat: 53.8544, lon: -1.6775 },
  { name: "Guiseley", lat: 53.8759, lon: -1.7066 },
  { name: "Yeadon", lat: 53.865, lon: -1.682 },
  { name: "Mansfield", lat: 53.145, lon: -1.195 },
  { name: "Nottingham", lat: 52.9548, lon: -1.1581 },
  { name: "Hucknall", lat: 53.0373, lon: -1.2047 },
  { name: "Bolsover", lat: 53.2301, lon: -1.2905 },
  { name: "Clowne", lat: 53.276, lon: -1.263 },
  { name: "Chesterfield", lat: 53.235, lon: -1.421 },
];

// Schematic for a day whose GPX hasn't arrived: Simon's roadbook rendezvous
// points, straight lines between them, miles from the roadbook.
const SCHEMATIC: Record<number, { name: string; lat: number; lon: number; mile: number; desc: string }[]> = {
  1: [
    { name: "START - CASTELNAU, BARNES", lat: 51.4835, lon: -0.2425, mile: 0, desc: "Day 1 start: the house in Barnes." },
    { name: "D1 STOP 1 (~38 mi)", lat: 51.8385, lon: -0.626, mile: 38, desc: "Ivinghoe/Pitstone area. Rendezvous area, not yet a confirmed parking bay." },
    { name: "D1 STOP 2 (~76 mi)", lat: 52.245, lon: -0.95, mile: 76, desc: "West Northampton. Rendezvous area, not yet a confirmed parking bay." },
    { name: "D1 STOP 3 (~111 mi)", lat: 52.5533, lon: -1.1424, mile: 111, desc: "Countesthorpe area. Rendezvous area, not yet a confirmed parking bay." },
    { name: "FINISH - THE LINK HOTEL", lat: 52.762545, lon: -1.247615, mile: 132.6, desc: "Overnight: The Link Hotel, Ashby Road, Loughborough, LE11 4EX." },
  ],
  2: [
    { name: "START - THE LINK HOTEL", lat: 52.762545, lon: -1.247615, mile: 0, desc: "Day 2 start: The Link Hotel, LE11 4EX." },
    { name: "D2 STOP 1 (~37 mi)", lat: 53.12693, lon: -1.55989, mile: 37, desc: "Bakewell area." },
    { name: "D2 STOP 2 (~73 mi)", lat: 53.52427, lon: -1.58204, mile: 73, desc: "Silkstone/Barnsley corridor." },
    { name: "D2 OPTIONAL STOP (~96 mi)", lat: 53.76548, lon: -1.48798, mile: 96, desc: "Leeds corridor. Only if needed." },
    { name: "FINISH - YEADON", lat: 53.8718, lon: -1.67478, mile: 109.1, desc: "Yeadon Cemetery." },
  ],
};

type Raw = { pts: { lat: number; lon: number; ele: number }[]; wpts: { name: string; desc: string; lat: number; lon: number }[] };

function parseGpx(xml: string): Raw {
  const pts: Raw["pts"] = [];
  const re = /<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt>|<trkpt\b([^>]*)\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const attrs = m[1] ?? m[3] ?? "";
    const body = m[2] ?? "";
    const lat = /lat="(-?[\d.]+)"/.exec(attrs);
    const lon = /lon="(-?[\d.]+)"/.exec(attrs);
    if (!lat || !lon) continue;
    const ele = /<ele>(-?[\d.]+)<\/ele>/.exec(body);
    pts.push({ lat: parseFloat(lat[1]), lon: parseFloat(lon[1]), ele: ele ? parseFloat(ele[1]) : NaN });
  }
  const wpts: Raw["wpts"] = [];
  const wre = /<wpt\b([^>]*)>([\s\S]*?)<\/wpt>/g;
  while ((m = wre.exec(xml))) {
    const lat = /lat="(-?[\d.]+)"/.exec(m[1]);
    const lon = /lon="(-?[\d.]+)"/.exec(m[1]);
    if (!lat || !lon) continue;
    const name = /<name>([\s\S]*?)<\/name>/.exec(m[2]);
    const desc = /<desc>([\s\S]*?)<\/desc>/.exec(m[2]);
    wpts.push({ lat: parseFloat(lat[1]), lon: parseFloat(lon[1]), name: decode(name?.[1] ?? "Waypoint"), desc: decode(desc?.[1] ?? "") });
  }
  return { pts, wpts };
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}

/** Nearest point on the line to (lat, lon): index and distance in miles. */
export function nearestOnLine(points: ProfilePoint[], lat: number, lon: number): { i: number; distMi: number } {
  let best = 0;
  let bestD = Infinity;
  // Cheap first pass on a flat approximation, then exact on the winner's neighbourhood.
  const cosLat = Math.cos((lat * Math.PI) / 180);
  for (let i = 0; i < points.length; i++) {
    const dx = (points[i][0] - lon) * cosLat;
    const dy = points[i][1] - lat;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return { i: best, distMi: haversineM(lat, lon, points[best][1], points[best][0]) / MI };
}

function build(day: number, raw: Raw): RouteProfile {
  const { pts, wpts } = raw;
  // Smooth elevation a touch before summing climb: raw GPX elevation is noisy
  // and overstates ascent badly otherwise.
  const ele = pts.map((p) => p.ele);
  const hasEle = ele.some((e) => !Number.isNaN(e));
  const sm: number[] = ele.map((_, i) => {
    if (!hasEle) return 0;
    let s = 0;
    let n = 0;
    for (let k = -3; k <= 3; k++) {
      const v = ele[i + k];
      if (v !== undefined && !Number.isNaN(v)) {
        s += v;
        n++;
      }
    }
    return n ? s / n : 0;
  });
  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + haversineM(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon) / MI);
  let climb = 0;
  let descent = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = sm[i] - sm[i - 1];
    if (d > 0) climb += d;
    else descent -= d;
  }
  const full: ProfilePoint[] = pts.map((p, i) => [round(p.lon, 5), round(p.lat, 5), Math.round(sm[i]), round(cum[i], 3)]);
  // Thin for the wire, keeping the ends and never dropping more than ~0.08 mi.
  const step = Math.max(1, Math.ceil(full.length / 2500));
  const points = full.filter((_, i) => i % step === 0 || i === full.length - 1);
  const miles = cum[cum.length - 1] ?? 0;

  const waypoints: RouteWaypoint[] = wpts
    .map((w) => {
      const n = nearestOnLine(full, w.lat, w.lon);
      return { name: w.name, desc: w.desc, lat: w.lat, lon: w.lon, mile: round(full[n.i][3], 1) };
    })
    .sort((a, b) => a.mile - b.mile);

  const towns: RouteTown[] = [];
  for (const t of TOWNS) {
    const n = nearestOnLine(full, t.lat, t.lon);
    if (n.distMi <= 2.5) towns.push({ name: t.name, lat: t.lat, lon: t.lon, mile: round(full[n.i][3], 1), offMi: round(n.distMi, 1) });
  }
  towns.sort((a, b) => a.mile - b.mile);

  return { day, present: true, miles: round(miles, 1), climbFt: Math.round(climb * 3.28084), descentFt: Math.round(descent * 3.28084), points, waypoints, towns };
}

function schematic(day: number): RouteProfile {
  const s = SCHEMATIC[day] ?? [];
  // Straight segments, subdivided so a mile still maps to a place on the map.
  const points: ProfilePoint[] = [];
  for (let k = 0; k < s.length - 1; k++) {
    const a = s[k];
    const b = s[k + 1];
    const n = 20;
    for (let j = 0; j < n; j++) {
      const f = j / n;
      points.push([round(a.lon + (b.lon - a.lon) * f, 5), round(a.lat + (b.lat - a.lat) * f, 5), 0, round(a.mile + (b.mile - a.mile) * f, 2)]);
    }
  }
  const last = s[s.length - 1];
  if (last) points.push([last.lon, last.lat, 0, last.mile]);
  return {
    day,
    present: false,
    miles: last?.mile ?? 0,
    climbFt: 0,
    descentFt: 0,
    points,
    waypoints: s.map((w) => ({ name: w.name, desc: w.desc, lat: w.lat, lon: w.lon, mile: w.mile })),
    towns: [],
  };
}

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

const cache = new Map<number, { mtime: number; profile: RouteProfile }>();

export function loadProfile(day: number): RouteProfile {
  if (!gpxExists(day)) return schematic(day);
  const p = gpxPathFor(day);
  const mtime = fs.statSync(p).mtimeMs;
  const hit = cache.get(day);
  if (hit && hit.mtime === mtime) return hit.profile;
  const profile = build(day, parseGpx(fs.readFileSync(p, "utf8")));
  cache.set(day, { mtime, profile });
  return profile;
}

export function loadProfiles(): RouteProfile[] {
  return [loadProfile(1), loadProfile(2)];
}
