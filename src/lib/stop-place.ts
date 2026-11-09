// Turning what someone pastes into a place: a Google Maps or Street View link,
// "51.4712, -0.2391", or a link with ?q= / ll= / @lat,lon / !3d…!4d… in it.
// Pure, so the browser can try it before asking the server.

export type LatLon = { lat: number; lon: number };

function ok(lat: number, lon: number): LatLon | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  // Britain, loosely: anything else is almost certainly lat and lon the wrong way round, or a typo.
  if (lat < 49 || lat > 61 || lon < -9 || lon > 3) return null;
  return { lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6 };
}

export function parsePlace(raw: string): LatLon | null {
  let s = (raw ?? "").trim();
  if (!s) return null;
  try {
    s = decodeURIComponent(s);
  } catch {
    /* keep it as it is */
  }
  const num = "(-?\\d{1,3}(?:\\.\\d+)?)";
  const tries: RegExp[] = [
    // A pin dropped on a place: the place's own position.
    new RegExp(`!3d${num}!4d${num}`),
    // Street View and map views.
    new RegExp(`@${num},\\s*${num}`),
    // Search, directions and API links.
    new RegExp(`[?&](?:q|query|ll|destination|viewpoint|center|daddr|cbll)=(?:loc:)?${num},\\s*${num}`),
    // Plain "lat, lon" (also "lat lon").
    new RegExp(`^${num}\\s*[, ]\\s*${num}$`),
  ];
  for (const re of tries) {
    const m = re.exec(s);
    if (m) {
      const p = ok(Number(m[1]), Number(m[2]));
      if (p) return p;
    }
  }
  // Degrees with N/W: 51.4712° N, 0.2391° W
  const dm = /(\d{1,2}(?:\.\d+)?)\s*°?\s*([NS])[\s,]+(\d{1,3}(?:\.\d+)?)\s*°?\s*([EW])/i.exec(s);
  if (dm) return ok(Number(dm[1]) * (/s/i.test(dm[2]) ? -1 : 1), Number(dm[3]) * (/w/i.test(dm[4]) ? -1 : 1));
  return null;
}

/** A short share link (maps.app.goo.gl, goo.gl/maps) that only the server can follow. */
export function isShortMapsLink(raw: string): boolean {
  return /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs)\//i.test((raw ?? "").trim());
}

export const streetViewUrl = (p: LatLon) => `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${p.lat},${p.lon}`;
export const mapsUrl = (p: LatLon) => `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}`;
export const directionsUrl = (p: LatLon) => `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}`;

export const SPOT_KIND_LABEL: Record<string, string> = { hourly: "60 min stop", long: "Longer stop (180 min)", other: "Other stop" };
