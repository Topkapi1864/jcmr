import fs from "node:fs";
import path from "node:path";

// GPX → GeoJSON with no dependency: we only need the track points.

export type DayGeo = {
  day: number;
  present: boolean;
  feature: GeoJSON.Feature<GeoJSON.LineString> | null;
};

export function gpxPathFor(day: number): string {
  return path.join(process.cwd(), "content", "route", `day${day}.gpx`);
}

export function gpxExists(day: number): boolean {
  return fs.existsSync(gpxPathFor(day));
}

export function gpxToLine(xml: string, maxPoints = 4000): GeoJSON.Feature<GeoJSON.LineString> | null {
  const pts: [number, number][] = [];
  const re = /<(?:trkpt|rtept)\s+[^>]*?lat="(-?[\d.]+)"[^>]*?lon="(-?[\d.]+)"/g;
  const re2 = /<(?:trkpt|rtept)\s+[^>]*?lon="(-?[\d.]+)"[^>]*?lat="(-?[\d.]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) pts.push([parseFloat(m[2]), parseFloat(m[1])]);
  if (!pts.length) while ((m = re2.exec(xml))) pts.push([parseFloat(m[1]), parseFloat(m[2])]);
  if (!pts.length) return null;
  // Thin very dense tracks so the page stays light.
  const step = Math.max(1, Math.ceil(pts.length / maxPoints));
  const coords = pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
  return { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } };
}

export function loadDay(day: number): DayGeo {
  const p = gpxPathFor(day);
  if (!fs.existsSync(p)) return { day, present: false, feature: null };
  const xml = fs.readFileSync(p, "utf8");
  return { day, present: true, feature: gpxToLine(xml) };
}
