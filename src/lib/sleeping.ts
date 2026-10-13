import { and, asc, eq } from "drizzle-orm";
import { db, ready, schema } from "@/db/client";
import { NIGHTS, type Night, type SleepingPlace, type SleepingRow } from "@/db/schema";
import { nowIso } from "./time";
import type { Actor } from "./kit";

export const asNight = (v: string): Night | null => (NIGHTS.includes(v as Night) ? (v as Night) : null);

export async function places(includeRetired = false): Promise<SleepingPlace[]> {
  await ready();
  const rows = await db.select().from(schema.sleepingPlaces).orderBy(asc(schema.sleepingPlaces.sortOrder), asc(schema.sleepingPlaces.name)).all();
  return includeRetired ? rows : rows.filter((p) => p.active);
}

export async function allSleeping(): Promise<SleepingRow[]> {
  await ready();
  return db.select().from(schema.sleeping).all();
}

export function canEditPerson(actor: Actor, personId: number) {
  return actor.role === "admin" || actor.pid === personId;
}

/** Save all four nights for one person in one go. Empty place + empty note clears the night. */
export async function savePerson(actor: Actor, personId: number, nights: Record<Night, { placeId: number | null; note: string }>) {
  await ready();
  const at = nowIso();
  for (const night of NIGHTS) {
    const v = nights[night];
    const where = and(eq(schema.sleeping.personId, personId), eq(schema.sleeping.night, night));
    const ex = await db.select().from(schema.sleeping).where(where).get();
    if (v.placeId === null && !v.note.trim()) {
      if (ex) await db.delete(schema.sleeping).where(where);
      continue;
    }
    const patch = { placeId: v.placeId, note: v.note.trim().slice(0, 200), updatedBy: actor.name, updatedAt: at };
    if (ex) {
      if (ex.placeId !== patch.placeId || ex.note !== patch.note) await db.update(schema.sleeping).set(patch).where(where);
    } else {
      await db.insert(schema.sleeping).values({ personId, night, ...patch });
    }
  }
}

export async function savePlace(row: { id?: number; name: string; town: string; beds: number | null; notes: string; active: boolean }) {
  await ready();
  const v = { name: row.name.trim().slice(0, 80), town: row.town.trim().slice(0, 40), beds: row.beds, notes: row.notes.trim().slice(0, 200), active: row.active };
  if (!v.name) throw new Error("A place needs a name");
  if (row.id) await db.update(schema.sleepingPlaces).set(v).where(eq(schema.sleepingPlaces.id, row.id));
  else await db.insert(schema.sleepingPlaces).values(v);
}

/** Seed the places we already know about (idempotent by name). */
export async function seedPlaces() {
  await ready();
  const want: { name: string; town: string; beds?: number; notes?: string; sort: number }[] = [
    { name: "Own home", town: "", notes: "Sleeping in your own bed", sort: 1 },
    { name: "32 Castelnau (Gary's)", town: "London", notes: "Where Mum died and where the ride starts", sort: 10 },
    { name: "Hotel in Barnes (TBC)", town: "London", notes: "If the house is full", sort: 11 },
    { name: "Robyn (camper)", town: "", beds: 6, notes: "Six-berth motorhome — wherever she is parked that night", sort: 12 },
    { name: "Link Hotel", town: "Loughborough", notes: "Saturday night, provisional — 5am breakfast, bike storage", sort: 20 },
    { name: "Yasmin's Airbnb", town: "Loughborough", notes: "8 minutes from the Link Hotel", sort: 21 },
    { name: "Family in Yeadon", town: "Yeadon", notes: "Sunday night after the finish", sort: 30 },
    { name: "Hotel in Yeadon / Leeds (TBC)", town: "Yeadon", sort: 31 },
    { name: "Not there that night", town: "", notes: "Not with the group", sort: 90 },
  ];
  let added = 0;
  for (const w of want) {
    const ex = await db.select().from(schema.sleepingPlaces).where(eq(schema.sleepingPlaces.name, w.name)).get();
    if (ex) continue;
    await db.insert(schema.sleepingPlaces).values({ name: w.name, town: w.town, beds: w.beds ?? null, notes: w.notes ?? "", sortOrder: w.sort });
    added++;
  }
  return added;
}
