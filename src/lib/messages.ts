import type { InStatement } from "@libsql/client";
import { and, desc, eq, sql } from "drizzle-orm";
import { client, db, ready, schema } from "@/db/client";
import type { Message } from "@/db/schema";
import { clearCdnTags } from "./cdn";
import { claimVideoForNewMessage, liveVideoOf, replaceVideoStatements, retireVideoStatements, VIDEO_LITE, videoCdnTag, videoLite, videoPostable, videoToPost, type MessageVideoLite } from "./message-video";
import type { Session } from "./session";
import { nowIso } from "./time";

// The message board. Anyone with a crew session can post; a message is edited
// or removed by whoever posted it, or by an admin; pinning is an admin's.
// What is posted goes straight onto the public site (home page and Live),
// alongside the road's status lines from Crew → Live. A message can carry one
// picture (kept in its own row) and one video (kept apart: message-video.ts).

export const MESSAGE_MAX = 2000;
/** A message can carry one picture: a JPEG shrunk in the browser, sent as a data: URL. */
export const PHOTO_MAX_CHARS = 2_500_000;

/** A message without its picture (which can be a few hundred KB); `hasPhoto` says whether there is one.
 *  `video` is the video posted with it, if any: what the pages need to show it, never its bytes. */
export type MessageLite = Omit<Message, "photo"> & { hasPhoto: boolean; video: MessageVideoLite | null };

const LIGHT = {
  id: schema.messages.id,
  body: schema.messages.body,
  personId: schema.messages.personId,
  postedBy: schema.messages.postedBy,
  postedAt: schema.messages.postedAt,
  editedBy: schema.messages.editedBy,
  editedAt: schema.messages.editedAt,
  pinned: schema.messages.pinned,
  deleted: schema.messages.deleted,
  hasPhoto: sql<number>`${schema.messages.photo} is not null`,
  ...VIDEO_LITE,
};

type Row = Omit<MessageLite, "hasPhoto" | "video"> & { hasPhoto: number | boolean } & Parameters<typeof videoLite>[0];

function lite(r: Row): MessageLite {
  const { videoKey, videoMime, videoBytes, videoParts, videoSeconds, videoWidth, videoHeight, videoHasPoster, hasPhoto, ...m } = r;
  return { ...m, hasPhoto: !!hasPhoto, video: videoLite({ videoKey, videoMime, videoBytes, videoParts, videoSeconds, videoWidth, videoHeight, videoHasPoster }) };
}

/** Where the picture is served; the version changes when the message is edited, so a new picture isn't cached over. */
export function messagePhotoUrl(m: Pick<MessageLite, "id" | "hasPhoto" | "editedAt" | "postedAt">): string | null {
  return m.hasPhoto ? `/api/messages/photo/${m.id}?v=${encodeURIComponent(m.editedAt ?? m.postedAt)}` : null;
}

/** A photo from the form: a JPEG data URL of a sensible size, or nothing. */
export function cleanPhoto(raw: string | null | undefined): string | null {
  const p = (raw ?? "").trim();
  if (!p) return null;
  if (!p.startsWith("data:image/jpeg;base64,") || p.length > PHOTO_MAX_CHARS) throw new Error("bad photo");
  return p;
}

export type Actor = Pick<Session, "pid" | "name" | "role">;

/** Plain text in, plain text out: unix line ends, no trailing spaces, at
 *  most one blank line between paragraphs, trimmed, capped. */
export function cleanBody(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\s+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MESSAGE_MAX);
}

export function canEditMessage(actor: Actor, m: Pick<Message, "personId" | "postedBy">): boolean {
  return actor.role === "admin" || m.personId === actor.pid || m.postedBy === actor.name;
}

/** Live messages, pinned first, then newest first. */
export async function listMessages(limit = 200): Promise<MessageLite[]> {
  await ready();
  const rows = await db.select(LIGHT).from(schema.messages).leftJoin(schema.messageVideos, liveVideoOf).where(eq(schema.messages.deleted, false)).orderBy(desc(schema.messages.pinned), desc(schema.messages.id)).limit(limit).all();
  return rows.map(lite);
}

export async function getMessage(id: number): Promise<MessageLite | undefined> {
  if (!Number.isInteger(id) || id <= 0) return undefined;
  await ready();
  const r = await db.select(LIGHT).from(schema.messages).leftJoin(schema.messageVideos, liveVideoOf).where(and(eq(schema.messages.id, id), eq(schema.messages.deleted, false))).get();
  return r ? lite(r) : undefined;
}

/** The picture of a live (not removed) message, as stored. */
export async function messagePhoto(id: number): Promise<string | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  await ready();
  const r = await db.select({ photo: schema.messages.photo }).from(schema.messages).where(and(eq(schema.messages.id, id), eq(schema.messages.deleted, false))).get();
  return r?.photo ?? null;
}

/** Words, a picture, a video, or any of them together. Null when there is none of them.
 *  `videoKey` is a finished upload (message-video.ts); it throws "bad video" if that upload
 *  is not this person's to post or has already gone. */
export async function postMessage(actor: Actor, raw: string, rawPhoto?: string | null, videoKey?: string | null): Promise<number | null> {
  const body = cleanBody(raw);
  const photo = cleanPhoto(rawPhoto);
  const wantsVideo = !!(videoKey ?? "").trim();
  await ready();
  const videoId = wantsVideo ? await videoToPost(actor, videoKey) : null;
  if (wantsVideo && videoId === null) throw new Error("bad video");
  if (!body && !photo && videoId === null) return null;
  const at = nowIso();
  if (videoId === null) {
    const r = await db.insert(schema.messages).values({ body, photo, personId: actor.pid, postedBy: actor.name, postedAt: at }).returning({ id: schema.messages.id }).get();
    return r.id;
  }
  // The message and its video go up together or not at all.
  const can = videoPostable(videoId);
  const rs = await client.batch(
    [{ sql: `INSERT INTO messages (body, photo, person_id, posted_by, posted_at) SELECT ?, ?, ?, ?, ? WHERE ${can.sql}`, args: [body, photo, actor.pid, actor.name, at, ...can.args] }, claimVideoForNewMessage(videoId)],
    "write",
  );
  if (rs[0].rowsAffected !== 1 || rs[0].lastInsertRowid === undefined) throw new Error("bad video");
  return Number(rs[0].lastInsertRowid);
}

/** `photo`: undefined leaves the picture as it is, null removes it, a data URL replaces it.
 *  `video` likewise: undefined leaves it, null takes it down (its bytes are deleted), a finished
 *  upload's key replaces it. "denied" if it isn't theirs, "empty" if it would leave no words,
 *  picture or video, "bad-video" if the upload is not theirs to post or has already gone. */
export async function updateMessage(actor: Actor, id: number, raw: string, rawPhoto?: string | null, video?: string | null): Promise<"ok" | "denied" | "empty" | "bad-video"> {
  const m = await getMessage(id);
  if (!m || !canEditMessage(actor, m)) return "denied";
  const body = cleanBody(raw);
  const photo = rawPhoto === undefined ? undefined : cleanPhoto(rawPhoto);
  const videoId = video ? await videoToPost(actor, video) : null;
  if (video && videoId === null) return "bad-video";
  const willHavePhoto = photo === undefined ? m.hasPhoto : !!photo;
  const willHaveVideo = video === undefined ? !!m.video : videoId !== null;
  if (!body && !willHavePhoto && !willHaveVideo) return "empty";
  if (body === m.body && photo === undefined && video === undefined) return "ok";
  const at = nowIso();
  if (video === undefined) {
    await db
      .update(schema.messages)
      .set({ body, ...(photo !== undefined ? { photo } : {}), editedBy: actor.name, editedAt: at })
      .where(eq(schema.messages.id, id));
    return "ok";
  }
  const can = videoId === null ? { sql: "1", args: [] as number[] } : videoPostable(videoId);
  const edit: InStatement =
    photo !== undefined
      ? { sql: `UPDATE messages SET body = ?, photo = ?, edited_by = ?, edited_at = ? WHERE id = ? AND ${can.sql}`, args: [body, photo, actor.name, at, id, ...can.args] }
      : { sql: `UPDATE messages SET body = ?, edited_by = ?, edited_at = ? WHERE id = ? AND ${can.sql}`, args: [body, actor.name, at, id, ...can.args] };
  const rs = await client.batch([edit, ...(videoId === null ? retireVideoStatements(id) : replaceVideoStatements(id, videoId))], "write");
  if (rs[0].rowsAffected !== 1) return "bad-video";
  if (m.video) await clearCdnTags([videoCdnTag(m.video.key)]); // the video it had is gone from the database; now from the CDN too
  return "ok";
}

/** Removed from the site. The words and the picture stay in the table, marked; a video's bytes are deleted. */
export async function removeMessage(actor: Actor, id: number): Promise<boolean> {
  const m = await getMessage(id);
  if (!m || !canEditMessage(actor, m)) return false;
  if (!m.video) {
    await db.update(schema.messages).set({ deleted: true, pinned: false, editedBy: actor.name, editedAt: nowIso() }).where(eq(schema.messages.id, id));
    return true;
  }
  // The message and its video come down together.
  await client.batch([{ sql: "UPDATE messages SET deleted = 1, pinned = 0, edited_by = ?, edited_at = ? WHERE id = ?", args: [actor.name, nowIso(), id] }, ...retireVideoStatements(id)], "write");
  await clearCdnTags([videoCdnTag(m.video.key)]);
  return true;
}

export async function pinMessage(actor: Actor, id: number, pinned: boolean): Promise<boolean> {
  if (actor.role !== "admin") return false;
  const m = await getMessage(id);
  if (!m) return false;
  await db.update(schema.messages).set({ pinned }).where(eq(schema.messages.id, id));
  return true;
}

/** The first line, shortened, for lists and the journal. `wordless` stands in when there are no words. */
export function messageSummary(body: string, max = 60, wordless = "(a picture)"): string {
  const first = body.split("\n").find((l) => l.trim()) ?? wordless;
  return first.length > max ? first.slice(0, max - 1).trimEnd() + "…" : first;
}
