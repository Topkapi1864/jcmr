import { getSession } from "@/lib/auth";
import { dropVideoUpload, finishVideoUpload } from "@/lib/message-video";
import { refuseVideo } from "../answers";

// The last step of sending a video (POST: every piece is in), or taking an
// unposted one off again (DELETE). Only whoever started the upload, or an admin.
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ key: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const s = await getSession();
  if (!s) return refuseVideo("signed-out");
  const r = await finishVideoUpload(s, (await ctx.params).key);
  return r === "ok" ? Response.json({ ok: true }) : refuseVideo(r);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const s = await getSession();
  if (!s) return refuseVideo("signed-out");
  const r = await dropVideoUpload(s, (await ctx.params).key);
  return r === "ok" ? Response.json({ ok: true }) : refuseVideo(r);
}
