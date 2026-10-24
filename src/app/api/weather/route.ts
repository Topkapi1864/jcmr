import { getSession } from "@/lib/auth";
import { isPublicLive } from "@/lib/settings";
import { getRideWeather } from "@/lib/weather-server";

// The weather along the course as JSON: both days, every 10-mile segment with
// the hour the riders pass it. Dark while the site is dark; crew always.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await isPublicLive()) && !(await getSession())) return new Response("Not found", { status: 404 });
  const force = new URL(req.url).searchParams.get("fresh") === "1" && !!(await getSession());
  const { weather } = await getRideWeather(force);
  return Response.json(weather, { headers: { "cache-control": "private, no-store" } });
}
