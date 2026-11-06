import { getSession } from "@/lib/auth";
import { trackingFeed } from "@/lib/tracking";

// Kept for anything still pointing here; /api/positions is the same feed with the people too.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const s = await getSession();
  if (!s) return new Response("Sign in", { status: 401 });
  const only = Number(new URL(req.url).searchParams.get("vehicle")) || null;
  const feed = await trackingFeed({ vehicleId: only });
  return Response.json({ now: feed.now, vehicles: feed.vehicles }, { headers: { "cache-control": "no-store" } });
}
