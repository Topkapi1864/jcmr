import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

/** "Ride the route" — the quarter-mile street-photo viewer in ./ride, served to two audiences:
 *  - crew  (/crew/ride):  the whole route, from the house.
 *  - public (/route/ride): starts PUBLIC_START_MILES into Day 1, so no photo, panorama or line
 *    shows the house. Behind the same dark switch as the other public pages. */

export type Audience = "crew" | "public";

export const PUBLIC_START_MILES = 0.5;

const ROOT = path.join(process.cwd(), "ride");
const FILE = /^(view\.html|img\/(D[12])-(\d{4})\.jpg)$/;
const DATA_OPEN = '<script id="data" type="application/json">';

type Point = { day: number; idx: number; day_miles: number; lat: number; lon: number };
type Data = { days: { day: number; line: [number, number][] }[]; points: Point[] };

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

/** The page for one audience: the Google key put in, and for the public the first stretch removed. */
export function renderViewer(html: string, audience: Audience): string {
  // Google Street View fills Mapillary's gaps when a browser key is configured (Vercel env GOOGLE_MAPS_KEY).
  // The key is restricted in Google Cloud to this site and to Street View, so it is safe in the page.
  const key = process.env.GOOGLE_MAPS_KEY ?? "";
  if (/^AIza[\w-]{30,}$/.test(key)) html = html.replace("__GMAPS_KEY__", key);
  if (audience === "crew") return html;

  const start = html.indexOf(DATA_OPEN);
  const end = html.indexOf("</script>", start);
  if (start < 0 || end < 0) throw new Error("ride viewer: data block not found");
  const data = JSON.parse(html.slice(start + DATA_OPEN.length, end)) as Data;

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
  if (isPage) return new Response(renderViewer(body.toString("utf8"), audience), { headers });
  return new Response(new Uint8Array(body), { headers });
}
