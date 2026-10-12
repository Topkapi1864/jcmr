"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, ready, schema } from "@/db/client";
import { AREAS, STATUSES, type Area, type Status } from "@/db/schema";
import { requireCrew } from "@/lib/auth";
import { addNote, canEditFields, createItem, softDelete, statusBeforeDone, updateItem } from "@/lib/items";
import { isValidYmd } from "@/lib/time";

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
