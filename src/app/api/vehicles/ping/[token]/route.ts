import { addPosition, vehicleByToken } from "@/lib/vehicles";
import { rateLimited } from "@/lib/util";

// Where a tracker app sends a vehicle's position. The address carries the
// vehicle's own token (Crew → Vehicles → a vehicle → Location), so no sign-in.
//
// Understands, by query string or body:
//   · Traccar Client / OsmAnd   ?lat=53.8&lon=-1.6&timestamp=…&speed=…&accuracy=…&batt=…
//                               and Traccar Client's newer JSON  {"location":{"coords":{"latitude":…}}}
//   · OwnTracks (HTTP mode)     {"_type":"location","lat":…,"lon":…,"tst":…,"acc":…,"batt":…}
//   · GPSLogger custom URL      ?lat=%LAT&lon=%LON&time=%TIME&acc=%ACC&batt=%BATT
//   · anything else that sends lat + lon / lng / latitude / longitude
export const dynamic = "force-dynamic";

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

async function handle(req: Request, token: string) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "?";
  if (rateLimited(`ping:${ip}`, 240, 60_000)) return new Response("Slow down", { status: 429 });
  const vehicle = await vehicleByToken(token);
  if (!vehicle || !vehicle.active) {
    await new Promise((r) => setTimeout(r, 300));
    return new Response("Not found", { status: 404 });
  }
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
  if (bag._type && bag._type !== "location") return Response.json([]); // OwnTracks sends other message types too
  const lat = pick(bag, "lat", "latitude");
  const lng = pick(bag, "lon", "lng", "long", "longitude");
  if (lat === null || lng === null) return new Response("Need lat and lon", { status: 400 });
  const ok = await addPosition(vehicle.id, {
    lat,
    lng,
    accuracy: pick(bag, "accuracy", "acc", "hdop"),
    speed: pick(bag, "speed", "vel"),
    battery: pick(bag, "batt", "battery", "bat"),
    source: "tracker",
    by: String(bag.id ?? bag.device_id ?? bag.tid ?? "tracker").slice(0, 40),
    at: when(bag),
  });
  if (!ok) return new Response("Bad position", { status: 400 });
  // OwnTracks expects a JSON array back; everyone else is happy with 200.
  return Response.json([], { headers: { "cache-control": "no-store" } });
}

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  return handle(req, (await ctx.params).token);
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  return handle(req, (await ctx.params).token);
}
