// A video on the message board: how big it may be, and how a picked one is
// made to fit. Plain numbers and a pure plan, shared by the browser (which
// shrinks and sends it) and the server (which checks what arrives).

/** A video is stored and served in pieces of this size: no bigger than the
 *  pictures the site already sends and stores in one go, so well inside what
 *  one request to the site, and one statement to the database, will carry. */
export const VIDEO_PART_BYTES = 512 * 1024;
/** The biggest a video may be once it has been made ready to send. */
export const VIDEO_MAX_BYTES = 40 * 1024 * 1024;
/** The longest a video may run. */
export const VIDEO_MAX_SECONDS = 300;
/** All the board's videos together. The database's free plan holds 5 GB for everything. */
export const VIDEO_STORE_MAX_BYTES = 2.5 * 1024 * 1024 * 1024;
/** The still shown before a video plays: a small JPEG data URL. */
export const VIDEO_POSTER_MAX_CHARS = 400_000;

/** A video as the pages need it: where its pieces are, and enough to draw its box before any of it has loaded. */
export type BoardVideo = {
  src: string; // /api/messages/video/<key>; piece n is at <src>/<n>, the still at <src>/poster
  parts: number;
  bytes: number;
  type: string; // video/mp4 or video/webm
  seconds: number;
  width: number;
  height: number;
  poster: string | null;
};

/** What the browser found in the picked file. */
export type VideoFacts = {
  bytes: number;
  seconds: number;
  width: number; // as displayed, after any rotation
  height: number;
  videoCodec: string | null; // "avc" (H.264), "hevc", "vp9" …
  audioCodec: string | null; // "aac", "opus" …; null when there is no sound
  fps: number | null;
};

export type VideoPlan =
  /** Already small, and in the form every phone plays: only re-wrapped, nothing re-encoded. */
  | { how: "copy" }
  /** Re-encoded to H.264 at this size and rate. `fps` is set when the frame rate is brought down to it. */
  | { how: "shrink"; width: number; height: number; videoBitrate: number; fps: number | null }
  | { how: "refuse"; why: "no-picture" | "too-long" };

// What shrinking aims under: room to spare below VIDEO_MAX_BYTES for an encoder that overshoots.
const TARGET_BYTES = 34 * 1024 * 1024;
const TOP_VIDEO_BPS = 2_200_000; // 720p from a phone looks fine here
const AUDIO_BPS = 128_000; // the sound is carried over as it is; allowed for at about this
const EASY_BPS = 3_600_000; // a clip already at or under this is left alone

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/**
 * Leave it, shrink it, or refuse it. Clips up to about two minutes go to 720p
 * at 2.2 Mbit/s (about 17 MB a minute); longer ones get a lower rate and a
 * smaller frame so that five minutes still fits.
 */
export function planVideo(f: VideoFacts): VideoPlan {
  if (!f.videoCodec || !(f.width > 0) || !(f.height > 0) || !(f.seconds > 0)) return { how: "refuse", why: "no-picture" };
  if (f.seconds > VIDEO_MAX_SECONDS + 1) return { how: "refuse", why: "too-long" };

  const plain = f.videoCodec === "avc" && (f.audioCodec === null || f.audioCodec === "aac");
  const easy = f.bytes <= 1_500_000 || f.bytes <= (f.seconds * EASY_BPS) / 8;
  if (plain && easy && f.bytes <= TARGET_BYTES && Math.max(f.width, f.height) <= 1920) return { how: "copy" };

  const room = (TARGET_BYTES * 8) / f.seconds - (f.audioCodec ? AUDIO_BPS : 0);
  const side = room >= 1_400_000 ? 1280 : room >= 900_000 ? 960 : 854;
  const scale = Math.min(1, side / Math.max(f.width, f.height));
  const width = even(f.width * scale);
  const height = even(f.height * scale);
  const videoBitrate = Math.round(Math.max(250_000, Math.min(TOP_VIDEO_BPS, room, width * height * 3)));
  return { how: "shrink", width, height, videoBitrate, fps: f.fps && f.fps > 32 ? 30 : null };
}

/** How many pieces a video of this size is cut into. */
export function videoPartCount(bytes: number): number {
  return Math.ceil(bytes / VIDEO_PART_BYTES);
}

/** The size piece `n` must be: every piece is full but the last. */
export function videoPartSize(bytes: number, n: number): number {
  const parts = videoPartCount(bytes);
  return n < parts - 1 ? VIDEO_PART_BYTES : bytes - VIDEO_PART_BYTES * (parts - 1);
}

/** What kind of file these first bytes begin: MP4/MOV, WebM, or not a video we keep. */
export function videoMime(first: Uint8Array): "video/mp4" | "video/webm" | null {
  if (first.length >= 12) {
    const box = String.fromCharCode(first[4], first[5], first[6], first[7]);
    if (["ftyp", "moov", "mdat", "wide", "free", "skip"].includes(box)) return "video/mp4";
  }
  if (first.length >= 4 && first[0] === 0x1a && first[1] === 0x45 && first[2] === 0xdf && first[3] === 0xa3) return "video/webm";
  return null;
}

/** "0:42", "3:05". */
export function fmtVideoLength(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "640 KB", "6.1 MB", "17 MB". */
export function fmtVideoSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}
