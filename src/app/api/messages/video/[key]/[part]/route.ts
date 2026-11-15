import { getSession } from "@/lib/auth";
import { cdnTagHeader } from "@/lib/cdn";
import { putVideoPart, videoCdnTag, videoPart, videoPoster } from "@/lib/message-video";
import { isPublicLive } from "@/lib/settings";
import { VIDEO_PART_BYTES } from "@/lib/video-rules";
import { refuseVideo } from "../../answers";

// One piece of a board video: /api/messages/video/<key>/<n>, and its still at
// /api/messages/video/<key>/poster.
//
// GET is behind the same gate as the board: anyone once the public site is
// live, only crew sessions before that, and only while the video's message is
// on the board. The key is random and a piece's bytes never change under its
// address, so the browser may keep a piece for good and the CDN keeps it for a
// week. That is what lets a video be watched many times without the site
// fetching it from the database each time. Each answer is filed in the CDN
// under the video's own tag, and taking the video down clears that tag
// (messages.ts), so a video that is removed is gone from the CDN as well.
//
// PUT is the upload: a crew session sending piece n of an upload it started.
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ key: string; part: string }> };

const KEPT = "public, max-age=31536000, s-maxage=604800, immutable";
const CREW_ONLY = "private, max-age=3600";
const gone = () => new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });

export async function GET(_req: Request, ctx: Ctx) {
  const live = await isPublicLive();
  if (!live && !(await getSession())) return gone();
  const { key, part } = await ctx.params;
  const cache = { "cache-control": live ? KEPT : CREW_ONLY, ...(live ? cdnTagHeader(videoCdnTag(key)) : {}) };

  if (part === "poster") {
    const m = /^data:(image\/jpeg);base64,(.+)$/.exec((await videoPoster(key)) ?? "");
    if (!m) return gone();
    return new Response(Buffer.from(m[2], "base64"), { headers: { "content-type": m[1], ...cache } });
  }

  if (!/^\d{1,3}$/.test(part)) return gone();
  const data = await videoPart(key, Number(part));
  if (!data) return gone();
  return new Response(data, { headers: { "content-type": "application/octet-stream", "content-length": String(data.byteLength), ...cache } });
}

export async function PUT(req: Request, ctx: Ctx) {
  const s = await getSession();
  if (!s) return refuseVideo("signed-out");
  const { key, part } = await ctx.params;
  if (!/^\d{1,3}$/.test(part)) return refuseVideo("bad-part");
  if (Number(req.headers.get("content-length") ?? 0) > VIDEO_PART_BYTES) return refuseVideo("bad-part");
  const data = new Uint8Array(await req.arrayBuffer());
  const r = await putVideoPart(s, key, Number(part), data);
  return r === "ok" ? Response.json({ ok: true }) : refuseVideo(r);
}
