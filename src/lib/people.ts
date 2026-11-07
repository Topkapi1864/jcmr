import { eq } from "drizzle-orm";
import { db, ready, schema } from "@/db/client";
import { AGREED, type Agreed, type CrewDetails, type Person, type PersonPhoto } from "@/db/schema";
import { nowIso } from "./time";
import type { Actor } from "./kit";

/** photoAt: when their picture was last changed (null = no picture); goes in the ?v= of the picture's URL so it can be cached. */
export type CrewMember = Person & { d: CrewDetails; isRider: boolean; photoAt: string | null };

/** The picture's address for an <img>, or null when there is none. */
export const photoUrl = (p: { id: number; photoAt: string | null }) => (p.photoAt ? `/api/people/photo/${p.id}?v=${encodeURIComponent(p.photoAt)}` : null);

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
  // Only when each picture changed, never the pictures themselves (a list page would be megabytes).
  const photos = await db.select({ personId: schema.peoplePhotos.personId, updatedAt: schema.peoplePhotos.updatedAt }).from(schema.peoplePhotos).all();
  const photoAt = new Map(photos.map((r) => [r.personId, r.updatedAt]));
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
      return { ...p, d, isRider, photoAt: photoAt.get(p.id) ?? null };
    });
}

// ---- Pictures -------------------------------------------------------------

const PHOTO_PREFIX = "data:image/jpeg;base64,";

/** The stored picture (a JPEG data: URL) for the API route. */
export async function personPhoto(personId: number): Promise<PersonPhoto | undefined> {
  await ready();
  return db.select().from(schema.peoplePhotos).where(eq(schema.peoplePhotos.personId, personId)).get();
}

/** Keep (photo = a JPEG data: URL from the picker) or remove (photo = null) someone's picture. Returns what was done. */
export async function savePersonPhoto(actor: Actor, personId: number, photo: string | null): Promise<"kept" | "removed" | "unchanged"> {
  await ready();
  if (photo === null) {
    const r = await db.delete(schema.peoplePhotos).where(eq(schema.peoplePhotos.personId, personId)).returning({ personId: schema.peoplePhotos.personId }).all();
    return r.length ? "removed" : "unchanged";
  }
  if (!photo.startsWith(PHOTO_PREFIX) || photo.length > 2_000_000) throw new Error("That picture didn't come through — try again");
  const vals = { photo, updatedBy: actor.name, updatedAt: nowIso() };
  const ex = await db.select({ personId: schema.peoplePhotos.personId }).from(schema.peoplePhotos).where(eq(schema.peoplePhotos.personId, personId)).get();
  if (ex) await db.update(schema.peoplePhotos).set(vals).where(eq(schema.peoplePhotos.personId, personId));
  else await db.insert(schema.peoplePhotos).values({ personId, ...vals });
  return "kept";
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
