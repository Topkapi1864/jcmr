import { isPublicLive } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const live = await isPublicLive();
  const body = live ? "User-agent: *\nDisallow: /crew/\nDisallow: /api/\n" : "User-agent: *\nDisallow: /\n";
  return new Response(body, { headers: { "content-type": "text/plain" } });
}
