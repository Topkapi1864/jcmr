// In the browser: make a picked video fit the board, the way a picked picture
// is shrunk before it is sent (shrink-image.ts).
//
// A video straight from a phone is tens or hundreds of megabytes. Here it is
// re-encoded on the phone itself to an MP4 every browser plays (H.264 picture,
// AAC sound), at most 720p, using the phone's own video hardware (WebCodecs,
// driven by the mediabunny library). A clip that is already small and already
// in that form is only re-wrapped: nothing is re-encoded and nothing is lost.
// What the plan is for a given clip is decided in video-rules.ts.
//
// Phones differ in what they can do, so each step has somewhere to fall back to:
// shrink it; else send it as it is, re-wrapped as an MP4; else send the very
// file that was picked. Whatever comes out must still be under VIDEO_MAX_BYTES,
// and must still have both its picture and its sound.
//
// This module is only ever loaded by the picker once a video has been picked
// (a dynamic import), so the library is not part of any page until then.
import { BlobSource, BufferTarget, CanvasSink, Conversion, Input, MATROSKA, MP4, Mp4OutputFormat, MPEG_TS, Output, QTFF, WEBM, type ConversionOptions } from "mediabunny";
import { planVideo, VIDEO_MAX_BYTES, VIDEO_POSTER_MAX_CHARS, videoMime, type VideoFacts } from "./video-rules";

// What a phone, a camera or a screen recording hands over: MP4, QuickTime (.mov), WebM, Matroska, and camcorder .mts.
const FORMATS = [MP4, QTFF, WEBM, MATROSKA, MPEG_TS];
const open = (blob: Blob) => new Input({ source: new BlobSource(blob), formats: FORMATS });

export type ReadyVideo = {
  blob: Blob;
  seconds: number;
  width: number;
  height: number;
  /** A still from early in the video, as a JPEG data URL, when one could be made. */
  poster: string | null;
  /** shrunk: re-encoded smaller. copied: already fine, only re-wrapped. as-is: this browser could not shrink it, so it goes up as it came. */
  how: "shrunk" | "copied" | "as-is";
  /** The size of the file that was picked. */
  from: number;
};

export type VideoProblemKind = "not-video" | "no-picture" | "too-long" | "too-big" | "cancelled";

export class VideoProblem extends Error {
  constructor(
    public kind: VideoProblemKind,
    public seconds = 0,
  ) {
    super(kind);
  }
}

export type ShrinkProgress = (stage: "reading" | "shrinking", fraction: number) => void;

const POSTER_SIDE = 960;

export async function readyVideo(file: File, onProgress: ShrinkProgress, signal: AbortSignal): Promise<ReadyVideo> {
  const stopIfCancelled = () => {
    if (signal.aborted) throw new VideoProblem("cancelled");
  };
  onProgress("reading", 0);
  const facts = await readFacts(file).catch(() => null);
  stopIfCancelled();
  if (!facts) return asPicked(file, null);

  const plan = planVideo(facts);
  if (plan.how === "refuse") throw new VideoProblem(plan.why, facts.seconds);

  let out: Blob | null = null;
  let how: ReadyVideo["how"] = "copied";
  let width = facts.width;
  let height = facts.height;

  if (plan.how === "shrink") {
    let bitrate = plan.videoBitrate;
    for (let attempt = 0; attempt < 2 && !out; attempt++) {
      const made = await convert(file, signal, (p) => onProgress("shrinking", p), {
        video: { width: plan.width, height: plan.height, fit: "fill", codec: "avc", bitrate, keyFrameInterval: 2, forceTranscode: true, ...(plan.fps ? { frameRate: plan.fps } : {}) },
        audio: { codec: "aac" },
      }).catch(() => null);
      stopIfCancelled();
      if (!made) break;
      if (made.size <= VIDEO_MAX_BYTES) out = made;
      else bitrate = Math.max(200_000, Math.floor(bitrate * ((VIDEO_MAX_BYTES * 0.85) / made.size))); // the encoder overshot: once more, lower
    }
    if (out) {
      how = "shrunk";
      width = plan.width;
      height = plan.height;
    }
  }

  if (!out) {
    // Already fine, or this browser could not shrink it: the same picture and sound, re-wrapped as an MP4 that starts playing at once.
    const made = await convert(file, signal, () => {}, { copy: { mode: "forced" } }).catch(() => null);
    stopIfCancelled();
    if (made && made.size <= VIDEO_MAX_BYTES) {
      out = made;
      how = plan.how === "copy" ? "copied" : "as-is";
    }
  }

  if (!out) return asPicked(file, facts);
  onProgress("shrinking", 1);
  const poster = await makePoster(out, facts.seconds).catch(() => null);
  stopIfCancelled();
  return { blob: out, seconds: facts.seconds, width, height, poster, how, from: file.size };
}

async function readFacts(file: File): Promise<VideoFacts> {
  const input = open(file);
  try {
    const video = await input.getPrimaryVideoTrack();
    const audio = await input.getPrimaryAudioTrack();
    const seconds = await input.computeDuration();
    const stats = video ? await video.computePacketStats(90).catch(() => null) : null;
    return {
      bytes: file.size,
      seconds,
      width: video ? await video.getDisplayWidth() : 0,
      height: video ? await video.getDisplayHeight() : 0,
      videoCodec: video ? ((await video.getCodec()) ?? "unknown") : null,
      audioCodec: audio ? ((await audio.getCodec()) ?? "unknown") : null,
      fps: stats && Number.isFinite(stats.averagePacketRate) ? stats.averagePacketRate : null,
    };
  } finally {
    input.dispose();
  }
}

type ConvertOptions = Pick<ConversionOptions, "video" | "audio" | "copy">;

/** One pass through mediabunny to an MP4 held in memory. Null if the picture or the sound would be lost on the way. */
async function convert(file: File, signal: AbortSignal, onProgress: (fraction: number) => void, options: ConvertOptions): Promise<Blob | null> {
  const input = open(file);
  try {
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
    const conversion = await Conversion.init({ input, output, tracks: "primary", showWarnings: false, ...options });
    const kept = new Set(conversion.utilizedTracks.map((t) => t.id));
    const video = await input.getPrimaryVideoTrack();
    const audio = await input.getPrimaryAudioTrack();
    if (!conversion.isValid || !video || !kept.has(video.id) || (audio && !kept.has(audio.id))) return null;
    conversion.onProgress = onProgress;
    const stop = () => void conversion.cancel();
    signal.addEventListener("abort", stop, { once: true });
    try {
      if (signal.aborted) return null;
      await conversion.execute();
    } finally {
      signal.removeEventListener("abort", stop);
    }
    const buffer = output.target.buffer;
    return buffer && buffer.byteLength > 0 ? new Blob([buffer], { type: "video/mp4" }) : null;
  } finally {
    input.dispose();
  }
}

/** The last resort: the very file that was picked, if it is a video this browser plays and is small enough. */
async function asPicked(file: File, facts: VideoFacts | null): Promise<ReadyVideo> {
  const mime = videoMime(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
  if (!mime) throw new VideoProblem("not-video");
  const seen = await look(file).catch(() => null);
  const seconds = facts?.seconds || seen?.seconds || 0;
  const width = facts?.width || seen?.width || 0;
  const height = facts?.height || seen?.height || 0;
  if (!seen && !facts) throw new VideoProblem("not-video");
  if (!(width > 0) || !(height > 0)) throw new VideoProblem("no-picture");
  if (file.size > VIDEO_MAX_BYTES) throw new VideoProblem("too-big", seconds);
  return { blob: file.slice(0, file.size, mime), seconds, width, height, poster: seen?.poster ?? null, how: "as-is", from: file.size };
}

/** A still about a second in, drawn by the video decoder. Falls back to a hidden <video> where that decoder can't read the clip. */
async function makePoster(blob: Blob, seconds: number): Promise<string | null> {
  const input = open(blob);
  try {
    const track = await input.getPrimaryVideoTrack();
    if (track && (await track.canDecode())) {
      const w = await track.getDisplayWidth();
      const h = await track.getDisplayHeight();
      const scale = Math.min(1, POSTER_SIDE / Math.max(w, h));
      const sink = new CanvasSink(track, { width: Math.max(2, Math.round(w * scale)), height: Math.max(2, Math.round(h * scale)), fit: "fill" });
      const first = await track.getFirstTimestamp();
      const frame = (await sink.getCanvas(first + stillAt(seconds))) ?? (await sink.getCanvas(first));
      if (frame) {
        const jpeg = toJpeg(frame.canvas, frame.canvas.width, frame.canvas.height);
        if (jpeg) return jpeg;
      }
    }
  } catch {
    // fall through to the element
  } finally {
    input.dispose();
  }
  return (await look(blob).catch(() => null))?.poster ?? null;
}

const stillAt = (seconds: number) => (seconds > 3 ? 1 : seconds / 3);

function toJpeg(source: CanvasImageSource, width: number, height: number): string | null {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, width, height);
  for (const q of [0.8, 0.6, 0.4]) {
    const url = c.toDataURL("image/jpeg", q);
    if (url.startsWith("data:image/jpeg") && url.length <= VIDEO_POSTER_MAX_CHARS) return url;
  }
  return null;
}

/** What a hidden <video> makes of it: its length, its size on screen, and a still. Rejects if this browser can't play it. */
function look(blob: Blob): Promise<{ seconds: number; width: number; height: number; poster: string | null }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const v = document.createElement("video");
    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      v.removeAttribute("src");
      v.load();
      URL.revokeObjectURL(url);
      fn();
    };
    const facts = () => ({ seconds: Number.isFinite(v.duration) ? v.duration : 0, width: v.videoWidth, height: v.videoHeight });
    const timer = setTimeout(() => (v.videoWidth ? done(() => resolve({ ...facts(), poster: null })) : done(() => reject(new Error("timeout")))), 6000);
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.onerror = () => done(() => reject(new Error("unplayable")));
    v.onloadeddata = () => {
      const at = stillAt(Number.isFinite(v.duration) ? v.duration : 0);
      v.onseeked = () => {
        const f = facts();
        const scale = Math.min(1, POSTER_SIDE / Math.max(f.width, f.height, 1));
        const poster = f.width ? toJpeg(v, Math.max(2, Math.round(f.width * scale)), Math.max(2, Math.round(f.height * scale))) : null;
        done(() => resolve({ ...f, poster }));
      };
      v.currentTime = at;
    };
    v.src = url;
  });
}
