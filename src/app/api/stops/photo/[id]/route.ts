import { getSession } from "@/lib/auth";
import { spotPhoto } from "@/lib/stops";

// A picture of a scouted stop. Crew sessions only: Crew → Stops is not public.
// Pictures are never changed in place (only added or removed), so they cache well.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) return new Response("Not found", { status: 404 });
  const photo = await spotPhoto(Number((await ctx.params).id));
  const m = photo ? /^data:(image\/jpeg);base64,(.+)$/.exec(photo) : null;
  if (!m) return new Response("No picture", { status: 404 });
  return new Response(Buffer.from(m[2], "base64"), { headers: { "content-type": m[1], "cache-control": "private, max-age=604800, immutable" } });
}
