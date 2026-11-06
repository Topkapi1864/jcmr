import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { db, ready, schema } from "@/db/client";
import type { PersonPosition } from "@/db/schema";
import { listVehicles, positionsFor as vehiclePositionsFor, validLatLng, vehicleColour } from "./vehicles";
import { loadProfiles, nearestOnLine } from "./route";
import { getSetting } from "./settings";
import { nowIso } from "./time";
import { randomToken } from "./util";
import type { Ping } from "./ping";

// Live tracking of people — the riders and the crew — from the OwnTracks app
// (or any app that can post a position to a URL) on each person's phone.
// Each person has their own secret address, /api/track/<token>; the phone posts
// there and the fixes land in people_positions. Vehicles already have the same
// arrangement (src/lib/vehicles.ts); this file reads both for the crew map and
// works out the riders' mile along the route for the public page.

const TRAIL = 400; // fixes kept per person (a day at one a minute is ~500; the trail is for the map, not the record)
export const FRESH_MS = 20 * 60_000; // a fix older than this is "stale" on the map and ignored for the mile
const ON_ROUTE_MI = 1.5; // further than this from the line and the fix says nothing about the mile

// ---- Tokens ------------------------------------------------------------------

/** This person's tracking token, minted on first ask. */
export async function trackerTokenFor(personId: number): Promise<string> {
  await ready();
  const row = await db.select({ token: schema.people.trackerToken }).from(schema.people).where(eq(schema.people.id, personId)).get();
  if (!row) throw new Error("No such person");
  if (row.token) return row.token;
  const token = randomToken(16);
  await db.update(schema.people).set({ trackerToken: token }).where(eq(schema.people.id, personId));
  return token;
}

/** A new address; the old one stops working at once. */
export async function resetTrackerToken(personId: number): Promise<string> {
  await ready();
  const token = randomToken(16);
  await db.update(schema.people).set({ trackerToken: token }).where(eq(schema.people.id, personId));
  return token;
}

export async function personByToken(token: string) {
  await ready();
  if (!/^[a-f0-9]{16,}$/i.test(token)) return undefined;
  return db
    .select({ id: schema.people.id, shortName: schema.people.shortName, active: schema.people.active })
    .from(schema.people)
    .where(eq(schema.people.trackerToken, token.toLowerCase()))
    .get();
}

// ---- Positions -----------------------------------------------------------------

export async function addPersonPosition(personId: number, p: Ping & { source?: "phone" | "tracker" }): Promise<boolean> {
  await ready();
  if (!validLatLng(p.lat, p.lng)) return false;
  const last = await db.select().from(schema.peoplePositions).where(eq(schema.peoplePositions.personId, personId)).orderBy(desc(schema.peoplePositions.id)).limit(1).get();
  const at = p.at && !Number.isNaN(Date.parse(p.at)) && Date.parse(p.at) <= Date.now() + 120_000 ? new Date(p.at).toISOString() : nowIso();
  // At most one stored fix every 10 seconds per person; and nothing older than what we have
  // (OwnTracks flushes a queue of buffered fixes when the signal comes back, oldest first — those are fine).
  if (last && Math.abs(Date.parse(at) - Date.parse(last.at)) < 10_000) return true;
  const num = (v: number | null | undefined) => (v != null && Number.isFinite(v) ? v : null);
  await db.insert(schema.peoplePositions).values({
    personId,
    lat: Math.round(p.lat * 1e6) / 1e6,
    lng: Math.round(p.lng * 1e6) / 1e6,
    accuracy: num(p.accuracy),
    speed: num(p.speed),
    battery: num(p.battery),
    source: p.source ?? "tracker",
    by: p.by.slice(0, 40),
    at,
  });
  const cut = await db.select({ id: schema.peoplePositions.id }).from(schema.peoplePositions).where(eq(schema.peoplePositions.personId, personId)).orderBy(desc(schema.peoplePositions.id)).limit(1).offset(TRAIL).get();
  if (cut) await db.delete(schema.peoplePositions).where(and(eq(schema.peoplePositions.personId, personId), lt(schema.peoplePositions.id, cut.id + 1)));
  return true;
}

export async function clearPersonPositions(personId: number) {
  await ready();
  await db.delete(schema.peoplePositions).where(eq(schema.peoplePositions.personId, personId));
}

/** Recent fixes per person, oldest first (so the trail draws forwards and `.at(-1)` is the latest). */
export async function peoplePositionsFor(personIds: number[], trail = 60): Promise<Map<number, PersonPosition[]>> {
  await ready();
  const out = new Map<number, PersonPosition[]>();
  if (!personIds.length) return out;
  const rows = await db.select().from(schema.peoplePositions).where(inArray(schema.peoplePositions.personId, personIds)).orderBy(desc(schema.peoplePositions.at), desc(schema.peoplePositions.id)).all();
  for (const r of rows) {
    const list = out.get(r.personId) ?? [];
    if (list.length < trail) list.push(r);
    out.set(r.personId, list);
  }
  for (const [k, v] of out) out.set(k, v.reverse());
  return out;
}

// ---- Where on the route ------------------------------------------------------

/** The ride mile nearest to a point, if the point is near the line at all. Day 2 miles follow on from day 1's. */
export function routeMileFor(lat: number, lng: number): { mile: number; day: 1 | 2; offMi: number } | null {
  const [d1, d2] = loadProfiles();
  let best: { mile: number; day: 1 | 2; offMi: number } | null = null;
  for (const prof of [d1, d2]) {
    if (!prof.points.length) continue;
    const n = nearestOnLine(prof.points, lat, lng);
    if (n.distMi > ON_ROUTE_MI) continue;
    const mile = (prof.day === 2 ? d1.miles : 0) + prof.points[n.i][3];
    if (!best || n.distMi < best.offMi) best = { mile: Math.round(mile * 10) / 10, day: prof.day as 1 | 2, offMi: n.distMi };
  }
  return best;
}

// ---- Feeds -------------------------------------------------------------------

export type Fix = { lat: number; lng: number; at: string; accuracy: number | null; speed: number | null; battery: number | null; source: string; by: string };

export type TrackedPerson = {
  id: number;
  name: string;
  isRider: boolean;
  colour: string;
  hasToken: boolean;
  last: Fix | null;
  mile: number | null;
  trail: [number, number][];
};

export type TrackedVehicle = { id: number; name: string; colour: string; registration: string; last: Fix | null; trail: [number, number][] };

export type TrackingFeed = { now: string; vehicles: TrackedVehicle[]; people: TrackedPerson[] };

const fix = (p: { lat: number; lng: number; at: string; accuracy: number | null; speed: number | null; battery: number | null; source: string; by: string }): Fix => ({
  lat: p.lat,
  lng: p.lng,
  at: p.at,
  accuracy: p.accuracy,
  speed: p.speed,
  battery: p.battery,
  source: p.source,
  by: p.by,
});

// Riders get the ride's own colours; crew a steadier set. Tokens only — Leaflet resolves them in the browser.
const RIDER_COLOURS = ["var(--vehicle-v5)", "var(--vehicle-v4)", "var(--vehicle-v6)", "var(--vehicle-v8)"];
const CREW_COLOURS = ["var(--vehicle-v7)", "var(--vehicle-v2)", "var(--vehicle-v3)", "var(--vehicle-v1)"];

/** Everyone (active people bar Fiona) and every active vehicle, with their latest fix and trail. The crew map's feed. */
export async function trackingFeed(opts: { trail?: number; vehicleId?: number | null } = {}): Promise<TrackingFeed> {
  await ready();
  const trailN = opts.trail ?? 60;
  const vehicles = (await listVehicles()).filter((v) => !opts.vehicleId || v.id === opts.vehicleId);
  const vpos = await vehiclePositionsFor(
    vehicles.map((v) => v.id),
    trailN,
  );
  const people = opts.vehicleId
    ? []
    : (await db.select().from(schema.people).where(eq(schema.people.active, true)).orderBy(schema.people.sortOrder, schema.people.shortName).all()).filter((p) => p.shortName !== "Fiona");
  const riderPids = new Set((await db.select({ pid: schema.riders.personId }).from(schema.riders).all()).map((r) => r.pid));
  const ppos = await peoplePositionsFor(
    people.map((p) => p.id),
    trailN,
  );
  let ri = 0;
  let ci = 0;
  return {
    now: new Date().toISOString(),
    vehicles: vehicles.map((v) => {
      const trail = vpos.get(v.id) ?? [];
      const last = trail.at(-1) ?? null;
      return { id: v.id, name: v.name, colour: vehicleColour(v.colour), registration: v.registration, last: last && fix(last), trail: trail.map((p) => [p.lat, p.lng] as [number, number]) };
    }),
    people: people.map((p) => {
      const isRider = riderPids.has(p.id);
      const colour = isRider ? RIDER_COLOURS[ri++ % RIDER_COLOURS.length] : CREW_COLOURS[ci++ % CREW_COLOURS.length];
      const trail = ppos.get(p.id) ?? [];
      const last = trail.at(-1) ?? null;
      const onRoute = last ? routeMileFor(last.lat, last.lng) : null;
      return {
        id: p.id,
        name: p.shortName,
        isRider,
        colour,
        hasToken: !!p.trackerToken,
        last: last && fix(last),
        mile: onRoute?.mile ?? null,
        trail: trail.map((q) => [q.lat, q.lng] as [number, number]),
      };
    }),
  };
}

export type RiderLive = { id: number; name: string; lat: number; lng: number; at: string; mile: number | null; stale: boolean };

/** The riders' latest fixes for the public page, plus the ride's mile: the middle rider's, so one odd phone can't drag it. */
export async function ridersLive(): Promise<{ riders: RiderLive[]; mile: number | null; at: string | null }> {
  await ready();
  const riders = await db
    .select({ id: schema.riders.id, name: schema.riders.displayName, pid: schema.riders.personId })
    .from(schema.riders)
    .orderBy(schema.riders.sortOrder)
    .all();
  const pids = riders.map((r) => r.pid).filter((p): p is number => p != null);
  const pos = await peoplePositionsFor(pids, 1);
  const now = Date.now();
  const out: RiderLive[] = [];
  for (const r of riders) {
    const last = r.pid != null ? pos.get(r.pid)?.at(-1) : undefined;
    if (!last) continue;
    const onRoute = routeMileFor(last.lat, last.lng);
    out.push({ id: r.id, name: r.name, lat: last.lat, lng: last.lng, at: last.at, mile: onRoute?.mile ?? null, stale: now - Date.parse(last.at) > FRESH_MS });
  }
  const fresh = out.filter((r) => !r.stale && r.mile != null).sort((a, b) => a.mile! - b.mile!);
  const mid = fresh.length ? fresh[Math.floor(fresh.length / 2)] : null;
  return { riders: out, mile: mid?.mile ?? null, at: mid?.at ?? null };
}

/** Whether the public live map shows the riders' phones. Crew sessions always see them. */
export async function trackingPublic(): Promise<boolean> {
  return (await getSetting("tracking.public")) === "true";
}
