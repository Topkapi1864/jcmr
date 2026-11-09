"use server";

import { revalidatePath } from "next/cache";
import { journal, requireCrew } from "@/lib/auth";
import { addSpotPhoto, asSpotKind, getSpot, placeOnRoute, removeSpot, removeSpotPhoto, resolvePlace, saveSpot, setSpotPhotoCaption, type Placed } from "@/lib/stops";

function bump() {
  revalidatePath("/crew/stops", "layout");
}

/** Where a pin is on the route; called as the pin moves. */
export async function placeAction(lat: number, lon: number): Promise<Placed | null> {
  await requireCrew();
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return placeOnRoute(lat, lon);
}

/** Pasted text (a Google Maps / Street View link, a share link, "lat, lon") to a place. */
export async function resolveAction(text: string): Promise<{ lat: number; lon: number; placed: Placed | null } | null> {
  await requireCrew();
  const p = await resolvePlace(String(text ?? "").slice(0, 2000));
  return p ? { ...p, placed: placeOnRoute(p.lat, p.lon) } : null;
}

export type SpotForm = { id: number; name: string; kind: string; lat: number; lon: number; notes: string; day: number };

export async function saveSpotAction(f: SpotForm): Promise<{ id: number } | { error: string }> {
  const s = await requireCrew();
  const lat = Number(f.lat);
  const lon = Number(f.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return { error: "Put the pin on the map first." };
  if (!String(f.name ?? "").trim()) return { error: "Give the stop a name (the lay-by, the pub car park, the village)." };
  const id = Number(f.id) || 0;
  if (id && !(await getSpot(id))) return { error: "That stop has been removed." };
  const saved = await saveSpot(s, id, { name: String(f.name), kind: asSpotKind(String(f.kind)), lat, lon, notes: String(f.notes ?? ""), day: Number(f.day) });
  const spot = await getSpot(saved);
  await journal(s.name, `stops: ${id ? "updated" : "added"} #${saved} "${spot?.name}" (day ${spot?.day}${spot?.mile != null ? `, mile ${spot.mile}` : ""})`);
  bump();
  return { id: saved };
}

export async function removeSpotAction(id: number): Promise<boolean> {
  const s = await requireCrew();
  const spot = await getSpot(Number(id));
  if (!spot) return false;
  await removeSpot(s, spot.id);
  await journal(s.name, `stops: removed #${spot.id} "${spot.name}"`);
  bump();
  return true;
}

export async function addPhotoAction(spotId: number, photo: string, caption: string): Promise<string> {
  const s = await requireCrew();
  const r = await addSpotPhoto(s, Number(spotId), String(photo ?? ""), String(caption ?? ""));
  if (r === "ok") {
    await journal(s.name, `stops: picture added to #${spotId}`);
    bump();
  }
  return r;
}

export async function removePhotoAction(photoId: number): Promise<boolean> {
  const s = await requireCrew();
  const spotId = await removeSpotPhoto(Number(photoId));
  if (spotId == null) return false;
  await journal(s.name, `stops: picture removed from #${spotId}`);
  bump();
  return true;
}

export async function captionPhotoAction(photoId: number, caption: string): Promise<boolean> {
  await requireCrew();
  const spotId = await setSpotPhotoCaption(Number(photoId), String(caption ?? ""));
  if (spotId == null) return false;
  bump();
  return true;
}
