import { and, eq } from "drizzle-orm";
import { db, ready, schema } from "@/db/client";
import { JOB_NIGHTS, type JobNight, type NightJob } from "@/db/schema";
import { crewMembers, type CrewMember } from "./people";
import type { Actor } from "./kit";
import { nowIso } from "./time";

// JobNight jobs: the things each rider and crew member has to do on the Friday
// night (before day 1) and the Saturday night (before day 2). One list per
// person per night. You tick your own; an admin (the crew chief) can tick,
// add to or clear anyone's, and sees everyone's lists together.

export const NIGHT_LABELS: Record<JobNight, string> = { fri: "Friday night", sat: "Saturday night" };
export const NIGHT_DATES: Record<JobNight, string> = { fri: "13 Nov in London, before day 1", sat: "14 Nov in Loughborough, before day 2" };

export const asNight = (v: string | null | undefined): JobNight => (JOB_NIGHTS.includes(v as JobNight) ? (v as JobNight) : "fri");

/** The usual list, offered as a starting point. One tap adds the lot (skipping
 *  anything already on the list); people then add or delete what they like. */
export const STANDARD_JOBS: Record<"rider" | "crew", string[]> = {
  rider: [
    "Charge front and rear lights",
    "Charge cycling computer",
    "Charge phone",
    "Charge power bank",
    "Charge headphones or earpiece",
    "Load tomorrow's route on the computer",
    "Pump tyres",
    "Check brakes, gears and chain — lube the chain",
    "Fill bottles",
    "Lay out tomorrow's kit — check the weather first",
    "Pin on number, pack rain jacket",
    "Pack food and gels for the pockets",
    "Phone, cash, card and ID in the saddle bag or jersey",
    "Set the alarm",
  ],
  crew: [
    "Charge phone",
    "Charge power bank",
    "Charge the vehicle tracker",
    "Fuel the vehicle",
    "Run the vehicle checklist",
    "Fill water carriers and the cool box",
    "Load tomorrow's route on the phone or sat nav",
    "Check tomorrow's stops and times",
    "Check the first aid kit is in the vehicle",
    "Sort tomorrow's food and drinks",
    "Lay out warm and waterproof clothes",
    "Set the alarm",
  ],
};

export function canEditJobs(actor: Actor, personId: number): boolean {
  return actor.role === "admin" || actor.pid === personId;
}

const clip = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);

export async function jobsFor(personId: number, night?: JobNight): Promise<NightJob[]> {
  await ready();
  const where = night ? and(eq(schema.nightJobs.personId, personId), eq(schema.nightJobs.night, night)) : eq(schema.nightJobs.personId, personId);
  const rows = await db.select().from(schema.nightJobs).where(where).all();
  return rows.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
}

export async function allJobs(): Promise<NightJob[]> {
  await ready();
  const rows = await db.select().from(schema.nightJobs).all();
  return rows.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
}

export async function getJob(id: number): Promise<NightJob | undefined> {
  if (!Number.isInteger(id) || id <= 0) return undefined;
  await ready();
  return db.select().from(schema.nightJobs).where(eq(schema.nightJobs.id, id)).get();
}

/** Add several jobs at once — one per line; "Pump tyres — 90 psi" puts the
 *  rest in the note. Lines already on the list are skipped. Returns how many
 *  were added. */
export async function addJobLines(actor: Actor, personId: number, night: JobNight, text: string): Promise<number> {
  await ready();
  const existing = await jobsFor(personId, night);
  const have = new Set(existing.map((e) => e.name.toLowerCase()));
  let sort = existing.reduce((m, r) => Math.max(m, r.sortOrder), 0);
  let added = 0;
  const at = nowIso();
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.replace(/^\s*[-*•☐☑✓]\s*/, "").trim();
    if (!line) continue;
    let note = "";
    const dash = /^(.+?)\s+[—–]\s+(.+)$/.exec(line);
    if (dash) [line, note] = [dash[1], dash[2]];
    line = clip(line, 120);
    if (!line || have.has(line.toLowerCase())) continue;
    have.add(line.toLowerCase());
    sort += 10;
    await db.insert(schema.nightJobs).values({ night, personId, name: line, note: clip(note, 200), sortOrder: sort, addedBy: actor.name, addedAt: at });
    added++;
  }
  return added;
}

export async function setJobChecked(actor: Actor, id: number, checked: boolean): Promise<boolean> {
  const j = await getJob(id);
  if (!j || !canEditJobs(actor, j.personId)) return false;
  await db
    .update(schema.nightJobs)
    .set({ checked, checkedBy: checked ? actor.name : "", checkedAt: checked ? nowIso() : "" })
    .where(eq(schema.nightJobs.id, id));
  return true;
}

export async function saveJob(actor: Actor, id: number, input: { name: string; note: string }): Promise<boolean> {
  const j = await getJob(id);
  if (!j || !canEditJobs(actor, j.personId)) return false;
  const name = clip(input.name, 120);
  if (!name) return false;
  await db.update(schema.nightJobs).set({ name, note: clip(input.note, 200) }).where(eq(schema.nightJobs.id, id));
  return true;
}

export async function deleteJob(actor: Actor, id: number): Promise<boolean> {
  const j = await getJob(id);
  if (!j || !canEditJobs(actor, j.personId)) return false;
  await db.delete(schema.nightJobs).where(eq(schema.nightJobs.id, id));
  return true;
}

/** Copy one night's list to the other (unticked), skipping jobs already there. */
export async function copyNight(actor: Actor, personId: number, from: JobNight, to: JobNight): Promise<number> {
  if (from === to || !canEditJobs(actor, personId)) return 0;
  const src = await jobsFor(personId, from);
  const text = src.map((j) => (j.note ? `${j.name} — ${j.note}` : j.name)).join("\n");
  return addJobLines(actor, personId, to, text);
}

/** Untick a night's list for someone — for starting again. */
export async function resetNight(actor: Actor, personId: number, night: JobNight): Promise<boolean> {
  if (!canEditJobs(actor, personId)) return false;
  await ready();
  await db
    .update(schema.nightJobs)
    .set({ checked: false, checkedBy: "", checkedAt: "" })
    .where(and(eq(schema.nightJobs.personId, personId), eq(schema.nightJobs.night, night)));
  return true;
}

// ---- The combined view ------------------------------------------------------

export type PersonNight = { person: CrewMember; night: JobNight; jobs: NightJob[]; done: number; total: number };

/** Everyone, both nights, riders first — the crew chief's view. People with no
 *  list yet are included with an empty one so the gaps show. */
export async function everyonesJobs(): Promise<{ people: CrewMember[]; cells: Map<string, PersonNight> }> {
  const people = (await crewMembers()).sort((a, b) => Number(b.isRider) - Number(a.isRider) || a.sortOrder - b.sortOrder || a.shortName.localeCompare(b.shortName));
  const jobs = await allJobs();
  const cells = new Map<string, PersonNight>();
  for (const person of people) {
    for (const night of JOB_NIGHTS) {
      const mine = jobs.filter((j) => j.personId === person.id && j.night === night);
      cells.set(`${person.id}:${night}`, { person, night, jobs: mine, done: mine.filter((j) => j.checked).length, total: mine.length });
    }
  }
  return { people, cells };
}
