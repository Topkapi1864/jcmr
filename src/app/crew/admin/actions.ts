"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, ready, schema } from "@/db/client";
import { ROLES, STOP_KINDS, type Role } from "@/db/schema";
import { journal, requireAdmin } from "@/lib/auth";
import { importItemsCsv, type ImportReport } from "@/lib/import";
import { SETTING_KEYS, setSetting, type SettingKey } from "@/lib/settings";
import { randomToken, sha256Hex } from "@/lib/util";
import { fetchJustGivingTotal } from "@/lib/donate";
import { nowIso } from "@/lib/time";

function bump() {
  revalidatePath("/", "layout");
}

// ---- The dark switch (§3.3) --------------------------------------------

export async function setPublicLive(form: FormData) {
  const s = await requireAdmin();
  const live = form.get("live") === "true";
  await setSetting("site.public_live", live ? "true" : "false");
  await journal(s.name, live ? "PUBLIC SITE SWITCHED ON" : "public site switched off (holding page)");
  bump();
  redirect("/crew/admin");
}

// ---- Settings ----------------------------------------------------------

export async function saveSettings(form: FormData) {
  const s = await requireAdmin();
  const changed: string[] = [];
  for (const key of SETTING_KEYS) {
    if (key === "site.public_live" || key === "read_door.token_hash" || key.startsWith("donate.total_cached")) continue;
    const v = form.get(key);
    if (v === null) continue;
    await setSetting(key as SettingKey, String(v).trim());
    changed.push(key);
  }
  await journal(s.name, `settings saved: ${changed.join(", ")}`);
  bump();
  redirect("/crew/admin?saved=1");
}

export async function refreshDonateTotal() {
  const s = await requireAdmin();
  const live = await fetchJustGivingTotal();
  if (live) {
    await setSetting("donate.total_cached", JSON.stringify(live));
    await setSetting("donate.total_cached_at", nowIso());
    await journal(s.name, `donate total refreshed: £${live.amount}`);
  } else {
    await journal(s.name, "donate total refresh FAILED");
  }
  bump();
  redirect("/crew/admin?refreshed=" + (live ? "1" : "0"));
}

// ---- Read door token (§7) ----------------------------------------------

export async function rotateReadToken(): Promise<void> {
  const s = await requireAdmin();
  const token = randomToken(24);
  await setSetting("read_door.token_hash", await sha256Hex(token));
  await journal(s.name, "read-door token rotated");
  // Shown once, via the query string, on the admin page.
  redirect(`/crew/admin?token=${token}`);
}

export async function revokeReadToken(): Promise<void> {
  const s = await requireAdmin();
  await setSetting("read_door.token_hash", "");
  await journal(s.name, "read-door token revoked");
  redirect("/crew/admin");
}

// ---- People ------------------------------------------------------------

export async function savePerson(form: FormData) {
  const s = await requireAdmin();
  await ready();
  const id = Number(form.get("id")) || 0;
  const role = String(form.get("role")) as Role;
  const vals = {
    name: String(form.get("name") ?? "").trim(),
    shortName: String(form.get("shortName") ?? "").trim(),
    role: ROLES.includes(role) ? role : "crew",
    email: String(form.get("email") ?? "").trim() || null,
    active: form.get("active") === "on",
    sortOrder: Number(form.get("sortOrder")) || 100,
  };
  if (!vals.name || !vals.shortName) throw new Error("Name and short name are required");
  if (id) await db.update(schema.people).set(vals).where(eq(schema.people.id, id));
  else await db.insert(schema.people).values(vals);
  await journal(s.name, `person ${id ? "updated" : "added"}: ${vals.shortName}`);
  bump();
  redirect("/crew/admin/people");
}

// ---- Links -------------------------------------------------------------

export async function saveLink(form: FormData) {
  const s = await requireAdmin();
  await ready();
  const id = Number(form.get("id")) || 0;
  const vals = { label: String(form.get("label") ?? "").trim(), url: String(form.get("url") ?? "").trim(), sortOrder: Number(form.get("sortOrder")) || 0 };
  if (!vals.label) throw new Error("A label is required");
  if (id) await db.update(schema.links).set(vals).where(eq(schema.links.id, id));
  else await db.insert(schema.links).values(vals);
  await journal(s.name, `link saved: ${vals.label}`);
  bump();
  redirect("/crew/admin/links");
}

export async function deleteLink(form: FormData) {
  const s = await requireAdmin();
  await ready();
  const id = Number(form.get("id"));
  await db.delete(schema.links).where(eq(schema.links.id, id));
  await journal(s.name, `link deleted: #${id}`);
  bump();
  redirect("/crew/admin/links");
}

// ---- Import (§8) -------------------------------------------------------

export async function importCsv(_prev: ImportReport | { error: string } | undefined, form: FormData): Promise<ImportReport | { error: string }> {
  const s = await requireAdmin();
  let csv = String(form.get("csv") ?? "");
  const file = form.get("file");
  if (file instanceof File && file.size > 0) csv = await file.text();
  if (!csv.trim()) return { error: "Paste the CSV or choose a file." };
  const report = await importItemsCsv(s, csv);
  await journal(s.name, `import: ${report.imported} imported, ${report.updated} updated, ${report.rejected.length} rejected`);
  bump();
  return report;
}

// ---- Content (§4) ------------------------------------------------------

export async function saveContent(form: FormData) {
  const s = await requireAdmin();
  await ready();
  for (const key of ["mum_story_md", "home_intro_md", "family_words_md"]) {
    const v = form.get(key);
    if (v === null) continue;
    await db.insert(schema.content).values({ key, md: String(v) }).onConflictDoUpdate({ target: schema.content.key, set: { md: String(v) } });
  }
  await journal(s.name, "content saved");
  bump();
  redirect("/crew/admin/content?saved=1");
}

export async function saveRider(form: FormData) {
  const s = await requireAdmin();
  await ready();
  const id = Number(form.get("id"));
  await db
    .update(schema.riders)
    .set({
      displayName: String(form.get("displayName") ?? "").trim(),
      bioMd: String(form.get("bioMd") ?? ""),
      stravaUrl: String(form.get("stravaUrl") ?? "").trim() || null,
      photoAsset: String(form.get("photoAsset") ?? "").trim() || null,
    })
    .where(eq(schema.riders.id, id));
  await journal(s.name, `rider saved: #${id}`);
  bump();
  redirect("/crew/admin/content?saved=1");
}

export async function saveMumPhoto(form: FormData) {
  const s = await requireAdmin();
  await ready();
  const p = String(form.get("path") ?? "").trim();
  const ex = await db.select().from(schema.assets).where(eq(schema.assets.kind, "mum_photo")).get();
  if (ex) await db.update(schema.assets).set({ path: p, chosenBy: String(form.get("chosenBy") ?? "Simon"), at: nowIso() }).where(eq(schema.assets.id, ex.id));
  else await db.insert(schema.assets).values({ kind: "mum_photo", path: p, chosenBy: String(form.get("chosenBy") ?? "Simon"), at: nowIso() });
  await journal(s.name, `mum photo set: ${p}`);
  bump();
  redirect("/crew/admin/content?saved=1");
}

// ---- Route (§4.4) ------------------------------------------------------

export async function saveRouteDay(form: FormData) {
  const s = await requireAdmin();
  await ready();
  const id = Number(form.get("id"));
  await db
    .update(schema.routeDays)
    .set({
      label: String(form.get("label") ?? "").trim(),
      startLabel: String(form.get("startLabel") ?? "").trim(),
      endLabel: String(form.get("endLabel") ?? "").trim(),
      miles: Number(form.get("miles")) || null,
      feet: Number(form.get("feet")) || null,
      stravaUrl: String(form.get("stravaUrl") ?? "").trim() || null,
    })
    .where(eq(schema.routeDays.id, id));
  await journal(s.name, `route day saved: #${id}`);
  bump();
  redirect("/crew/admin/route?saved=1");
}

export async function saveStop(form: FormData) {
  const s = await requireAdmin();
  await ready();
  const id = Number(form.get("id")) || 0;
  const kind = String(form.get("kind")) as (typeof STOP_KINDS)[number];
  const vals = {
    dayId: Number(form.get("dayId")),
    sortOrder: Number(form.get("sortOrder")) || 0,
    name: String(form.get("name") ?? "").trim(),
    approxMile: form.get("approxMile") ? Number(form.get("approxMile")) : null,
    kind: STOP_KINDS.includes(kind) ? kind : "short",
    plannedTime: String(form.get("plannedTime") ?? "").trim() || null,
    notes: String(form.get("notes") ?? "").trim() || null,
  };
  if (!vals.name) throw new Error("A stop needs a name");
  if (id) await db.update(schema.routeStops).set(vals).where(eq(schema.routeStops.id, id));
  else await db.insert(schema.routeStops).values(vals);
  await journal(s.name, `stop saved: ${vals.name}`);
  bump();
  redirect("/crew/admin/route?saved=1");
}

export async function deleteStop(form: FormData) {
  const s = await requireAdmin();
  await ready();
  const id = Number(form.get("id"));
  await db.delete(schema.routeStops).where(eq(schema.routeStops.id, id));
  await journal(s.name, `stop deleted: #${id}`);
  bump();
  redirect("/crew/admin/route");
}
