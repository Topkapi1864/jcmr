import { livePayload } from "@/lib/live";
import { isPublicLive } from "@/lib/settings";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isPublicLive()) && !(await getSession())) return new Response("Not found", { status: 404 });
  return Response.json(await livePayload(), { headers: { "cache-control": "no-store" } });
}
