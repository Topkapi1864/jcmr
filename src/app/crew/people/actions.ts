"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { journal, requireAdmin, requireCrew } from "@/lib/auth";
import { asAgreed, canEditMember, saveDetails } from "@/lib/people";

function bump() {
  revalidatePath("/crew/people", "layout");
}

export async function saveCrewDetails(form: FormData) {
  const s = await requireCrew();
  const personId = Number(form.get("personId"));
  if (!personId || !canEditMember(s, personId)) throw new Error("You can only edit your own details (admins can edit anyone's)");
  const str = (k: string) => String(form.get(k) ?? "");
  await saveDetails(s, personId, {
    crewRole: str("crewRole"),
    agreed: asAgreed(str("agreed")),
    briefed: form.get("briefed") === "on",
    mobile: str("mobile"),
    email: str("email"),
    dob: str("dob"),
    skills: str("skills"),
    firstAid: str("firstAid"),
    vehicle: str("vehicle"),
    dietary: str("dietary"),
    emergencyName: str("emergencyName"),
    emergencyPhone: str("emergencyPhone"),
    availability: str("availability"),
    notes: str("notes"),
  });
  if (s.pid !== personId) await journal(s.name, `crew details: updated person #${personId}`);
  bump();
  redirect(`/crew/people/${personId}?saved=1`);
}

/** One-tap from the roster: admins mark agreed / briefed without opening the form. */
export async function quickCrewFlag(form: FormData) {
  const s = await requireAdmin();
  const personId = Number(form.get("personId"));
  const field = String(form.get("field"));
  const value = String(form.get("value"));
  if (field === "agreed") await saveDetails(s, personId, { agreed: asAgreed(value) });
  else if (field === "briefed") await saveDetails(s, personId, { briefed: value === "1" });
  else throw new Error("Unknown field");
  await journal(s.name, `crew roster: ${field}=${value} for person #${personId}`);
  bump();
  redirect(`/crew/people#p-${personId}`);
}
