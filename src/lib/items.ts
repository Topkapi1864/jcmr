import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, ready, schema } from "@/db/client";
import { AREAS, AREA_LABELS, STATUSES, type Area, type Item, type Person, type Status } from "@/db/schema";
import { daysSince, daysUntil, fmtDay, fmtDayLong, londonDate, nowIso } from "./time";

export const STALE_AMBER = 4;
export const STALE_RED = 7;

export type ItemRow = Item & {
  owner: Person;
  staleDays: number; // 0 for done
  staleLevel: "none" | "amber" | "red";
  overdue: boolean;
  latestNote: { author: string; at: string; text: string } | null;
};

export type Filters = {
  status?: Status | "";
  area?: Area | "";
  hideDone?: boolean;
  q?: string;
};

export function staleLevel(days: number): ItemRow["staleLevel"] {
  if (days >= STALE_RED) return "red";
  if (days >= STALE_AMBER) return "amber";
  return "none";
}

export async function listItems(filters: Filters = {}): Promise<ItemRow[]> {
  await ready();
  const rows = await db
    .select()
    .from(schema.items)
    .innerJoin(schema.people, eq(schema.items.ownerId, schema.people.id))
    .where(eq(schema.items.deleted, false))
    .all();

  const ids = rows.map((r) => r.items.id);
  const latest = new Map<number, { author: string; at: string; text: string }>();
  if (ids.length) {
    const notes = await db
      .select()
      .from(schema.itemNotes)
      .where(inArray(schema.itemNotes.itemId, ids))
      .orderBy(asc(schema.itemNotes.at), asc(schema.itemNotes.id))
      .all();
    for (const n of notes) latest.set(n.itemId, { author: n.author, at: n.at, text: n.text });
  }

  let out: ItemRow[] = rows.map(({ items: it, people: owner }) => {
    const sd = it.status === "done" ? 0 : daysSince(it.updatedAt);
    return {
      ...it,
      owner,
      staleDays: sd,
      staleLevel: it.status === "done" ? "none" : staleLevel(sd),
      overdue: !!it.due && it.status !== "done" && daysUntil(it.due) < 0,
      latestNote: latest.get(it.id) ?? null,
    };
  });

  if (filters.status) out = out.filter((i) => i.status === filters.status);
  if (filters.area) out = out.filter((i) => i.area === filters.area);
  if (filters.hideDone) out = out.filter((i) => i.status !== "done");
  if (filters.q?.trim()) {
    const q = filters.q.trim().toLowerCase();
    out = out.filter((i) => [i.title, i.waitingOn, i.owner.shortName, i.owner.name, i.latestNote?.text ?? ""].some((t) => t.toLowerCase().includes(q)));
  }
  return out;
}

export async function getItem(id: number) {
  await ready();
  const row = await db
    .select()
    .from(schema.items)
    .innerJoin(schema.people, eq(schema.items.ownerId, schema.people.id))
    .where(and(eq(schema.items.id, id), eq(schema.items.deleted, false)))
    .get();
  if (!row) return null;
  const notes = await db
    .select()
    .from(schema.itemNotes)
    .where(eq(schema.itemNotes.itemId, id))
    .orderBy(asc(schema.itemNotes.at), asc(schema.itemNotes.id))
    .all();
  const events = await db
    .select()
    .from(schema.itemEvents)
    .where(eq(schema.itemEvents.itemId, id))
    .orderBy(desc(schema.itemEvents.at), desc(schema.itemEvents.id))
    .all();
  const it = row.items;
  const sd = it.status === "done" ? 0 : daysSince(it.updatedAt);
  return {
    ...it,
    owner: row.people,
    staleDays: sd,
    staleLevel: it.status === "done" ? "none" : staleLevel(sd),
    overdue: !!it.due && it.status !== "done" && daysUntil(it.due) < 0,
    notes,
    events,
  };
}

// ---- Sorting helpers for the views ------------------------------------

const STATUS_RANK: Record<Status, number> = { blocked: 0, "in-progress": 1, open: 2, done: 3 };

export function byDue(a: ItemRow, b: ItemRow): number {
  if (a.due && b.due) return a.due < b.due ? -1 : a.due > b.due ? 1 : a.id - b.id;
  if (a.due) return -1;
  if (b.due) return 1;
  return a.id - b.id;
}

export function byStale(a: ItemRow, b: ItemRow): number {
  return b.staleDays - a.staleDays || byDue(a, b);
}

export function openFirst(a: ItemRow, b: ItemRow): number {
  const ra = a.status === "done" ? 1 : 0;
  const rb = b.status === "done" ? 1 : 0;
  return ra - rb || byDue(a, b);
}

export function counts(all: ItemRow[]) {
  const c = { open: 0, "in-progress": 0, blocked: 0, done: 0, amber: 0, red: 0 };
  for (const i of all) {
    c[i.status]++;
    if (i.staleLevel === "amber") c.amber++;
    if (i.staleLevel === "red") c.red++;
  }
  return c;
}

export function groupBy<K extends string>(rows: ItemRow[], keyOf: (r: ItemRow) => K): Map<K, ItemRow[]> {
  const m = new Map<K, ItemRow[]>();
  for (const r of rows) {
    const k = keyOf(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(r);
  }
  return m;
}

// ---- Mutations: every change writes item_events and bumps updated_* ---

type Actor = { name: string; pid: number; role: "admin" | "crew" };

async function event(itemId: number, actor: string, field: string, from: string | null, to: string | null) {
  await db.insert(schema.itemEvents).values({ itemId, actor, at: nowIso(), field, from, to });
}

export function canEditFields(actor: Actor, item: Item): boolean {
  return actor.role === "admin" || item.ownerId === actor.pid || item.createdBy === actor.name;
}

export async function createItem(
  actor: Actor,
  input: { title: string; area: Area; ownerId: number; due: string | null; waitingOn?: string; note?: string; source?: string; status?: Status },
) {
  await ready();
  const now = nowIso();
  const res = await db
    .insert(schema.items)
    .values({
      title: input.title.trim().slice(0, 120),
      area: input.area,
      ownerId: input.ownerId,
      due: input.due || null,
      status: input.status ?? "open",
      waitingOn: (input.waitingOn ?? "").trim(),
      createdBy: actor.name,
      createdAt: now,
      updatedBy: actor.name,
      updatedAt: now,
      source: input.source?.trim() || null,
    })
    .returning({ id: schema.items.id });
  const id = res[0].id;
  await event(id, actor.name, "created", null, input.title);
  if (input.note?.trim()) await addNote(actor, id, input.note, false);
  return id;
}

export async function addNote(actor: Actor, itemId: number, text: string, bump = true) {
  await ready();
  const now = nowIso();
  await db.insert(schema.itemNotes).values({ itemId, author: actor.name, at: now, text: text.trim() });
  await event(itemId, actor.name, "note", null, text.trim().slice(0, 200));
  if (bump) await db.update(schema.items).set({ updatedBy: actor.name, updatedAt: now }).where(eq(schema.items.id, itemId));
}

export type ItemPatch = Partial<{
  title: string;
  area: Area;
  ownerId: number;
  due: string | null;
  status: Status;
  waitingOn: string;
  source: string | null;
}>;

/** Applies a patch field by field, journaling each real change. Returns the number of fields changed. */
export async function updateItem(actor: Actor, itemId: number, patch: ItemPatch): Promise<number> {
  await ready();
  const cur = await db.select().from(schema.items).where(eq(schema.items.id, itemId)).get();
  if (!cur || cur.deleted) throw new Error("Item not found");
  const changes: Partial<Item> = {};
  let n = 0;
  const consider = async (field: keyof ItemPatch, to: string | number | null | undefined) => {
    if (to === undefined) return;
    const from = cur[field as keyof Item] as string | number | null;
    const a = from === null || from === undefined ? "" : String(from);
    const b = to === null || to === undefined ? "" : String(to);
    if (a === b) return;
    (changes as Record<string, unknown>)[field] = to;
    n++;
    let fromLabel = a;
    let toLabel = b;
    if (field === "ownerId") {
      fromLabel = (await db.select().from(schema.people).where(eq(schema.people.id, Number(a))).get())?.shortName ?? a;
      toLabel = (await db.select().from(schema.people).where(eq(schema.people.id, Number(b))).get())?.shortName ?? b;
    }
    await event(itemId, actor.name, field === "ownerId" ? "owner" : field, fromLabel, toLabel);
  };
  await consider("title", patch.title?.trim().slice(0, 120));
  await consider("area", patch.area);
  await consider("ownerId", patch.ownerId);
  await consider("due", patch.due === undefined ? undefined : patch.due || null);
  await consider("status", patch.status);
  await consider("waitingOn", patch.waitingOn?.trim());
  await consider("source", patch.source === undefined ? undefined : patch.source?.trim() || null);
  if (n === 0) return 0;
  const now = nowIso();
  if (patch.status === "done" && cur.status !== "done") changes.doneAt = now;
  if (patch.status && patch.status !== "done" && cur.status === "done") changes.doneAt = null;
  await db
    .update(schema.items)
    .set({ ...changes, updatedBy: actor.name, updatedAt: now })
    .where(eq(schema.items.id, itemId));
  return n;
}

export async function softDelete(actor: Actor, itemId: number) {
  await ready();
  await db.update(schema.items).set({ deleted: true, updatedBy: actor.name, updatedAt: nowIso() }).where(eq(schema.items.id, itemId));
  await event(itemId, actor.name, "deleted", null, "yes");
}

/** For "undo done": the status before the most recent change to done. */
export async function statusBeforeDone(itemId: number): Promise<Status> {
  const ev = await db
    .select()
    .from(schema.itemEvents)
    .where(and(eq(schema.itemEvents.itemId, itemId), eq(schema.itemEvents.field, "status"), eq(schema.itemEvents.to, "done")))
    .orderBy(desc(schema.itemEvents.id))
    .get();
  const from = ev?.from as Status | undefined;
  return from && STATUSES.includes(from) && from !== "done" ? from : "open";
}

// ---- The weekly summary (§5.5) ----------------------------------------

function line(i: ItemRow): string {
  const parts = [i.title, i.owner.shortName];
  if (i.due) parts.push(`due ${fmtDay(i.due)}`);
  parts.push(i.status === "in-progress" ? "in progress" : i.status);
  if (i.waitingOn && i.status !== "done") parts.push(`waiting on ${i.waitingOn}`);
  return `• ${parts.join(" — ")}`;
}

export function weeklySummary(all: ItemRow[]): string {
  const out: string[] = [];
  out.push(`JCMR — where it stands, ${fmtDayLong(londonDate())}`);
  const stale = all.filter((i) => i.status !== "done" && i.staleDays >= STALE_AMBER).sort(byStale);
  out.push(`STALE (untouched ${STALE_AMBER}+ days)`);
  if (stale.length === 0) out.push("• nothing — everything has been touched this week");
  for (const i of stale) out.push(`${line(i)} (${i.staleDays}d)`);
  out.push("");
  out.push("BY AREA");
  for (const area of AREAS) {
    const rows = all.filter((i) => i.area === area && i.status !== "done").sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || byDue(a, b));
    if (!rows.length) continue;
    out.push(AREA_LABELS[area]);
    for (const i of rows) out.push(line(i));
  }
  out.push("");
  out.push("DONE THIS WEEK");
  const weekAgo = Date.now() - 7 * 86_400_000;
  const done = all.filter((i) => i.status === "done" && i.doneAt && Date.parse(i.doneAt) >= weekAgo);
  if (done.length === 0) out.push("• nothing marked done this week");
  for (const i of done) out.push(`• ${i.title} — ${i.owner.shortName}`);
  return out.join("\n");
}

export function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function itemsCsv(all: ItemRow[]): string {
  const head = ["id", "title", "area", "owner", "due", "status", "waiting_on", "stale_days", "updated_by", "updated_at", "created_by", "created_at", "done_at", "latest_note", "source"];
  const rows = all.map((i) => [
    i.id,
    i.title,
    i.area,
    i.owner.shortName,
    i.due ?? "",
    i.status,
    i.waitingOn,
    i.staleDays,
    i.updatedBy,
    i.updatedAt,
    i.createdBy,
    i.createdAt,
    i.doneAt ?? "",
    i.latestNote ? `${i.latestNote.author} ${i.latestNote.at.slice(0, 10)}: ${i.latestNote.text}` : "",
    i.source ?? "",
  ]);
  return [head, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n") + "\n";
}
