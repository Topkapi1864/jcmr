import fs from "node:fs";
import path from "node:path";
import { loadProfiles, type RouteProfile } from "./route";
import { pointAtMile } from "./plan";

// Janet's album: the photo index built offline from the Google Photos export
// (content/janet/photos.json) and the pictures themselves under public/album.
// Nothing here needs the family: every grouping is machine-made from the
// pictures, so every label is deliberately plain ("the people in her life",
// never a name).

export type Face = { c: number; b: [number, number, number, number]; age: number | null };

export type Photo = {
  id: string;
  /** medium (lightbox) and thumbnail sizes in px */
  w: number;
  h: number;
  tw: number;
  th: number;
  /** the year the photo was taken: from EXIF, or estimated from the picture */
  year: number | null;
  /** how sure we are of the year */
  yc: "high" | "medium" | "low";
  /** ISO date when the camera recorded one */
  date: string | null;
  cam: string;
  set: string;
  occ: string[];
  ppl: number;
  kids: boolean;
  janet: "yes" | "no" | "unsure";
  laugh: boolean;
  q: number;
  cap: string;
  colours: string;
  hue: number;
  sat: number;
  val: number;
  dom: string[];
  mono: boolean;
  /** the picture's one telling colour: the hue most of its saturated pixels share (null when it has hardly any) */
  chue: number | null;
  /** share of the picture that is saturated at all */
  cfrac: number;
  cval: number;
  csat: number;
  scan: boolean;
  faces: Face[];
};

export type Person = {
  /** face-cluster id */
  c: number;
  /** number of photos with Janet */
  n: number;
  /** photo used for the face crop, and the crop box as fractions of the medium image */
  cover: string;
  box: [number, number, number, number];
  years: [number, number] | null;
  photos: string[];
};

export type Album = {
  photos: Photo[];
  byId: Map<string, Photo>;
  janetClusters: number[];
  people: Person[];
  mosaics: { key: string; title: string; cols: number; rows: number; tile: number; cells: string[] }[];
};

export const ALBUM_BASE = "/album";
export const med = (id: string) => `${ALBUM_BASE}/med/${id}.jpg`;
export const thumb = (id: string) => `${ALBUM_BASE}/thumb/${id}.jpg`;
export const tile = (id: string) => `${ALBUM_BASE}/tile/${id}.jpg`;

let cache: { mtime: number; album: Album } | null = null;

export function loadAlbum(): Album {
  const p = path.join(process.cwd(), "content", "janet", "photos.json");
  const mtime = fs.statSync(p).mtimeMs;
  if (cache && cache.mtime === mtime) return cache.album;
  const raw = JSON.parse(fs.readFileSync(p, "utf8")) as { photos: Photo[]; janetClusters: number[]; people: Person[]; mosaics: Album["mosaics"] };
  const album: Album = { ...raw, byId: new Map(raw.photos.map((x) => [x.id, x])) };
  cache = { mtime, album };
  return album;
}

/** Photographs only (no screenshots), in a stable order. */
export function pictures(album: Album): Photo[] {
  return album.photos;
}

/** Sort key for life order: dated photos by date, estimated ones mid-year. */
export function lifeOrder(a: Photo, b: Photo): number {
  const ka = a.date ?? `${a.year ?? 9999}-07-01`;
  const kb = b.date ?? `${b.year ?? 9999}-07-01`;
  return ka < kb ? -1 : ka > kb ? 1 : a.id < b.id ? -1 : 1;
}

/** Lightweight shape sent to the browser for grids and the lightbox. */
export type PhotoLite = { id: string; w: number; h: number; y: number | null; yc: string; cap: string; date: string | null };
export function lite(p: Photo): PhotoLite {
  return { id: p.id, w: p.w, h: p.h, y: p.year, yc: p.yc, cap: p.cap, date: p.date };
}

// ---- Every mile ------------------------------------------------------------

export type MilePhoto = { mile: number; dayMile: number; day: number; lat: number; lon: number; id: string };
export type MileBlock = { mile: number; day: number; dayMile: number; town: string | null; lat: number; lon: number; ids: string[] };

/** Place every photograph along the route in life order: the earliest at the start in
 *  London, the latest at the cemetery in Yeadon. About four to a mile. */
export function everyMile(album: Album): { blocks: MileBlock[]; profiles: RouteProfile[]; total: number } {
  const profiles = loadProfiles();
  const d1 = profiles.find((p) => p.day === 1)!;
  const d2 = profiles.find((p) => p.day === 2)!;
  const total = d1.miles + d2.miles;
  const ordered = [...album.photos].sort(lifeOrder);
  const n = ordered.length;
  const blocks = new Map<number, MileBlock>();
  ordered.forEach((p, i) => {
    const m = ((i + 0.5) / n) * total;
    const day = m < d1.miles ? 1 : 2;
    const prof = day === 1 ? d1 : d2;
    const dayMile = day === 1 ? m : m - d1.miles;
    const whole = Math.floor(m);
    let block = blocks.get(whole);
    if (!block) {
      const pt = pointAtMile(prof.points, Math.min(prof.miles, dayMile));
      let town: string | null = null;
      let best = 1.5;
      for (const t of prof.towns) {
        const d = Math.abs(t.mile - dayMile);
        if (d < best) {
          best = d;
          town = t.name;
        }
      }
      block = { mile: whole, day, dayMile: Math.round(dayMile * 10) / 10, town, lat: Math.round(pt[1] * 1e4) / 1e4, lon: Math.round(pt[0] * 1e4) / 1e4, ids: [] };
      blocks.set(whole, block);
    }
    block.ids.push(p.id);
  });
  return { blocks: [...blocks.values()].sort((a, b) => a.mile - b.mile), profiles, total };
}

// ---- Groupings used by the views ------------------------------------------------

export const SETTING_LABELS: Record<string, string> = {
  home: "At home",
  garden: "In the garden",
  restaurant: "Round the table",
  "pub-bar": "In the pub",
  seaside: "By the sea",
  countryside: "In the country",
  town: "Out in town",
  boat: "On the water",
  "pool-spa": "By the pool",
  "party-venue": "At a do",
  hotel: "Hotels and away days",
  car: "On the road",
  church: "In church",
  other: "Elsewhere",
};

export const OCCASION_LABELS: Record<string, string> = {
  christmas: "Christmas",
  birthday: "Birthdays",
  wedding: "Weddings",
  holiday: "Holidays",
  "family-meal": "Family meals",
  "night-out": "Nights out",
  "day-out": "Days out",
  celebration: "Celebrations",
  portrait: "Portraits",
  everyday: "Everyday",
  cycling: "On two wheels",
  sport: "Sport",
  music: "Music",
  "dressing-up": "Dressing up",
  memorial: "Remembering her",
};

/** Friendly names for the cameras that took the pictures, in rough order of first use. */
export function cameraEra(cam: string, scan: boolean): { key: string; label: string; order: number } {
  const c = (cam || "").trim();
  if (scan || !c) return { key: "scan", label: "Prints, scans and saved pictures", order: 0 };
  const l = c.toLowerCase();
  if (l.includes("d-lux")) return { key: "leica", label: "The Leica D-LUX2", order: 1 };
  if (l.startsWith("dsc-")) return { key: "sony", label: `Sony Cyber-shot ${c.toUpperCase()}`, order: 2 };
  if (l.includes("blackberry")) return { key: "blackberry", label: "The BlackBerry", order: 3 };
  if (l.includes("canon")) return { key: "canon", label: `Canon ${c.replace(/canon/i, "").trim()}`, order: 4 };
  if (l.startsWith("iphone")) {
    const m = /iphone\s*(\d+|x[sr]?)\s*(pro max|pro|plus|s|mini)?/i.exec(c);
    const gen = m ? m[1].toUpperCase() : "";
    const num = parseInt(gen, 10);
    const order = 10 + (Number.isNaN(num) ? (gen.startsWith("X") ? 10 : 0) : num);
    return { key: `iphone-${gen.toLowerCase()}`, label: `iPhone ${gen}${m && m[2] ? " " + m[2] : ""}`.trim(), order };
  }
  if (l.startsWith("sm-") || l.includes("galaxy")) {
    if (l.includes("fold6")) return { key: "fold6", label: "Galaxy Z Fold6", order: 40 };
    if (l.includes("fold5")) return { key: "fold5", label: "Galaxy Z Fold5", order: 39 };
    if (l === "sm-f936b") return { key: "fold4", label: "Galaxy Z Fold4", order: 38 };
    if (l === "sm-f926b") return { key: "fold3", label: "Galaxy Z Fold3", order: 37 };
    if (l === "sm-n976b") return { key: "note10", label: "Galaxy Note10+", order: 36 };
    if (l === "sm-n960f") return { key: "note9", label: "Galaxy Note9", order: 35 };
    return { key: "samsung", label: `Samsung ${c}`, order: 34 };
  }
  return { key: c.toLowerCase().replace(/[^a-z0-9]+/g, "-"), label: c, order: 50 };
}
