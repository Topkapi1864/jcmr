import { eq } from "drizzle-orm";
import { db, ready, schema } from "@/db/client";
import { AGREED, type Agreed, type CrewDetails, type Person } from "@/db/schema";
import { nowIso } from "./time";
import type { Actor } from "./kit";

export type CrewMember = Person & { d: CrewDetails; isRider: boolean };

const EMPTY: Omit<CrewDetails, "personId"> = {
  crewRole: "",
  agreed: "unknown",
  briefed: false,
  mobile: "",
  dob: "",
  skills: "",
  firstAid: "",
  vehicle: "",
  dietary: "",
  emergencyName: "",
  emergencyPhone: "",
  availability: "",
  notes: "",
  updatedBy: "",
  updatedAt: "",
};

export const asAgreed = (v: string): Agreed => (AGREED.includes(v as Agreed) ? (v as Agreed) : "unknown");

/** Everyone on the sign-in list, with their details (blank if none yet). Fiona is an AI and is not crew. */
export async function crewMembers(): Promise<CrewMember[]> {
  await ready();
  const people = await db.select().from(schema.people).where(eq(schema.people.active, true)).orderBy(schema.people.sortOrder, schema.people.shortName).all();
  const details = await db.select().from(schema.crewDetails).all();
  const byId = new Map(details.map((d) => [d.personId, d]));
  const riders = await db.select().from(schema.riders).all();
  const riderPids = new Set(riders.map((r) => r.personId));
  return people
    .filter((p) => p.shortName !== "Fiona")
    .map((p) => {
      const d = byId.get(p.id) ?? { personId: p.id, ...EMPTY };
      const isRider = riderPids.has(p.id);
      // Riders ride; they are not crew, so their role is fixed and the crew questions don't apply.
      if (isRider) {
        d.crewRole = "Rider";
        d.agreed = "yes";
        d.briefed = false;
      }
      return { ...p, d, isRider };
    });
}

export async function crewMember(id: number): Promise<CrewMember | undefined> {
  return (await crewMembers()).find((p) => p.id === id);
}

export function canEditMember(actor: Actor, personId: number) {
  return actor.role === "admin" || actor.pid === personId;
}

export type DetailsPatch = Partial<Omit<CrewDetails, "personId" | "updatedBy" | "updatedAt">> & { email?: string };

export async function saveDetails(actor: Actor, personId: number, patch: DetailsPatch) {
  await ready();
  const { email, ...rest } = patch;
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) {
    if (v === undefined) continue;
    clean[k] = typeof v === "string" ? v.trim().slice(0, k === "notes" || k === "skills" ? 1000 : 120) : v;
  }
  if (typeof clean.agreed === "string") clean.agreed = asAgreed(clean.agreed);
  const vals = { ...clean, updatedBy: actor.name, updatedAt: nowIso() };
  const ex = await db.select().from(schema.crewDetails).where(eq(schema.crewDetails.personId, personId)).get();
  if (ex) await db.update(schema.crewDetails).set(vals).where(eq(schema.crewDetails.personId, personId));
  else await db.insert(schema.crewDetails).values({ personId, ...vals });
  if (email !== undefined) await db.update(schema.people).set({ email: email.trim() || null }).where(eq(schema.people.id, personId));
}

/** Age on the day of the ride (14 Nov 2026), for insurance forms. */
export function ageOnRide(dob: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  let age = 2026 - y;
  if (mo > 11 || (mo === 11 && d > 14)) age--;
  return age;
}
