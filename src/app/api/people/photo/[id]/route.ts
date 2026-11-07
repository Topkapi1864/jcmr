import { getSession } from "@/lib/auth";
import { personPhoto } from "@/lib/people";

// A rider's or crew member's picture, from Crew → People. Kept in the database
// (shrunk in the browser before upload). Crew sessions only for now: the public
// crew page is still "to be announced", and these are people's faces, so opening
// them up is a decision for when that page is built, not a side effect of a URL.
// The URL carries ?v=<updated at>, which changes with every new picture, so it can be cached.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return new Response("Sign in", { status: 401 });
  const row = await personPhoto(Number((await ctx.params).id));
  const m = row ? /^data:(image\/jpeg);base64,(.+)$/.exec(row.photo) : null;
  if (!m) return new Response("No picture", { status: 404 });
  return new Response(Buffer.from(m[2], "base64"), {
    headers: { "content-type": m[1], "cache-control": "private, max-age=86400" },
  });
}
