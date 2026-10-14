"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, ready, schema } from "@/db/client";
import { journal, requireAdmin, requireCrew } from "@/lib/auth";
import { addFromCatalogue, addFromRiderItem, canEditRider, deleteItem, importCatalogueCsv, importRiderItemsCsv, riderForPerson, saveCatalogueRow, upsertItem, type KitImportReport } from "@/lib/kit";
import type { KitItem } from "@/db/schema";

function bump() {
  revalidatePath("/crew/kit", "layout");
}

async function riderOr404(riderId: number) {
  await ready();
  const r = await db.select().from(schema.riders).where(eq(schema.riders.id, riderId)).get();
  if (!r) throw new Error("No such rider");
  return r;
}

export async function saveKitItem(form: FormData) {
  const s = await requireCrew();
  const riderId = Number(form.get("riderId"));
  const rider = await riderOr404(riderId);
  if (!canEditRider(s, rider)) throw new Error("Only the rider (or an admin) can change this list");
  await upsertItem(s, riderId, {
    id: Number(form.get("id")) || undefined,
    name: String(form.get("name") ?? ""),
    category: String(form.get("category") ?? "other"),
    qty: Number(form.get("qty")),
    status: String(form.get("status") ?? "need"),
    storage: String(form.get("storage") ?? ""),
    notes: String(form.get("notes") ?? ""),
    link: String(form.get("link") ?? ""),
  });
  bump();
  redirect(`/crew/kit/${riderId}${form.get("id") ? `#item-${form.get("id")}` : ""}`);
}

/** One-tap status from the list. */
export async function setKitStatus(form: FormData) {
  const s = await requireCrew();
  const riderId = Number(form.get("riderId"));
  const rider = await riderOr404(riderId);
  if (!canEditRider(s, rider)) throw new Error("Only the rider (or an admin) can change this list");
  const id = Number(form.get("id"));
  await ready();
  const it = await db.select().from(schema.kitItems).where(eq(schema.kitItems.id, id)).get();
  if (!it || it.riderId !== riderId) throw new Error("Not found");
  await upsertItem(s, riderId, { ...it, status: String(form.get("status") ?? it.status) });
  bump();
  redirect(`/crew/kit/${riderId}#item-${id}`);
}

export async function removeKitItem(form: FormData) {
  const s = await requireCrew();
  const riderId = Number(form.get("riderId"));
  const rider = await riderOr404(riderId);
  if (!canEditRider(s, rider)) throw new Error("Only the rider (or an admin) can change this list");
  await deleteItem(riderId, Number(form.get("id")));
  bump();
  redirect(`/crew/kit/${riderId}`);
}

export async function addSuggested(form: FormData) {
  const s = await requireCrew();
  const riderId = Number(form.get("riderId"));
  const rider = await riderOr404(riderId);
  if (!canEditRider(s, rider)) throw new Error("Only the rider (or an admin) can change this list");
  const ids = form.getAll("catalogueId").map(Number).filter(Boolean);
  for (const id of ids) await addFromCatalogue(s, riderId, id);
  bump();
  redirect(`/crew/kit/${riderId}`);
}

// ---- The sheet (called from the client; return, don't redirect) -------------

export type SheetResult = { ok: true; item: KitItem } | { ok: false; error: string };

async function itemFor(id: number) {
  await ready();
  return db.select().from(schema.kitItems).where(eq(schema.kitItems.id, id)).get();
}

/** Change one or more fields of an item in place. */
export async function patchKitItem(id: number, patch: Partial<Pick<KitItem, "name" | "category" | "qty" | "status" | "storage" | "notes" | "link">>): Promise<SheetResult> {
  try {
    const s = await requireCrew();
    const it = await itemFor(id);
    if (!it) return { ok: false, error: "That row has gone — reload" };
    const rider = await riderOr404(it.riderId);
    if (!canEditRider(s, rider)) return { ok: false, error: "Only the rider (or an admin) can change this list" };
    await upsertItem(s, it.riderId, { ...it, ...patch, id });
    bump();
    return { ok: true, item: (await itemFor(id))! };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function createKitItem(riderId: number, input: { name: string; category: string; qty: number; status: string; storage: string; notes: string; link: string }): Promise<SheetResult> {
  try {
    const s = await requireCrew();
    const rider = await riderOr404(riderId);
    if (!canEditRider(s, rider)) return { ok: false, error: "Only the rider (or an admin) can change this list" };
    const id = await upsertItem(s, riderId, input);
    bump();
    return { ok: true, item: (await itemFor(id))! };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteKitItem(id: number): Promise<{ ok: boolean; error?: string }> {
  const s = await requireCrew();
  const it = await itemFor(id);
  if (!it) return { ok: true };
  const rider = await riderOr404(it.riderId);
  if (!canEditRider(s, rider)) return { ok: false, error: "Only the rider (or an admin) can change this list" };
  await deleteItem(it.riderId, id);
  bump();
  return { ok: true };
}

/** "+ Add" on the suggested list: onto the signed-in rider's own list, as Need. */
export async function addSuggestionToMine(ref: { catalogueId?: number; itemId?: number }): Promise<SheetResult> {
  try {
    const s = await requireCrew();
    const mine = await riderForPerson(s.pid);
    if (!mine) return { ok: false, error: "You're not one of the riders, so you have no kit list" };
    const id = ref.catalogueId ? await addFromCatalogue(s, mine.id, ref.catalogueId) : await addFromRiderItem(s, mine.id, ref.itemId!);
    bump();
    return { ok: true, item: (await itemFor(id))! };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ---- Suggested list (admin) ------------------------------------------------

export async function saveSuggested(form: FormData) {
  const s = await requireAdmin();
  await saveCatalogueRow({
    id: Number(form.get("id")) || undefined,
    name: String(form.get("name") ?? ""),
    category: String(form.get("category") ?? "other"),
    qty: Number(form.get("qty")),
    carriedIn: String(form.get("carriedIn") ?? ""),
    notes: String(form.get("notes") ?? ""),
    source: String(form.get("source") ?? ""),
    link: String(form.get("link") ?? ""),
    active: form.get("active") !== "off",
  });
  await journal(s.name, `kit suggested list: saved "${String(form.get("name")).slice(0, 60)}"`);
  bump();
  redirect("/crew/kit/suggested?edit=1&saved=1");
}

export async function importKitCsv(_prev: KitImportReport | { error: string } | undefined, form: FormData): Promise<KitImportReport | { error: string }> {
  const s = await requireAdmin();
  let csv = String(form.get("csv") ?? "");
  const file = form.get("file");
  if (file instanceof File && file.size > 0) csv = await file.text();
  if (!csv.trim()) return { error: "Paste the CSV or choose a file." };
  const kind = String(form.get("kind") ?? "catalogue");
  const report = kind === "riders" ? await importRiderItemsCsv(s, csv) : await importCatalogueCsv(csv);
  await journal(s.name, `kit import (${kind}): ${report.imported} imported, ${report.updated} updated, ${report.rejected.length} rejected`);
  bump();
  return report;
}
