import type { VideoRefusal } from "@/lib/message-video";

// How the upload routes say no: a status and a one-word reason the picker turns into a sentence.
const STATUS: Record<VideoRefusal | "signed-out", number> = {
  "signed-out": 401,
  denied: 403,
  "not-found": 404,
  "too-big": 413,
  "too-long": 413,
  full: 507,
  empty: 400,
  "bad-poster": 400,
  "bad-part": 400,
  "not-video": 415,
  incomplete: 409,
};

export function refuseVideo(why: VideoRefusal | "signed-out"): Response {
  return Response.json({ error: why }, { status: STATUS[why], headers: { "cache-control": "no-store" } });
}
