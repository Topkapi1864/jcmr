// Reading a position out of whatever a tracking app sends. Shared by the
// vehicle address (/api/vehicles/ping/<token>) and the person address
// (/api/track/<token>).
//
// Understands, by query string or body:
//   · OwnTracks (HTTP mode)     {"_type":"location","lat":…,"lon":…,"tst":…,"acc":…,"batt":…,"vel":…,"tid":…}
//   · Traccar Client / OsmAnd   ?lat=53.8&lon=-1.6&timestamp=…&speed=…&accuracy=…&batt=…
//                               and Traccar Client's newer JSON  {"location":{"coords":{"latitude":…}}}
//   · GPSLogger custom URL      ?lat=%LAT&lon=%LON&time=%TIME&acc=%ACC&batt=%BATT
//   · anything else that sends lat + lon / lng / latitude / longitude

export type Ping = {
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null; // m/s
  battery: number | null; // 0–100
  by: string;
  at?: string;
};

export type PingResult = { kind: "position"; ping: Ping } | { kind: "ignore" } | { kind: "error"; message: string };

type Bag = Record<string, unknown>;

function pick(b: Bag, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = b[k];
    if (v === undefined || v === null || v === "") continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function when(b: Bag): string | undefined {
  const raw = b.timestamp ?? b.time ?? b.tst ?? b.fixtime;
  if (raw === undefined || raw === null || raw === "") return undefined;
  const n = Number(raw);
  if (Number.isFinite(n)) return new Date(n > 1e12 ? n : n * 1000).toISOString();
  const d = Date.parse(String(raw));
  return Number.isNaN(d) ? undefined : new Date(d).toISOString();
}

export async function readPing(req: Request): Promise<PingResult> {
  const url = new URL(req.url);
  let bag: Bag = Object.fromEntries(url.searchParams.entries());
  if (req.method === "POST") {
    const text = await req.text().catch(() => "");
    if (text) {
      try {
        const j = JSON.parse(text) as Bag;
        const loc = (j.location ?? null) as Bag | null;
        const coords = (loc?.coords ?? null) as Bag | null;
        const battery = (loc?.battery ?? null) as Bag | null;
        bag = { ...bag, ...j, ...(coords ?? {}), ...(loc?.timestamp ? { timestamp: loc.timestamp } : {}) };
        if (battery?.level != null) bag.batt = Number(battery.level) <= 1 ? Number(battery.level) * 100 : battery.level;
      } catch {
        bag = { ...bag, ...Object.fromEntries(new URLSearchParams(text).entries()) };
      }
    }
  }
  // OwnTracks also sends waypoints, transitions, cards and so on — not positions.
  if (bag._type && bag._type !== "location") return { kind: "ignore" };
  const lat = pick(bag, "lat", "latitude");
  const lng = pick(bag, "lon", "lng", "long", "longitude");
  if (lat === null || lng === null) return { kind: "error", message: "Need lat and lon" };
  // OwnTracks reports speed in km/h; everything else in m/s.
  const vel = pick(bag, "vel");
  const speed = bag._type === "location" && vel !== null ? vel / 3.6 : pick(bag, "speed", "vel");
  return {
    kind: "position",
    ping: {
      lat,
      lng,
      accuracy: pick(bag, "accuracy", "acc", "hdop"),
      speed,
      battery: pick(bag, "batt", "battery", "bat"),
      by: String(bag.id ?? bag.device_id ?? bag.tid ?? "tracker").slice(0, 40),
      at: when(bag),
    },
  };
}

/** What the app wants back. OwnTracks expects a JSON array (of messages for the phone); everyone else is happy with a 200. */
export function pingOk(): Response {
  return Response.json([], { headers: { "cache-control": "no-store" } });
}
