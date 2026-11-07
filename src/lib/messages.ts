import { and, desc, eq, sql } from "drizzle-orm";
import { db, ready, schema } from "@/db/client";
import type { Message } from "@/db/schema";
import type { Session } from "./session";
import { nowIso } from "./time";

// The message board. Anyone with a crew session can post; a message is edited
// or removed by whoever posted it, or by an admin; pinning is an admin's.
// What is posted goes straight onto the public site (home page and Live),
// alongside the road's status lines from Crew → Live.

export const MESSAGE_MAX = 2000;
/** A message can carry one picture: a JPEG shrunk in the browser, sent as a data: URL. */
export const PHOTO_MAX_CHARS = 2_500_000;

/** A message without its picture (which can be a few hundred KB); `hasPhoto` says whether there is one. */
export type MessageLite = Omit<Message, "photo"> & { hasPhoto: boolean };

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
};

const lite = (r: Omit<MessageLite, "hasPhoto"> & { hasPhoto: number | boolean }): MessageLite => ({ ...r, hasPhoto: !!r.hasPhoto });

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
  const rows = await db.select(LIGHT).from(schema.messages).where(eq(schema.messages.deleted, false)).orderBy(desc(schema.messages.pinned), desc(schema.messages.id)).limit(limit).all();
  return rows.map(lite);
}

export async function getMessage(id: number): Promise<MessageLite | undefined> {
  if (!Number.isInteger(id) || id <= 0) return undefined;
  await ready();
  const r = await db.select(LIGHT).from(schema.messages).where(and(eq(schema.messages.id, id), eq(schema.messages.deleted, false))).get();
  return r ? lite(r) : undefined;
}

/** The picture of a live (not removed) message, as stored. */
export async function messagePhoto(id: number): Promise<string | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  await ready();
  const r = await db.select({ photo: schema.messages.photo }).from(schema.messages).where(and(eq(schema.messages.id, id), eq(schema.messages.deleted, false))).get();
  return r?.photo ?? null;
}

/** Words, a picture, or both. Null when there is neither. */
export async function postMessage(actor: Actor, raw: string, rawPhoto?: string | null): Promise<number | null> {
  const body = cleanBody(raw);
  const photo = cleanPhoto(rawPhoto);
  if (!body && !photo) return null;
  await ready();
  const r = await db.insert(schema.messages).values({ body, photo, personId: actor.pid, postedBy: actor.name, postedAt: nowIso() }).returning({ id: schema.messages.id }).get();
  return r.id;
}

/** `photo`: undefined leaves the picture as it is, null removes it, a data URL replaces it.
 *  "denied" if it isn't theirs, "empty" if it would leave neither words nor a picture. */
export async function updateMessage(actor: Actor, id: number, raw: string, rawPhoto?: string | null): Promise<"ok" | "denied" | "empty"> {
  const m = await getMessage(id);
  if (!m || !canEditMessage(actor, m)) return "denied";
  const body = cleanBody(raw);
  const photo = rawPhoto === undefined ? undefined : cleanPhoto(rawPhoto);
  const willHavePhoto = photo === undefined ? m.hasPhoto : !!photo;
  if (!body && !willHavePhoto) return "empty";
  if (body === m.body && photo === undefined) return "ok";
  await db
    .update(schema.messages)
    .set({ body, ...(photo !== undefined ? { photo } : {}), editedBy: actor.name, editedAt: nowIso() })
    .where(eq(schema.messages.id, id));
  return "ok";
}

export async function removeMessage(actor: Actor, id: number): Promise<boolean> {
  const m = await getMessage(id);
  if (!m || !canEditMessage(actor, m)) return false;
  await db.update(schema.messages).set({ deleted: true, pinned: false, editedBy: actor.name, editedAt: nowIso() }).where(eq(schema.messages.id, id));
  return true;
}

export async function pinMessage(actor: Actor, id: number, pinned: boolean): Promise<boolean> {
  if (actor.role !== "admin") return false;
  const m = await getMessage(id);
  if (!m) return false;
  await db.update(schema.messages).set({ pinned }).where(eq(schema.messages.id, id));
  return true;
}

/** The first line, shortened, for lists and the journal. */
export function messageSummary(body: string, max = 60): string {
  const first = body.split("\n").find((l) => l.trim()) ?? "(a picture)";
  return first.length > max ? first.slice(0, max - 1).trimEnd() + "…" : first;
}
