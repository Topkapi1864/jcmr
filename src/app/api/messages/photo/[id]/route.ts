import { getSession } from "@/lib/auth";
import { messagePhoto } from "@/lib/messages";
import { isPublicLive } from "@/lib/settings";

// The picture on a board message. Behind the same gate as the board itself:
// anyone once the public site is live, only crew sessions before that.
// The URL carries a version (?v=) that changes on every edit, so it can be cached.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const live = await isPublicLive();
  if (!live && !(await getSession())) return new Response("Not found", { status: 404 });
  const photo = await messagePhoto(Number((await ctx.params).id));
  const m = photo ? /^data:(image\/jpeg);base64,(.+)$/.exec(photo) : null;
  if (!m) return new Response("No picture", { status: 404 });
  return new Response(Buffer.from(m[2], "base64"), {
    headers: { "content-type": m[1], "cache-control": `${live ? "public" : "private"}, max-age=86400` },
  });
}
