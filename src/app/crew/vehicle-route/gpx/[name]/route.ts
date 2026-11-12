import { getSession } from "@/lib/auth";
import { VEHICLE_FILES, gpxWithStops, vehicleStops } from "@/lib/vehicle-route";

// A vehicle GPX: the committed track with the day's stops added as waypoints from the
// crew's plan and pins as they are now. Crew sessions only: the proxy turns a signed-out
// request for anything under /crew to the sign-in page before it gets here, and this
// checks the session again for itself. Never cached by a shared cache, never indexed.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  if (!(await getSession())) return new Response("Not found", { status: 404 });
  const { name } = await ctx.params;
  const file = VEHICLE_FILES.find((f) => f.filename === name);
  const xml = file ? gpxWithStops(file.key, await vehicleStops()) : null;
  if (!file || !xml) return new Response("No such file", { status: 404 });
  const bytes = new TextEncoder().encode(xml);
  return new Response(bytes, {
    headers: {
      "content-type": "application/gpx+xml",
      "content-length": String(bytes.length),
      "content-disposition": `attachment; filename="${file.filename}"`,
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
