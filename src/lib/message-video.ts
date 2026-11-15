import { randomBytes } from "node:crypto";
import type { InStatement } from "@libsql/client";
import { and, eq, isNull, sql } from "drizzle-orm";
import { client, db, ready, schema } from "@/db/client";
import type { Session } from "./session";
import { nowIso } from "./time";
import { VIDEO_MAX_BYTES, VIDEO_MAX_SECONDS, VIDEO_POSTER_MAX_CHARS, VIDEO_STORE_MAX_BYTES, videoMime, videoPartCount, videoPartSize, type BoardVideo } from "./video-rules";

// A video on a board message. A phone video is far bigger than one request to
// the site may carry, so the browser shrinks it and sends it in pieces of
// VIDEO_PART_BYTES: start (the facts and the still), each piece, finish. Posting
// the message then claims the finished upload. The pieces are served one at a
// time by /api/messages/video/<key>/<n>, each small enough for the CDN to keep,
// and the page puts them back together to play.
//
// The key is random and is the video's address, so a piece's bytes never change
// under its URL. An upload nobody posted is cleared after a day.

type Actor = Pick<Session, "pid" | "name" | "role">;

/** A message's video as lists carry it: no bytes, no still. */
export type MessageVideoLite = { key: string; mime: string; bytes: number; parts: number; seconds: number; width: number; height: number; hasPoster: boolean };

export type VideoRefusal = "empty" | "too-big" | "too-long" | "full" | "bad-poster" | "not-found" | "denied" | "bad-part" | "not-video" | "incomplete";

const UNPOSTED_HOURS = 24;

/** The columns a message list joins in for its video. */
export const VIDEO_LITE = {
  videoKey: schema.messageVideos.key,
  videoMime: schema.messageVideos.mime,
  videoBytes: schema.messageVideos.bytes,
  videoParts: schema.messageVideos.parts,
  videoSeconds: schema.messageVideos.seconds,
  videoWidth: schema.messageVideos.width,
  videoHeight: schema.messageVideos.height,
  videoHasPoster: sql<number | null>`${schema.messageVideos.poster} is not null`,
};

/** The join that finds a message's video: the one finished upload it holds that has not been taken down. */
export const liveVideoOf = and(eq(schema.messageVideos.messageId, schema.messages.id), eq(schema.messageVideos.deleted, false), eq(schema.messageVideos.complete, true));

export function videoLite(r: { videoKey: string | null; videoMime: string | null; videoBytes: number | null; videoParts: number | null; videoSeconds: number | null; videoWidth: number | null; videoHeight: number | null; videoHasPoster: number | boolean | null }): MessageVideoLite | null {
  if (!r.videoKey) return null;
  return { key: r.videoKey, mime: r.videoMime || "video/mp4", bytes: r.videoBytes ?? 0, parts: r.videoParts ?? 0, seconds: r.videoSeconds ?? 0, width: r.videoWidth ?? 0, height: r.videoHeight ?? 0, hasPoster: !!r.videoHasPoster };
}

/** The tag every piece of a video is kept under in the CDN, so that taking the video down can clear them (cdn.ts). */
export const videoCdnTag = (key: string) => `video-${key}`;

/** Where a video is served, for the pages. */
export function boardVideo(v: MessageVideoLite): BoardVideo {
  const src = `/api/messages/video/${v.key}`;
  return { src, parts: v.parts, bytes: v.bytes, type: v.mime, seconds: v.seconds, width: v.width, height: v.height, poster: v.hasPoster ? `${src}/poster` : null };
}

function cleanPoster(raw: unknown): string | null | "bad" {
  if (raw == null || raw === "") return null;
  if (typeof raw !== "string" || !raw.startsWith("data:image/jpeg;base64,") || raw.length > VIDEO_POSTER_MAX_CHARS) return "bad";
  return raw;
}

const mine = (actor: Actor, v: { personId: number | null; postedBy: string }) => actor.role === "admin" || v.personId === actor.pid || v.postedBy === actor.name;

/** Uploads that were never posted, cleared after a day: their pieces go, the row stays marked deleted. */
export async function sweepVideoUploads(now: number = Date.now()): Promise<void> {
  await ready();
  const before = new Date(now - UNPOSTED_HOURS * 3_600_000).toISOString();
  const stale = "SELECT id FROM message_videos WHERE message_id IS NULL AND deleted = 0 AND created_at < ?";
  await client.batch(
    [
      { sql: `DELETE FROM message_video_parts WHERE video_id IN (${stale})`, args: [before] },
      { sql: "UPDATE message_videos SET deleted = 1 WHERE message_id IS NULL AND deleted = 0 AND created_at < ?", args: [before] },
    ],
    "write",
  );
}

/** How much the board's videos take up, posted or on their way. */
export async function videoBytesStored(): Promise<number> {
  await ready();
  const r = await db
    .select({ n: sql<number>`coalesce(sum(${schema.messageVideos.bytes}), 0)` })
    .from(schema.messageVideos)
    .where(eq(schema.messageVideos.deleted, false))
    .get();
  return Number(r?.n ?? 0);
}

/** Step one: say what is coming. Gives back the key the pieces are sent under. */
export async function startVideoUpload(actor: Actor, raw: { bytes?: unknown; seconds?: unknown; width?: unknown; height?: unknown; poster?: unknown }): Promise<{ ok: true; key: string; parts: number } | { ok: false; why: VideoRefusal }> {
  const bytes = Number(raw.bytes);
  const seconds = Number(raw.seconds);
  const width = Math.round(Number(raw.width)) || 0;
  const height = Math.round(Number(raw.height)) || 0;
  if (!Number.isInteger(bytes) || bytes <= 0) return { ok: false, why: "empty" };
  if (bytes > VIDEO_MAX_BYTES) return { ok: false, why: "too-big" };
  if (!(seconds >= 0)) return { ok: false, why: "empty" };
  if (seconds > VIDEO_MAX_SECONDS + 5) return { ok: false, why: "too-long" };
  if (width < 0 || height < 0 || width > 16384 || height > 16384) return { ok: false, why: "empty" };
  const poster = cleanPoster(raw.poster);
  if (poster === "bad") return { ok: false, why: "bad-poster" };

  await sweepVideoUploads();
  if ((await videoBytesStored()) + bytes > VIDEO_STORE_MAX_BYTES) return { ok: false, why: "full" };

  const key = randomBytes(16).toString("hex");
  const parts = videoPartCount(bytes);
  await db.insert(schema.messageVideos).values({ key, personId: actor.pid, postedBy: actor.name, bytes, parts, seconds, width, height, poster, createdAt: nowIso() });
  return { ok: true, key, parts };
}

/** An upload still on its way, if it is this person's. */
async function unposted(actor: Actor, key: string) {
  if (!/^[0-9a-f]{32}$/.test(key)) return "not-found" as const;
  await ready();
  const v = await db
    .select({ id: schema.messageVideos.id, personId: schema.messageVideos.personId, postedBy: schema.messageVideos.postedBy, bytes: schema.messageVideos.bytes, parts: schema.messageVideos.parts, mime: schema.messageVideos.mime, complete: schema.messageVideos.complete })
    .from(schema.messageVideos)
    .where(and(eq(schema.messageVideos.key, key), eq(schema.messageVideos.deleted, false), isNull(schema.messageVideos.messageId)))
    .get();
  if (!v) return "not-found" as const;
  if (!mine(actor, v)) return "denied" as const;
  return v;
}

/** Step two, once for each piece, in any order. Sending a piece again replaces it. */
export async function putVideoPart(actor: Actor, key: string, n: number, data: Uint8Array): Promise<"ok" | VideoRefusal> {
  const v = await unposted(actor, key);
  if (typeof v === "string") return v;
  if (v.complete) return "bad-part";
  if (!Number.isInteger(n) || n < 0 || n >= v.parts || data.length !== videoPartSize(v.bytes, n)) return "bad-part";
  if (n === 0) {
    const mime = videoMime(data);
    if (!mime) return "not-video";
    await db.update(schema.messageVideos).set({ mime }).where(eq(schema.messageVideos.id, v.id));
  }
  await client.execute({
    sql: "INSERT INTO message_video_parts (video_id, n, data) VALUES (?, ?, ?) ON CONFLICT(video_id, n) DO UPDATE SET data = excluded.data",
    args: [v.id, n, data],
  });
  return "ok";
}

/** Step three: every piece is in. From here the upload can be posted with a message. */
export async function finishVideoUpload(actor: Actor, key: string): Promise<"ok" | VideoRefusal> {
  const v = await unposted(actor, key);
  if (typeof v === "string") return v;
  if (v.complete) return "ok";
  const got = await client.execute({ sql: "SELECT count(*) AS n, coalesce(sum(length(data)), 0) AS bytes FROM message_video_parts WHERE video_id = ?", args: [v.id] });
  if (Number(got.rows[0]?.n) !== v.parts || Number(got.rows[0]?.bytes) !== v.bytes || !v.mime) return "incomplete";
  await db.update(schema.messageVideos).set({ complete: true }).where(eq(schema.messageVideos.id, v.id));
  return "ok";
}

/** The person took the video off again before posting: its pieces go now rather than tomorrow. */
export async function dropVideoUpload(actor: Actor, key: string): Promise<"ok" | VideoRefusal> {
  const v = await unposted(actor, key);
  if (typeof v === "string") return v;
  await client.batch(
    [
      { sql: "DELETE FROM message_video_parts WHERE video_id = ?", args: [v.id] },
      { sql: "UPDATE message_videos SET deleted = 1 WHERE id = ? AND message_id IS NULL", args: [v.id] },
    ],
    "write",
  );
  return "ok";
}

/** The finished, unposted upload behind a key from the form, if it is this person's to post. */
export async function videoToPost(actor: Actor, key: string | null | undefined): Promise<number | null> {
  const k = (key ?? "").trim();
  if (!k) return null;
  const v = await unposted(actor, k);
  return typeof v === "string" || !v.complete ? null : v.id;
}

// The conditions below are spelled out in SQL so that a message and its video
// change together, in one batch, or not at all.
const POSTABLE = "id = ? AND message_id IS NULL AND complete = 1 AND deleted = 0";

/** Whether this upload can still be claimed, as a condition for the statement that needs it to be. */
export const videoPostable = (videoId: number): { sql: string; args: number[] } => ({ sql: `EXISTS (SELECT 1 FROM message_videos WHERE ${POSTABLE})`, args: [videoId] });

/** Hands a finished upload to the message just inserted in the same batch. */
export const claimVideoForNewMessage = (videoId: number): InStatement => ({ sql: `UPDATE message_videos SET message_id = last_insert_rowid() WHERE ${POSTABLE}`, args: [videoId] });

/** Hands a finished upload to an existing message and takes down the video it had, if the hand-over happened. */
export function replaceVideoStatements(messageId: number, videoId: number): InStatement[] {
  const claimed = "EXISTS (SELECT 1 FROM message_videos WHERE id = ? AND message_id = ?)";
  return [
    { sql: `UPDATE message_videos SET message_id = ? WHERE ${POSTABLE}`, args: [messageId, videoId] },
    { sql: `DELETE FROM message_video_parts WHERE video_id IN (SELECT id FROM message_videos WHERE message_id = ? AND deleted = 0 AND id != ?) AND ${claimed}`, args: [messageId, videoId, videoId, messageId] },
    { sql: `UPDATE message_videos SET deleted = 1 WHERE message_id = ? AND deleted = 0 AND id != ? AND ${claimed}`, args: [messageId, videoId, videoId, messageId] },
  ];
}

/** Takes a message's video down for good: the pieces are deleted, the row stays, marked. */
export function retireVideoStatements(messageId: number): InStatement[] {
  return [
    { sql: "DELETE FROM message_video_parts WHERE video_id IN (SELECT id FROM message_videos WHERE message_id = ? AND deleted = 0)", args: [messageId] },
    { sql: "UPDATE message_videos SET deleted = 1 WHERE message_id = ? AND deleted = 0", args: [messageId] },
  ];
}

const SHOWN = "v.key = ? AND v.complete = 1 AND v.deleted = 0 AND m.deleted = 0";

/** One piece of a video that is on the board (its message posted and not removed). */
export async function videoPart(key: string, n: number): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!/^[0-9a-f]{32}$/.test(key) || !Number.isInteger(n) || n < 0) return null;
  await ready();
  const r = await client.execute({
    sql: `SELECT p.data AS data FROM message_video_parts p JOIN message_videos v ON v.id = p.video_id JOIN messages m ON m.id = v.message_id WHERE ${SHOWN} AND p.n = ?`,
    args: [key, n],
  });
  const data = r.rows[0]?.data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (!ArrayBuffer.isView(data)) return null;
  const out = new Uint8Array(new ArrayBuffer(data.byteLength));
  out.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  return out;
}

/** The still of a video that is on the board, as stored (a JPEG data URL). */
export async function videoPoster(key: string): Promise<string | null> {
  if (!/^[0-9a-f]{32}$/.test(key)) return null;
  await ready();
  const r = await client.execute({ sql: `SELECT v.poster AS poster FROM message_videos v JOIN messages m ON m.id = v.message_id WHERE ${SHOWN}`, args: [key] });
  const p = r.rows[0]?.poster;
  return typeof p === "string" && p ? p : null;
}
