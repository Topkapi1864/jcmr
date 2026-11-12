import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadRoutePlan, publicResults } from "./plan-server";
import { fmtHm, planAll, publicEvents, type PlanEvent } from "./plan";

/** "Ride the route" — the quarter-mile Street View viewer in ./ride (built by tools/ride/build.mjs from
 *  content/route), served to two audiences:
 *  - crew  (/crew/ride):  the whole route, from the house.
 *  - public (/route/ride): starts PUBLIC_START_MILES into Day 1, so no photo, panorama or line
 *    shows the house. Behind the same dark switch as the other public pages. */

export type Audience = "crew" | "public";

export const PUBLIC_START_MILES = 0.5;

const ROOT = path.join(process.cwd(), "ride");
const FILE = /^(view\.html|img\/(D[12])-(\d{4})\.jpg)$/;
const DATA_OPEN = '<script id="data" type="application/json">';

type Point = { day: number; idx: number; day_miles: number; lat: number; lon: number };
/** A stop as the viewer draws it: a marker on the profile and the "Next stop" in the side panel. */
export type RideStop = { day: number; name: string; desc: string; miles: number };
type Data = { days: { day: number; line: [number, number][] }[]; points: Point[]; stops: RideStop[] };

/** Whether this audience may fetch this file. Photos before the public start are crew-only. */
export function allowed(rel: string, audience: Audience): boolean {
  const m = FILE.exec(rel);
  if (!m) return false;
  if (audience === "public" && m[2] === "D1" && Number(m[3]) / 4 < PUBLIC_START_MILES) return false;
  return true;
}

export async function readRideFile(rel: string): Promise<Buffer | null> {
  try {
    return await readFile(path.join(ROOT, rel));
  } catch {
    return null;
  }
}

/** The stops the viewer marks: the crew's planned stops from the site's own plan (Crew → Stops pins and
 *  whatever else the saved plan has on), read at serve time so a pin moved on the crew page shows without a
 *  rebuild. The crew door gets every planned stop; the public door only what the public Route page lists
 *  (`publicEvents` — the site's one rule for that), at the public pace. Start and finish are not stops. */
export async function rideStops(audience: Audience): Promise<RideStop[]> {
  const { profiles, initial } = await loadRoutePlan();
  const results = audience === "crew" ? planAll(initial, profiles) : publicResults(initial, profiles);
  const out: RideStop[] = [];
  for (const r of results) {
    const events: PlanEvent[] = audience === "crew" ? r.events : publicEvents(r.events);
    for (const e of events) {
      if (e.kind !== "named") continue;
      const desc = audience === "crew" ? `Planned about ${fmtHm(e.arrive)} · ${e.durMin} min stop` : `Planned about ${fmtHm(e.arrive)}`;
      out.push({ day: e.day, name: e.name, desc, miles: Math.round(e.mile * 100) / 100 });
    }
  }
  return out.sort((a, b) => a.day - b.day || a.miles - b.miles);
}

/** The page for one audience: the Google key put in, the stops put in from the plan (when given),
 *  and for the public the first stretch removed. */
export function renderViewer(html: string, audience: Audience, stops?: RideStop[]): string {
  // Every picture is Google Street View, asked for by the browser under this key (Vercel env GOOGLE_MAPS_KEY).
  // Without the key the page shows the line and the points but no picture.
  // The key is restricted in Google Cloud to this site and to Street View, so it is safe in the page.
  const key = process.env.GOOGLE_MAPS_KEY ?? "";
  if (/^AIza[\w-]{30,}$/.test(key)) html = html.replace("__GMAPS_KEY__", key);
  if (audience === "crew" && !stops) return html;

  const start = html.indexOf(DATA_OPEN);
  const end = html.indexOf("</script>", start);
  if (start < 0 || end < 0) throw new Error("ride viewer: data block not found");
  const data = JSON.parse(html.slice(start + DATA_OPEN.length, end)) as Data;

  if (stops) data.stops = stops;
  if (audience === "crew") {
    const json = JSON.stringify(data).replace(/<\//g, "<\\/");
    return html.slice(0, start + DATA_OPEN.length) + json + html.slice(end);
  }

  data.points = data.points.filter((p) => !(p.day === 1 && p.day_miles < PUBLIC_START_MILES));
  const first = data.points.find((p) => p.day === 1);
  const day1 = data.days.find((d) => d.day === 1);
  if (first && day1) {
    // Start the map line at the first public point too.
    let best = 0;
    let bestD = Infinity;
    day1.line.forEach(([la, lo], i) => {
      const d = (la - first.lat) ** 2 + ((lo - first.lon) * Math.cos((la * Math.PI) / 180)) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    day1.line = [[first.lat, first.lon], ...day1.line.slice(best + 1)];
  }

  const json = JSON.stringify(data).replace(/<\//g, "<\\/");
  return (html.slice(0, start + DATA_OPEN.length) + json + html.slice(end))
    .replace('<a class="back" href="/crew/route">← Route &amp; timeline</a>', '<a class="back" href="/route">← The route</a>')
    .replaceAll("jcmr-ride-pos", "jcmr-public-ride-pos");
}

/** Shared GET for the two "Ride the route" doors. The caller has already checked who may see it. */
export async function serveRide(req: Request, rel: string, audience: Audience, base: string, opts: { cache: "private" | "public"; noindex: boolean }) {
  if (rel === "") return Response.redirect(new URL(`${base}/view.html`, req.url), 307);
  if (!allowed(rel, audience)) return new Response("Not found", { status: 404 });
  const body = await readRideFile(rel);
  if (!body) return new Response("Not found", { status: 404 });

  const isPage = rel.endsWith(".html");
  const headers: Record<string, string> = {
    "Content-Type": isPage ? "text/html; charset=utf-8" : "image/jpeg",
    "Cache-Control": isPage ? `${opts.cache}, no-cache` : `${opts.cache}, max-age=604800`,
  };
  if (opts.noindex) headers["X-Robots-Tag"] = "noindex";
  if (isPage) {
    let stops: RideStop[] | undefined;
    try {
      stops = await rideStops(audience);
    } catch (e) {
      // The plan could not be read: the page still rides, with no stop markers rather than the wrong ones.
      console.error("ride viewer: stops not read from the plan", e);
      stops = [];
    }
    return new Response(renderViewer(body.toString("utf8"), audience, stops), { headers });
  }
  return new Response(new Uint8Array(body), { headers });
}
