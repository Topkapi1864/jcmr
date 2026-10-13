"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { NIGHTS, type Night } from "@/db/schema";
import { journal, requireAdmin, requireCrew } from "@/lib/auth";
import { canEditPerson, savePerson, savePlace } from "@/lib/sleeping";

function bump() {
  revalidatePath("/crew/sleeping", "layout");
}

export async function saveSleeping(form: FormData) {
  const s = await requireCrew();
  const personId = Number(form.get("personId"));
  if (!personId || !canEditPerson(s, personId)) throw new Error("You can only change your own nights (admins can change anyone's)");
  const nights = {} as Record<Night, { placeId: number | null; note: string }>;
  for (const n of NIGHTS) {
    nights[n] = { placeId: Number(form.get(`place_${n}`)) || null, note: String(form.get(`note_${n}`) ?? "") };
  }
  await savePerson(s, personId, nights);
  if (s.pid !== personId) await journal(s.name, `sleeping: updated nights for person #${personId}`);
  bump();
  redirect(`/crew/sleeping?saved=1#p-${personId}`);
}

export async function saveSleepingPlace(form: FormData) {
  const s = await requireAdmin();
  const bedsRaw = String(form.get("beds") ?? "").trim();
  await savePlace({
    id: Number(form.get("id")) || undefined,
    name: String(form.get("name") ?? ""),
    town: String(form.get("town") ?? ""),
    beds: bedsRaw === "" ? null : Math.max(0, Number(bedsRaw) || 0),
    notes: String(form.get("notes") ?? ""),
    active: form.get("active") !== "off",
  });
  await journal(s.name, `sleeping places: saved "${String(form.get("name")).slice(0, 60)}"`);
  bump();
  redirect("/crew/sleeping/places?saved=1");
}
