import { getSession } from "@/lib/auth";
import { startVideoUpload } from "@/lib/message-video";
import { VIDEO_PART_BYTES } from "@/lib/video-rules";
import { refuseVideo } from "./answers";

// Step one of sending a video with a board message (Crew → Messages): say how
// big it is and how long, and send the still. The answer is the key its pieces
// are then PUT under, one at a time: /api/messages/video/<key>/<n>.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return refuseVideo("signed-out");
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || typeof b !== "object") return refuseVideo("empty");
  const r = await startVideoUpload(s, b);
  return r.ok ? Response.json({ key: r.key, parts: r.parts, partBytes: VIDEO_PART_BYTES }) : refuseVideo(r.why);
}
