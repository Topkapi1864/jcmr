"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { journal, requireAdmin, requireCrew } from "@/lib/auth";
import { canEditMember, crewMember } from "@/lib/people";
import { setSetting } from "@/lib/settings";
import { clearPersonPositions, resetTrackerToken } from "@/lib/tracking";

function bump() {
  revalidatePath("/crew/track", "layout");
  revalidatePath("/live");
  revalidatePath("/");
}

/** A new tracking address for this person; the old one stops working at once. */
export async function newAddress(form: FormData) {
  const s = await requireCrew();
  const pid = Number(form.get("personId"));
  const who = await crewMember(pid);
  if (!who || !canEditMember(s, pid)) return;
  await resetTrackerToken(pid);
  await journal(s.name, `tracking: new address for ${who.shortName}`);
  bump();
  redirect(pid === s.pid ? "/crew/track?reset=1" : `/crew/track/${pid}?reset=1`);
}

/** Wipe this person's stored fixes (after a test run, say). */
export async function clearMine(form: FormData) {
  const s = await requireCrew();
  const pid = Number(form.get("personId"));
  const who = await crewMember(pid);
  if (!who || !canEditMember(s, pid)) return;
  await clearPersonPositions(pid);
  await journal(s.name, `tracking: cleared ${who.shortName}'s positions`);
  bump();
  redirect(pid === s.pid ? "/crew/track?cleared=1" : `/crew/track/${pid}?cleared=1`);
}

/** Whether the public live map shows the riders' phones. */
export async function setPublicTracking(form: FormData) {
  const s = await requireAdmin();
  const on = form.get("on") === "1";
  await setSetting("tracking.public", on ? "true" : "false");
  await journal(s.name, `tracking: public rider positions ${on ? "on" : "off"}`);
  bump();
  redirect("/crew/track");
}
