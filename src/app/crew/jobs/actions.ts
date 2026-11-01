"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { journal, requireCrew } from "@/lib/auth";
import { addJobLines, asNight, canEditJobs, copyNight, deleteJob, getJob, NIGHT_LABELS, resetNight, saveJob, setJobChecked, STANDARD_JOBS } from "@/lib/jobs";
import { crewMember } from "@/lib/people";

function bump() {
  revalidatePath("/crew/jobs", "layout");
}

const str = (f: FormData, k: string) => String(f.get(k) ?? "");

/** Where to go back to: a person's page, with the night kept. */
function back(personId: number, night: string, q = "") {
  return `/crew/jobs/${personId}?night=${night}${q ? `&${q}` : ""}`;
}

async function target(form: FormData) {
  const s = await requireCrew();
  const personId = Number(form.get("personId"));
  const night = asNight(str(form, "night"));
  if (!canEditJobs(s, personId)) redirect(back(personId, night, "denied=1"));
  const who = await crewMember(personId);
  if (!who) redirect("/crew/jobs?missing=1");
  return { s, personId, night, who };
}

/** Tick or untick one job — called from the tick box, no reload. */
export async function tickJob(id: number, checked: boolean): Promise<boolean> {
  const s = await requireCrew();
  const ok = await setJobChecked(s, Number(id), !!checked);
  bump();
  return ok;
}

export async function addJobs(form: FormData) {
  const { s, personId, night, who } = await target(form);
  const n = await addJobLines(s, personId, night, str(form, "lines"));
  if (n) await journal(s.name, `jobs: added ${n} to ${who.shortName}'s ${NIGHT_LABELS[night]} list`);
  bump();
  redirect(back(personId, night, `added=${n}`));
}

export async function addStandardJobs(form: FormData) {
  const { s, personId, night, who } = await target(form);
  const list = STANDARD_JOBS[who.isRider ? "rider" : "crew"];
  const n = await addJobLines(s, personId, night, list.join("\n"));
  if (n) await journal(s.name, `jobs: added the standard list (${n}) to ${who.shortName}'s ${NIGHT_LABELS[night]} list`);
  bump();
  redirect(back(personId, night, `added=${n}`));
}

export async function saveJobItem(form: FormData) {
  const s = await requireCrew();
  const id = Number(form.get("id"));
  const j = await getJob(id);
  if (!j) redirect("/crew/jobs?missing=1");
  if (form.get("delete")) {
    const ok = await deleteJob(s, id);
    if (ok) await journal(s.name, `jobs: deleted "${j.name}" from ${j.night} list of person #${j.personId}`);
    bump();
    redirect(back(j.personId, j.night, ok ? "deleted=1" : "denied=1"));
  }
  const ok = await saveJob(s, id, { name: str(form, "name"), note: str(form, "note") });
  bump();
  redirect(back(j.personId, j.night, ok ? "saved=1" : "denied=1"));
}

export async function copyNightJobs(form: FormData) {
  const { s, personId, night, who } = await target(form);
  const to = night === "fri" ? "sat" : "fri";
  const n = await copyNight(s, personId, night, to);
  if (n) await journal(s.name, `jobs: copied ${n} from ${who.shortName}'s ${NIGHT_LABELS[night]} list to ${NIGHT_LABELS[to]}`);
  bump();
  redirect(back(personId, to, `added=${n}`));
}

export async function resetNightJobs(form: FormData) {
  const { s, personId, night, who } = await target(form);
  await resetNight(s, personId, night);
  await journal(s.name, `jobs: unticked ${who.shortName}'s ${NIGHT_LABELS[night]} list`);
  bump();
  redirect(back(personId, night, "reset=1"));
}
