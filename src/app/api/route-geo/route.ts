import fs from "node:fs";
import { gpxExists, gpxPathFor, loadDay } from "@/lib/gpx";
import { loadProfiles } from "@/lib/route";
import { isPublicLive } from "@/lib/settings";
import { getSession } from "@/lib/auth";

// GeoJSON for the map (both days) or the raw GPX for download. Dark while the site is dark.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await isPublicLive()) && !(await getSession())) return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  const day = Number(url.searchParams.get("day"));
  if (url.searchParams.get("format") === "gpx") {
    if (!(day === 1 || day === 2) || !gpxExists(day)) return new Response("Not found", { status: 404 });
    return new Response(fs.readFileSync(gpxPathFor(day)), {
      headers: { "content-type": "application/gpx+xml", "content-disposition": `attachment; filename="jcmr-day${day}.gpx"` },
    });
  }
  if (url.searchParams.get("format") === "profile") {
    // Everything the planner and the crew map need: points with miles and
    // elevation, Simon's waypoints, the towns the line passes.
    return Response.json(loadProfiles(), { headers: { "cache-control": "private, max-age=600" } });
  }
  const days = [loadDay(1), loadDay(2)];
  return Response.json(
    { type: "FeatureCollection", features: days.filter((d) => d.feature).map((d) => ({ ...d.feature!, properties: { day: d.day } })) },
    { headers: { "cache-control": "public, max-age=3600" } },
  );
}
