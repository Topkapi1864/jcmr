"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, ready, schema } from "@/db/client";
import { journal, requireAdmin, requireCrew } from "@/lib/auth";
import { addFromCatalogue, canEditRider, deleteItem, importCatalogueCsv, importRiderItemsCsv, saveCatalogueRow, upsertItem, type KitImportReport } from "@/lib/kit";

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
    active: form.get("active") !== "off",
  });
  await journal(s.name, `kit suggested list: saved "${String(form.get("name")).slice(0, 60)}"`);
  bump();
  redirect("/crew/kit/suggested?saved=1");
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
