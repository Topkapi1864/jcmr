import { getSession } from "@/lib/auth";
import { isPublicLive } from "@/lib/settings";
import { getRideWeather } from "@/lib/weather-server";

// The weather along the course as JSON: both days, every 10-mile segment with
// the hour the riders pass it. Dark while the site is dark; crew always.
//
// Whose timetable: a crew session gets the crew plan at the crew's pace unless it
// asks for `pace=public`; anyone else gets the public pace (a fixed 12 mph) —
// the crew's chosen speed never reaches the public. `full=1` adds the day
// timetables the public weather page needs to move times along with the
// riders; `fresh=1` (crew only) forces a new forecast fetch.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getSession();
  if (!(await isPublicLive()) && !session) return new Response("Not found", { status: 404 });
  const q = new URL(req.url).searchParams;
  const force = q.get("fresh") === "1" && !!session;
  const pace = session && q.get("pace") !== "public" ? "crew" : "public";
  const { weather, results } = await getRideWeather(force, pace);
  const body = q.get("full") === "1" ? { weather, results } : weather;
  return Response.json(body, { headers: { "cache-control": "private, no-store" } });
}
