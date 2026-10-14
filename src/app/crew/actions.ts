"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, ready, schema } from "@/db/client";
import { AREAS, STATUSES, type Area, type Status } from "@/db/schema";
import { journal, requireCrew } from "@/lib/auth";
import { normalisePlan } from "@/lib/plan";
import { setSetting } from "@/lib/settings";
import { addNote, canEditFields, createItem, softDelete, statusBeforeDone, updateItem } from "@/lib/items";
import { isValidYmd, nowIso } from "@/lib/time";

function bump() {
  revalidatePath("/crew", "layout");
}

async function loadItem(id: number) {
  await ready();
  const it = await db.select().from(schema.items).where(eq(schema.items.id, id)).get();
  if (!it || it.deleted) throw new Error("Item not found");
  return it;
}

export async function markDoneAction(id: number): Promise<{ ok: true; previous: Status }> {
  const s = await requireCrew();
  const it = await loadItem(id);
  if (!canEditFields(s, it)) throw new Error("Only the owner (or an admin) can mark this done");
  const previous = it.status;
  await updateItem(s, id, { status: "done" });
  bump();
  return { ok: true, previous };
}

export async function undoDoneAction(id: number, previous?: Status): Promise<void> {
  const s = await requireCrew();
  const it = await loadItem(id);
  if (!canEditFields(s, it)) throw new Error("Not allowed");
  const back = previous && STATUSES.includes(previous) && previous !== "done" ? previous : await statusBeforeDone(id);
  await updateItem(s, id, { status: back });
  bump();
}

/** One-tap status change from the item page (owner, creator or admin). */
export async function setStatusAction(form: FormData) {
  const s = await requireCrew();
  const id = Number(form.get("id"));
  const status = String(form.get("status") ?? "") as Status;
  if (!STATUSES.includes(status)) throw new Error("Bad status");
  const it = await loadItem(id);
  if (!canEditFields(s, it)) throw new Error("Only the owner (or an admin) can change the status");
  await updateItem(s, id, { status });
  bump();
  redirect(`/crew/items/${id}`);
}

export async function addNoteAction(form: FormData) {
  const s = await requireCrew();
  const id = Number(form.get("id"));
  const text = String(form.get("text") ?? "").trim();
  if (!text) return;
  await loadItem(id);
  await addNote(s, id, text);
  bump();
}

export async function updateItemAction(form: FormData) {
  const s = await requireCrew();
  const id = Number(form.get("id"));
  const it = await loadItem(id);
  if (!canEditFields(s, it)) throw new Error("Only the owner (or an admin) can change this item's fields");
  const area = String(form.get("area") ?? "") as Area;
  const status = String(form.get("status") ?? "") as Status;
  const due = String(form.get("due") ?? "").trim();
  if (!AREAS.includes(area) || !STATUSES.includes(status)) throw new Error("Bad value");
  if (due && !isValidYmd(due)) throw new Error("Bad date");
  await updateItem(s, id, {
    title: String(form.get("title") ?? "").trim() || it.title,
    area,
    ownerId: Number(form.get("ownerId")) || it.ownerId,
    due: due || null,
    status,
    waitingOn: String(form.get("waitingOn") ?? ""),
    ...(s.role === "admin" ? { source: String(form.get("source") ?? "") || null } : {}),
  });
  bump();
  redirect(`/crew/items/${id}`);
}

/** Anyone on the crew may hand an item they own to someone else. */
export async function reassignAction(form: FormData) {
  const s = await requireCrew();
  const id = Number(form.get("id"));
  const it = await loadItem(id);
  if (!canEditFields(s, it)) throw new Error("Only the owner (or an admin) can hand this on");
  const ownerId = Number(form.get("ownerId"));
  if (ownerId) await updateItem(s, id, { ownerId });
  bump();
  redirect(`/crew/items/${id}`);
}

export async function createItemAction(form: FormData) {
  const s = await requireCrew();
  const title = String(form.get("title") ?? "").trim();
  const area = String(form.get("area") ?? "") as Area;
  const ownerId = Number(form.get("ownerId")) || s.pid;
  const due = String(form.get("due") ?? "").trim();
  if (!title) throw new Error("A title is required");
  if (!AREAS.includes(area)) throw new Error("Pick an area");
  if (due && !isValidYmd(due)) throw new Error("Bad date");
  const id = await createItem(s, {
    title,
    area,
    ownerId,
    due: due || null,
    waitingOn: String(form.get("waitingOn") ?? ""),
    note: String(form.get("note") ?? ""),
  });
  bump();
  redirect(`/crew/items/${id}`);
}

export async function deleteItemAction(form: FormData) {
  const s = await requireCrew();
  if (s.role !== "admin") throw new Error("Admins only");
  const id = Number(form.get("id"));
  await softDelete(s, id);
  bump();
  redirect("/crew");
}

// ---- Route planner --------------------------------------------------------

/** Save the crew's working plan; the planned times for named stops go onto the
 *  route_stops rows so the public route page shows them. */
export async function savePlanAction(planJson: string, times: { key: string; time: string }[]): Promise<{ savedBy: string; savedAt: string }> {
  const s = await requireCrew();
  const plan = normalisePlan(JSON.parse(planJson));
  const savedAt = nowIso();
  await setSetting("route.plan", JSON.stringify({ plan, savedBy: s.name, savedAt }));
  await ready();
  const days = await db.select().from(schema.routeDays).all();
  const rows = await db.select().from(schema.routeStops).all();
  for (const t of times) {
    // "end:<day>" / "start:<day>": the day's overnight/finish and start rows.
    const end = /^(end|start):(\d)$/.exec(t.key);
    if (end) {
      const d = days.find((x) => x.day === Number(end[2]));
      if (!d) continue;
      const isEnd = end[1] === "end";
      for (const r of rows.filter((x) => x.dayId === d.id && (isEnd ? (x.kind === "overnight" || x.kind === "finish") && x.approxMile != null : x.approxMile === 0))) {
        await db.update(schema.routeStops).set({ plannedTime: t.time }).where(eq(schema.routeStops.id, r.id));
      }
      continue;
    }
    const m = /^db:(\d+)$/.exec(t.key);
    if (!m) continue;
    await db
      .update(schema.routeStops)
      .set({ plannedTime: /^\d{2}:\d{2}$/.test(t.time) ? t.time : null })
      .where(eq(schema.routeStops.id, Number(m[1])));
  }
  await journal(s.name, `route plan saved: ${plan.speedMph} mph, D1 ${plan.days[1]?.start}, D2 ${plan.days[2]?.start}`);
  bump();
  revalidatePath("/route");
  return { savedBy: s.name, savedAt };
}
