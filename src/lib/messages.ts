import { and, desc, eq } from "drizzle-orm";
import { db, ready, schema } from "@/db/client";
import type { Message } from "@/db/schema";
import type { Session } from "./session";
import { nowIso } from "./time";

// The message board. Anyone with a crew session can post; a message is edited
// or removed by whoever posted it, or by an admin; pinning is an admin's.
// What is posted goes straight onto the public site (home page and Live),
// alongside the road's status lines from Crew → Live.

export const MESSAGE_MAX = 2000;

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
export async function listMessages(limit = 200): Promise<Message[]> {
  await ready();
  return db.select().from(schema.messages).where(eq(schema.messages.deleted, false)).orderBy(desc(schema.messages.pinned), desc(schema.messages.id)).limit(limit).all();
}

export async function getMessage(id: number): Promise<Message | undefined> {
  if (!Number.isInteger(id) || id <= 0) return undefined;
  await ready();
  return db.select().from(schema.messages).where(and(eq(schema.messages.id, id), eq(schema.messages.deleted, false))).get();
}

export async function postMessage(actor: Actor, raw: string): Promise<number | null> {
  const body = cleanBody(raw);
  if (!body) return null;
  await ready();
  const r = await db.insert(schema.messages).values({ body, personId: actor.pid, postedBy: actor.name, postedAt: nowIso() }).returning({ id: schema.messages.id }).get();
  return r.id;
}

export async function updateMessage(actor: Actor, id: number, raw: string): Promise<boolean> {
  const m = await getMessage(id);
  if (!m || !canEditMessage(actor, m)) return false;
  const body = cleanBody(raw);
  if (!body || body === m.body) return !!body;
  await db.update(schema.messages).set({ body, editedBy: actor.name, editedAt: nowIso() }).where(eq(schema.messages.id, id));
  return true;
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
  const first = body.split("\n").find((l) => l.trim()) ?? "";
  return first.length > max ? first.slice(0, max - 1).trimEnd() + "…" : first;
}
