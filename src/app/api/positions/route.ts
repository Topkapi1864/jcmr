import { getSession } from "@/lib/auth";
import { trackingFeed } from "@/lib/tracking";

// The crew map's feed: every vehicle and every person with a latest fix and a short trail.
// ?vehicle=<id> narrows it to one vehicle (the vehicle page's own map).
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const s = await getSession();
  if (!s) return new Response("Sign in", { status: 401 });
  const only = Number(new URL(req.url).searchParams.get("vehicle")) || null;
  return Response.json(await trackingFeed({ vehicleId: only }), { headers: { "cache-control": "no-store" } });
}
