"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { journal, requireAdmin, requireCrew } from "@/lib/auth";
import {
  addChecklistLines,
  addPosition,
  clearPositions,
  deleteAssignment,
  deleteChecklistRow,
  getVehicle,
  resolveMapLink,
  resetChecklist,
  rotateToken,
  saveAssignment,
  saveChecklistRow,
  saveVehicle,
  setChecked,
  setVehicleActive,
} from "@/lib/vehicles";

function bump() {
  revalidatePath("/crew/vehicles", "layout");
}

const str = (form: FormData, k: string) => String(form.get(k) ?? "");

async function vehicleOr404(id: number) {
  const v = await getVehicle(id);
  if (!v) throw new Error("No such vehicle");
  return v;
}

function colourFrom(form: FormData) {
  const mode = str(form, "colour");
  return mode === "custom" ? str(form, "colourCustom") : mode;
}

export async function saveVehicleDetails(form: FormData) {
  const s = await requireCrew();
  const id = Number(form.get("id"));
  await vehicleOr404(id);
  const photo = str(form, "photo");
  await saveVehicle(s, {
    id,
    name: str(form, "name"),
    colour: colourFrom(form),
    make: str(form, "make"),
    registration: str(form, "registration"),
    role: str(form, "role"),
    strategy: str(form, "strategy"),
    contents: str(form, "contents"),
    kitStorage: str(form, "kitStorage"),
    trackerUrl: str(form, "trackerUrl"),
    sortOrder: form.get("sortOrder") ? Number(form.get("sortOrder")) || 100 : undefined,
    photo: form.get("removePhoto") === "on" ? null : photo ? photo : undefined,
  });
  bump();
  redirect(`/crew/vehicles/${id}?saved=1`);
}

export async function addVehicle(form: FormData) {
  const s = await requireAdmin();
  const id = await saveVehicle(s, {
    name: str(form, "name"),
    colour: colourFrom(form),
    make: "",
    registration: "",
    role: "",
    strategy: "",
    contents: "",
    kitStorage: "",
    trackerUrl: "",
    sortOrder: 50,
  });
  await journal(s.name, `vehicles: added "${str(form, "name").slice(0, 60)}"`);
  bump();
  redirect(`/crew/vehicles/${id}?new=1`);
}

export async function setVehicleRetired(form: FormData) {
  const s = await requireAdmin();
  const id = Number(form.get("id"));
  const v = await vehicleOr404(id);
  const retire = form.get("retire") === "1";
  await setVehicleActive(id, !retire);
  await journal(s.name, `vehicles: ${retire ? "retired" : "restored"} "${v.name}"`);
  bump();
  redirect(retire ? "/crew/vehicles?retired=1" : `/crew/vehicles/${id}`);
}

// ---- Crew ---------------------------------------------------------------------

export async function saveVehicleCrew(form: FormData) {
  const s = await requireCrew();
  const vehicleId = Number(form.get("vehicleId"));
  await vehicleOr404(vehicleId);
  await saveAssignment(s, {
    id: Number(form.get("id")) || undefined,
    vehicleId: Number(form.get("moveTo")) || vehicleId,
    personId: Number(form.get("personId")),
    seat: str(form, "seat"),
    fromPoint: str(form, "fromPoint"),
    untilPoint: str(form, "untilPoint"),
    note: str(form, "note"),
  });
  bump();
  redirect(`/crew/vehicles/${vehicleId}?crew=1#crew`);
}

export async function deleteVehicleCrew(form: FormData) {
  await requireCrew();
  const vehicleId = Number(form.get("vehicleId"));
  await deleteAssignment(Number(form.get("id")));
  bump();
  redirect(`/crew/vehicles/${vehicleId}#crew`);
}

// ---- Checklist ------------------------------------------------------------------

/** Called straight from the tick box (no page reload). */
export async function tickChecklist(id: number, checked: boolean) {
  const s = await requireCrew();
  await setChecked(s, Number(id), !!checked);
  bump();
}

export async function addChecklist(form: FormData) {
  await requireCrew();
  const vehicleId = Number(form.get("vehicleId"));
  await vehicleOr404(vehicleId);
  const n = await addChecklistLines(vehicleId, str(form, "lines"));
  bump();
  redirect(`/crew/vehicles/${vehicleId}?added=${n}#checklist`);
}

export async function saveChecklistItem(form: FormData) {
  await requireCrew();
  const vehicleId = Number(form.get("vehicleId"));
  if (form.get("delete") === "1") await deleteChecklistRow(Number(form.get("id")));
  else await saveChecklistRow(Number(form.get("id")), { name: str(form, "name"), qty: Number(form.get("qty")), note: str(form, "note") });
  bump();
  redirect(`/crew/vehicles/${vehicleId}#checklist`);
}

export async function resetVehicleChecklist(form: FormData) {
  const s = await requireCrew();
  const vehicleId = Number(form.get("vehicleId"));
  const v = await vehicleOr404(vehicleId);
  await resetChecklist(vehicleId);
  await journal(s.name, `vehicles: checklist reset for "${v.name}"`);
  bump();
  redirect(`/crew/vehicles/${vehicleId}?reset=1#checklist`);
}

// ---- Location ---------------------------------------------------------------------

export async function pasteLocation(form: FormData) {
  const s = await requireCrew();
  const vehicleId = Number(form.get("vehicleId"));
  await vehicleOr404(vehicleId);
  const ll = await resolveMapLink(str(form, "where"));
  if (!ll) redirect(`/crew/vehicles/${vehicleId}?where=bad#location`);
  await addPosition(vehicleId, { ...ll, source: "pasted", by: s.name });
  bump();
  redirect(`/crew/vehicles/${vehicleId}?where=ok#location`);
}

export async function rotateVehicleToken(form: FormData) {
  const s = await requireAdmin();
  const vehicleId = Number(form.get("vehicleId"));
  const v = await vehicleOr404(vehicleId);
  await rotateToken(vehicleId);
  await journal(s.name, `vehicles: tracker address changed for "${v.name}"`);
  bump();
  redirect(`/crew/vehicles/${vehicleId}?rotated=1#location`);
}

export async function clearVehiclePositions(form: FormData) {
  const s = await requireAdmin();
  const vehicleId = Number(form.get("vehicleId"));
  const v = await vehicleOr404(vehicleId);
  await clearPositions(vehicleId);
  await journal(s.name, `vehicles: cleared the location trail for "${v.name}"`);
  bump();
  redirect(`/crew/vehicles/${vehicleId}#location`);
}
