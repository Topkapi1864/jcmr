import { and, asc, eq } from "drizzle-orm";
import { db, ready, schema } from "@/db/client";
import { KIT_CATEGORIES, KIT_STATUSES, KIT_STORAGE, type KitCategory, type KitStatus, type KitItem, type KitCatalogueRow } from "@/db/schema";
import { csvToObjects } from "./csv";
import { nowIso } from "./time";

export type Actor = { name: string; pid: number; role: "admin" | "crew" };

const asCategory = (v: string): KitCategory => (KIT_CATEGORIES.includes(v as KitCategory) ? (v as KitCategory) : "other");
const asStorage = (v: string) => (KIT_STORAGE.includes(v as (typeof KIT_STORAGE)[number]) ? (v as (typeof KIT_STORAGE)[number]) : "");
const asStatus = (v: string): KitStatus => (KIT_STATUSES.includes(v as KitStatus) ? (v as KitStatus) : "need");

// ---- Riders --------------------------------------------------------------

export async function ridersWithPeople() {
  await ready();
  return db.select().from(schema.riders).orderBy(schema.riders.sortOrder).all();
}

/** The rider row for a signed-in person, if they are one. */
export async function riderForPerson(pid: number) {
  await ready();
  return db.select().from(schema.riders).where(eq(schema.riders.personId, pid)).get();
}

export function canEditRider(actor: Actor, rider: { personId: number | null }) {
  return actor.role === "admin" || rider.personId === actor.pid;
}

// ---- Items -----------------------------------------------------------------

export async function itemsForRider(riderId: number): Promise<KitItem[]> {
  await ready();
  return db.select().from(schema.kitItems).where(eq(schema.kitItems.riderId, riderId)).orderBy(asc(schema.kitItems.category), asc(schema.kitItems.name)).all();
}

export async function allItems(): Promise<KitItem[]> {
  await ready();
  return db.select().from(schema.kitItems).orderBy(asc(schema.kitItems.riderId), asc(schema.kitItems.category), asc(schema.kitItems.name)).all();
}

export function kitCounts(items: KitItem[]) {
  const c = { need: 0, ordered: 0, have: 0, total: items.length, unstored: 0 };
  for (const i of items) {
    c[i.status]++;
    if (!i.storage) c.unstored++;
  }
  return c;
}

export async function upsertItem(
  actor: Actor,
  riderId: number,
  input: { id?: number; name: string; category: string; qty: number; status: string; storage: string; notes: string; link: string; catalogueId?: number | null },
) {
  await ready();
  const vals = {
    riderId,
    name: input.name.trim().slice(0, 120),
    category: asCategory(input.category),
    qty: Math.max(0, Math.min(999, Math.round(input.qty || 0))),
    status: asStatus(input.status),
    storage: asStorage(input.storage),
    notes: input.notes.trim().slice(0, 300),
    link: /^https?:\/\//i.test(input.link.trim()) ? input.link.trim() : "",
    updatedBy: actor.name,
    updatedAt: nowIso(),
  };
  if (!vals.name) throw new Error("An item needs a name");
  if (input.id) {
    await db.update(schema.kitItems).set(vals).where(and(eq(schema.kitItems.id, input.id), eq(schema.kitItems.riderId, riderId)));
    return input.id;
  }
  const r = await db
    .insert(schema.kitItems)
    .values({ ...vals, catalogueId: input.catalogueId ?? null })
    .returning({ id: schema.kitItems.id });
  return r[0].id;
}

export async function deleteItem(riderId: number, id: number) {
  await ready();
  await db.delete(schema.kitItems).where(and(eq(schema.kitItems.id, id), eq(schema.kitItems.riderId, riderId)));
}

/** Add a suggested item to a rider's list, unless an item of that name is already there. */
export async function addFromCatalogue(actor: Actor, riderId: number, catalogueId: number) {
  await ready();
  const c = await db.select().from(schema.kitCatalogue).where(eq(schema.kitCatalogue.id, catalogueId)).get();
  if (!c) throw new Error("Not on the suggested list");
  const existing = await db.select().from(schema.kitItems).where(and(eq(schema.kitItems.riderId, riderId), eq(schema.kitItems.name, c.name))).get();
  if (existing) return existing.id;
  const firstLink = parseLinks(c.link)[0]?.url ?? "";
  return upsertItem(actor, riderId, { name: c.name, category: c.category, qty: c.suggestedQty, status: "need", storage: c.carriedIn, notes: "", link: firstLink, catalogueId: c.id });
}

// ---- Links -----------------------------------------------------------------

/**
 * Links, one per line: a URL, optionally followed by " | label" (e.g. "Castelli Commuter Reflex · posted by Simon").
 * Bare URLs separated by spaces or commas are also accepted.
 */
export function parseLinks(v: string): { url: string; label: string }[] {
  const out: { url: string; label: string }[] = [];
  for (const line of v.split(/\n+/)) {
    const [head, ...rest] = line.split("|");
    const label = rest.join("|").trim();
    const urls = head.split(/[\s,]+/).filter((x) => /^https?:\/\//i.test(x.trim()));
    urls.forEach((u, i) => out.push({ url: u.trim(), label: i === urls.length - 1 ? label.slice(0, 120) : "" }));
  }
  return out.slice(0, 8);
}

export function cleanLinks(v: string) {
  return parseLinks(v)
    .map((l) => (l.label ? `${l.url} | ${l.label}` : l.url))
    .join("\n");
}

export type PostedLink = { url: string; host: string; by: string; label: string };

export function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Every link attached to a suggested item: the ones on the suggested row itself,
 * plus any a rider posted against the same item on their own list. Keyed by catalogue id.
 */
export async function linksForCatalogue(rows: KitCatalogueRow[]): Promise<Map<number, PostedLink[]>> {
  await ready();
  const items = await db.select({ i: schema.kitItems, r: schema.riders }).from(schema.kitItems).leftJoin(schema.riders, eq(schema.kitItems.riderId, schema.riders.id)).all();
  const byName = new Map(rows.map((r) => [r.name.toLowerCase(), r.id]));
  const out = new Map<number, PostedLink[]>();
  const push = (cid: number, url: string, by: string, label = "") => {
    const list = out.get(cid) ?? [];
    if (!list.some((l) => l.url === url)) list.push({ url, host: hostOf(url), by, label });
    out.set(cid, list);
  };
  for (const r of rows) for (const l of parseLinks(r.link)) push(r.id, l.url, "", l.label);
  for (const { i, r } of items) {
    if (!i.link) continue;
    const cid = i.catalogueId ?? byName.get(i.name.toLowerCase());
    if (cid && rows.some((x) => x.id === cid)) push(cid, i.link, r?.displayName.split(" ")[0] ?? "");
  }
  return out;
}

export type RiderSuggestion = { itemId: number; name: string; category: KitCategory; qty: number; storage: KitItem["storage"]; notes: string; link: string; by: string };

/** Items riders put on their own lists that the suggested list doesn't have yet — one per name. */
export async function riderOnlySuggestions(rows: KitCatalogueRow[]): Promise<RiderSuggestion[]> {
  await ready();
  const known = new Set(rows.map((r) => r.name.toLowerCase()));
  const items = await db.select({ i: schema.kitItems, r: schema.riders }).from(schema.kitItems).leftJoin(schema.riders, eq(schema.kitItems.riderId, schema.riders.id)).all();
  const seen = new Map<string, RiderSuggestion>();
  for (const { i, r } of items) {
    const k = i.name.toLowerCase();
    if (known.has(k) || i.catalogueId) continue;
    const prev = seen.get(k);
    if (prev && (prev.link || !i.link)) continue;
    seen.set(k, { itemId: i.id, name: i.name, category: i.category, qty: i.qty, storage: i.storage, notes: i.notes, link: i.link, by: r?.displayName.split(" ")[0] ?? "" });
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Copy another rider's item onto a list, as Need. */
export async function addFromRiderItem(actor: Actor, riderId: number, itemId: number) {
  await ready();
  const src = await db.select().from(schema.kitItems).where(eq(schema.kitItems.id, itemId)).get();
  if (!src) throw new Error("That item has gone");
  const existing = await db.select().from(schema.kitItems).where(and(eq(schema.kitItems.riderId, riderId), eq(schema.kitItems.name, src.name))).get();
  if (existing) return existing.id;
  return upsertItem(actor, riderId, { name: src.name, category: src.category, qty: src.qty, status: "need", storage: src.storage, notes: "", link: src.link });
}

// ---- Catalogue -------------------------------------------------------------

export async function catalogue(includeInactive = false): Promise<KitCatalogueRow[]> {
  await ready();
  const rows = await db.select().from(schema.kitCatalogue).orderBy(asc(schema.kitCatalogue.category), asc(schema.kitCatalogue.sortOrder), asc(schema.kitCatalogue.name)).all();
  return includeInactive ? rows : rows.filter((r) => r.active);
}

export async function saveCatalogueRow(input: { id?: number; name: string; category: string; qty: number; carriedIn: string; notes: string; source: string; link?: string; recommended?: string; active: boolean }) {
  await ready();
  const vals = {
    name: input.name.trim().slice(0, 120),
    category: asCategory(input.category),
    suggestedQty: Math.max(0, Math.min(999, Math.round(input.qty || 1))),
    carriedIn: asStorage(input.carriedIn),
    notes: input.notes.trim().slice(0, 300),
    source: input.source.trim().slice(0, 120),
    link: cleanLinks(input.link ?? ""),
    recommended: (input.recommended ?? "").trim().slice(0, 300),
    active: input.active,
  };
  if (!vals.name) throw new Error("A suggested item needs a name");
  if (input.id) {
    await db.update(schema.kitCatalogue).set(vals).where(eq(schema.kitCatalogue.id, input.id));
    return input.id;
  }
  const r = await db.insert(schema.kitCatalogue).values(vals).returning({ id: schema.kitCatalogue.id });
  return r[0].id;
}

/** A CSV cell that is absent or blank keeps the previous value. */
const keep = (cell: string | undefined, prev: string | undefined) => (cell === undefined || cell.trim() === "" ? prev : cell);

export type KitImportReport = { imported: number; updated: number; rejected: { row: number; reason: string; name: string }[] };

/**
 * CSV: name,category,qty,carried_in,notes,source,link,recommended — idempotent on name (case-insensitive).
 * On an existing item a missing column or an empty cell keeps what is there, so a CSV can carry just
 * name + link + recommended to fill those in.
 */
export async function importCatalogueCsv(csv: string): Promise<KitImportReport> {
  await ready();
  const rows = csvToObjects(csv);
  const report: KitImportReport = { imported: 0, updated: 0, rejected: [] };
  const existing = await db.select().from(schema.kitCatalogue).all();
  const byName = new Map(existing.map((r) => [r.name.toLowerCase(), r]));
  let order = 100;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const name = (r.name ?? "").trim();
    if (!name) {
      report.rejected.push({ row: i + 2, reason: "no name", name: "" });
      continue;
    }
    const category = (r.category ?? "").trim().toLowerCase();
    if (category && !KIT_CATEGORIES.includes(category as KitCategory)) {
      report.rejected.push({ row: i + 2, reason: `category "${r.category}" not in ${KIT_CATEGORIES.join("/")}`, name });
      continue;
    }
    const prev = byName.get(name.toLowerCase());
    const vals = {
      name,
      category: asCategory(category || prev?.category || "other"),
      suggestedQty: Math.max(0, parseInt(r.qty || String(prev?.suggestedQty ?? 1), 10) || 1),
      carriedIn: asStorage((keep(r.carried_in, prev?.carriedIn) ?? "").trim().toLowerCase()),
      notes: (keep(r.notes, prev?.notes) ?? "").trim(),
      source: (keep(r.source, prev?.source) ?? "").trim(),
      link: cleanLinks(keep(r.link, prev?.link) ?? ""),
      recommended: (keep(r.recommended, prev?.recommended) ?? "").trim().slice(0, 300),
      sortOrder: prev?.sortOrder ?? order++,
      active: true,
    };
    if (prev) {
      await db.update(schema.kitCatalogue).set(vals).where(eq(schema.kitCatalogue.id, prev.id));
      report.updated++;
    } else {
      const ins = await db.insert(schema.kitCatalogue).values(vals).returning();
      byName.set(name.toLowerCase(), ins[0]);
      report.imported++;
    }
  }
  return report;
}

/** CSV: rider,name,category,qty,status,storage,notes,link — idempotent on rider+name. */
export async function importRiderItemsCsv(actor: Actor, csv: string): Promise<KitImportReport> {
  await ready();
  const rows = csvToObjects(csv);
  const report: KitImportReport = { imported: 0, updated: 0, rejected: [] };
  const riders = await db.select({ r: schema.riders, p: schema.people }).from(schema.riders).leftJoin(schema.people, eq(schema.riders.personId, schema.people.id)).all();
  const cat = await db.select().from(schema.kitCatalogue).all();
  const catByName = new Map(cat.map((c) => [c.name.toLowerCase(), c]));
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const name = (r.name ?? "").trim();
    const who = (r.rider ?? "").trim().toLowerCase();
    const rider = riders.find((x) => x.p?.shortName.toLowerCase() === who || x.r.displayName.toLowerCase() === who || x.r.displayName.toLowerCase().startsWith(who + " "));
    if (!name || !rider) {
      report.rejected.push({ row: i + 2, reason: !name ? "no name" : `rider "${r.rider}" not found`, name });
      continue;
    }
    const existing = await db.select().from(schema.kitItems).where(and(eq(schema.kitItems.riderId, rider.r.id), eq(schema.kitItems.name, name))).get();
    const c = catByName.get(name.toLowerCase());
    await upsertItem(actor, rider.r.id, {
      id: existing?.id,
      name,
      category: (r.category ?? "").trim().toLowerCase() || c?.category || existing?.category || "other",
      qty: parseInt(r.qty || String(existing?.qty ?? c?.suggestedQty ?? 1), 10) || 1,
      status: (r.status ?? "").trim().toLowerCase() || existing?.status || "need",
      storage: (r.storage ?? "").trim().toLowerCase() || existing?.storage || c?.carriedIn || "",
      notes: r.notes ?? existing?.notes ?? "",
      link: r.link ?? existing?.link ?? "",
      catalogueId: c?.id ?? null,
    });
    if (existing) report.updated++;
    else report.imported++;
  }
  return report;
}
