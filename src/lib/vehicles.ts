import { and, asc, desc, eq, inArray, lt } from "drizzle-orm";
import { db, ready, schema } from "@/db/client";
import { KIT_STORAGE, SEATS, VEHICLE_PALETTE, type Seat, type Vehicle, type VehicleChecklistRow, type VehicleCrewRow, type VehiclePosition } from "@/db/schema";
import { nowIso } from "./time";
import { randomToken } from "./util";
import type { Actor } from "./kit";

// ---- Colour --------------------------------------------------------------

const HEX = /^#[0-9a-f]{6}$/i;

/** A CSS value for a vehicle's colour: a palette token, or the custom #rrggbb it was given. */
export function vehicleColour(c: string | null | undefined): string {
  if (c && HEX.test(c)) return c;
  const slot = VEHICLE_PALETTE.includes(c as (typeof VEHICLE_PALETTE)[number]) ? c : "v1";
  return `var(--vehicle-${slot})`;
}

export function cleanColour(v: string): string {
  const t = v.trim();
  if (HEX.test(t)) return t.toLowerCase();
  return VEHICLE_PALETTE.includes(t as (typeof VEHICLE_PALETTE)[number]) ? t : "v1";
}

export const isCustomColour = (c: string) => HEX.test(c);

// ---- Vehicles --------------------------------------------------------------

/** Every column except the photo (which can be a few hundred KB). */
const LIGHT = {
  id: schema.vehicles.id,
  name: schema.vehicles.name,
  colour: schema.vehicles.colour,
  make: schema.vehicles.make,
  registration: schema.vehicles.registration,
  role: schema.vehicles.role,
  strategy: schema.vehicles.strategy,
  contents: schema.vehicles.contents,
  kitStorage: schema.vehicles.kitStorage,
  trackerUrl: schema.vehicles.trackerUrl,
  token: schema.vehicles.token,
  sortOrder: schema.vehicles.sortOrder,
  active: schema.vehicles.active,
  updatedBy: schema.vehicles.updatedBy,
  updatedAt: schema.vehicles.updatedAt,
};
export type VehicleLite = Omit<Vehicle, "photo"> & { hasPhoto: boolean };

export async function listVehicles(includeRetired = false): Promise<VehicleLite[]> {
  await ready();
  const rows = await db.select({ ...LIGHT, hasPhoto: schema.vehicles.photo }).from(schema.vehicles).orderBy(asc(schema.vehicles.sortOrder), asc(schema.vehicles.id)).all();
  return rows.map((r) => ({ ...r, hasPhoto: !!r.hasPhoto })).filter((r) => includeRetired || r.active);
}

export async function getVehicle(id: number): Promise<VehicleLite | undefined> {
  await ready();
  const r = await db.select({ ...LIGHT, hasPhoto: schema.vehicles.photo }).from(schema.vehicles).where(eq(schema.vehicles.id, id)).get();
  return r ? { ...r, hasPhoto: !!r.hasPhoto } : undefined;
}

export async function vehiclePhoto(id: number): Promise<{ photo: string | null; updatedAt: string } | undefined> {
  await ready();
  return db.select({ photo: schema.vehicles.photo, updatedAt: schema.vehicles.updatedAt }).from(schema.vehicles).where(eq(schema.vehicles.id, id)).get();
}

export async function vehicleByToken(token: string) {
  await ready();
  if (!/^[a-f0-9]{16,}$/i.test(token)) return undefined;
  return db.select(LIGHT).from(schema.vehicles).where(eq(schema.vehicles.token, token.toLowerCase())).get();
}

const asStorage = (v: string) => (KIT_STORAGE.includes(v as (typeof KIT_STORAGE)[number]) ? v : "");
const clip = (v: string, n: number) => v.replace(/\r\n?/g, "\n").trim().slice(0, n);

export async function saveVehicle(
  actor: Actor,
  input: {
    id?: number;
    name: string;
    colour: string;
    make: string;
    registration: string;
    role: string;
    strategy: string;
    contents: string;
    kitStorage: string;
    trackerUrl: string;
    sortOrder?: number;
    photo?: string | null; // undefined = leave as is, null = remove
  },
): Promise<number> {
  await ready();
  const tracker = clip(input.trackerUrl, 500);
  const v = {
    name: clip(input.name, 60),
    colour: cleanColour(input.colour),
    make: clip(input.make, 80),
    registration: clip(input.registration, 16).toUpperCase(),
    role: clip(input.role, 4000),
    strategy: clip(input.strategy, 4000),
    contents: clip(input.contents, 4000),
    kitStorage: asStorage(input.kitStorage),
    trackerUrl: tracker && /^https?:\/\//i.test(tracker) ? tracker : "",
    updatedBy: actor.name,
    updatedAt: nowIso(),
    ...(input.sortOrder != null ? { sortOrder: input.sortOrder } : {}),
    ...(input.photo !== undefined ? { photo: input.photo } : {}),
  };
  if (!v.name) throw new Error("A vehicle needs a name");
  if (input.photo && (!input.photo.startsWith("data:image/jpeg;base64,") || input.photo.length > 2_500_000)) throw new Error("That photo didn't come through — try again");
  if (input.id) {
    await db.update(schema.vehicles).set(v).where(eq(schema.vehicles.id, input.id));
    return input.id;
  }
  const r = await db.insert(schema.vehicles).values({ ...v, token: randomToken(16) }).returning({ id: schema.vehicles.id }).get();
  return r.id;
}

export async function setVehicleActive(id: number, active: boolean) {
  await ready();
  await db.update(schema.vehicles).set({ active }).where(eq(schema.vehicles.id, id));
}

export async function rotateToken(id: number) {
  await ready();
  await db.update(schema.vehicles).set({ token: randomToken(16) }).where(eq(schema.vehicles.id, id));
}

// ---- Route points (for who is in which vehicle when) -------------------------

export type RoutePoint = { key: string; label: string; short: string; day: number };

/** The ride as an ordered list of points: each day's start, every stop, then the finish. */
export async function routePoints(): Promise<RoutePoint[]> {
  await ready();
  const days = await db.select().from(schema.routeDays).orderBy(asc(schema.routeDays.day)).all();
  const stops = await db.select().from(schema.routeStops).orderBy(asc(schema.routeStops.sortOrder), asc(schema.routeStops.approxMile)).all();
  const out: RoutePoint[] = [];
  for (const d of days) {
    out.push({ key: `day:${d.day}`, label: `Day ${d.day} start — ${d.startLabel}`, short: `D${d.day} start`, day: d.day });
    const ds = stops
      .filter((s) => s.dayId === d.id)
      .sort((a, b) => (a.approxMile ?? 1e9) - (b.approxMile ?? 1e9) || a.sortOrder - b.sortOrder)
      // The day's own start (mile 0) and end (overnight / finish) are the day points either side.
      .filter((s) => s.kind !== "overnight" && s.kind !== "finish" && !(s.approxMile === 0 || (s.sortOrder === 0 && s.approxMile == null)));
    for (const s of ds) {
      const name = s.name.replace(/^Stop\s*\d+\s*[—-]\s*/i, "");
      out.push({ key: `stop:${s.id}`, label: `Day ${d.day} · ${s.name}${s.approxMile != null ? ` (mile ${Math.round(s.approxMile)})` : ""}`, short: `D${d.day} ${name}`, day: d.day });
    }
  }
  const last = days.at(-1);
  out.push({ key: "end", label: `Finish${last ? ` — ${last.endLabel}` : ""}`, short: "Finish", day: last?.day ?? 2 });
  return out;
}

/** Index of a point in the ride; unknown keys (a deleted stop) fall back to the start or the end. */
export function pointIndex(points: RoutePoint[], key: string, fallback: "start" | "end"): number {
  const i = points.findIndex((p) => p.key === key);
  if (i >= 0) return i;
  return fallback === "start" ? 0 : points.length - 1;
}

/** The legs of the ride — the stretch between consecutive points. */
export function legsOf(points: RoutePoint[]) {
  return points.slice(0, -1).map((p, i) => ({ index: i, from: p, to: points[i + 1] }));
}

/** Does an assignment cover leg i (from points[i] to points[i+1])? */
export function covers(points: RoutePoint[], row: Pick<VehicleCrewRow, "fromPoint" | "untilPoint">, legIndex: number) {
  const a = pointIndex(points, row.fromPoint, "start");
  const b = pointIndex(points, row.untilPoint, "end");
  return a <= legIndex && legIndex < b;
}

// ---- Crew in vehicles -----------------------------------------------------

export async function allAssignments(): Promise<VehicleCrewRow[]> {
  await ready();
  return db.select().from(schema.vehicleCrew).orderBy(asc(schema.vehicleCrew.vehicleId), asc(schema.vehicleCrew.id)).all();
}

export async function saveAssignment(
  actor: Actor,
  input: { id?: number; vehicleId: number; personId: number; seat: string; fromPoint: string; untilPoint: string; note: string },
) {
  await ready();
  const v = {
    vehicleId: input.vehicleId,
    personId: input.personId,
    seat: (SEATS.includes(input.seat as Seat) ? input.seat : "passenger") as Seat,
    fromPoint: clip(input.fromPoint, 24) || "day:1",
    untilPoint: clip(input.untilPoint, 24) || "end",
    note: clip(input.note, 200),
    updatedBy: actor.name,
    updatedAt: nowIso(),
  };
  if (!v.vehicleId || !v.personId) throw new Error("Pick a person");
  if (input.id) await db.update(schema.vehicleCrew).set(v).where(eq(schema.vehicleCrew.id, input.id));
  else await db.insert(schema.vehicleCrew).values(v);
}

export async function deleteAssignment(id: number) {
  await ready();
  await db.delete(schema.vehicleCrew).where(eq(schema.vehicleCrew.id, id));
}

/** Problems worth flagging: a leg with no driver, two drivers, someone in two vehicles at once. */
export function assignmentWarnings(points: RoutePoint[], rows: VehicleCrewRow[], vehicleIds: number[], nameOf: (pid: number) => string, vehicleName: (vid: number) => string) {
  const out: string[] = [];
  const legs = legsOf(points);
  for (const vid of vehicleIds) {
    const vr = rows.filter((r) => r.vehicleId === vid);
    if (!vr.length) continue;
    const noDriver: string[] = [];
    for (const l of legs) {
      const drivers = vr.filter((r) => r.seat === "driver" && covers(points, r, l.index));
      if (drivers.length === 0) noDriver.push(l.from.short);
      if (drivers.length > 1) out.push(`${vehicleName(vid)}: two drivers from ${l.from.short} (${drivers.map((d) => nameOf(d.personId)).join(", ")})`);
    }
    if (noDriver.length === legs.length) out.push(`${vehicleName(vid)}: no driver yet`);
    else if (noDriver.length) out.push(`${vehicleName(vid)}: no driver from ${noDriver.join(", ")}`);
  }
  const people = [...new Set(rows.map((r) => r.personId))];
  for (const pid of people) {
    for (const l of legs) {
      const vs = rows.filter((r) => r.personId === pid && covers(points, r, l.index));
      if (new Set(vs.map((v) => v.vehicleId)).size > 1) {
        out.push(`${nameOf(pid)} is in ${vs.map((v) => vehicleName(v.vehicleId)).join(" and ")} at once (from ${l.from.short})`);
        break;
      }
    }
  }
  return [...new Set(out)];
}

// ---- Checklist --------------------------------------------------------------

export async function checklist(vehicleId?: number): Promise<VehicleChecklistRow[]> {
  await ready();
  const q = db.select().from(schema.vehicleChecklist);
  const rows = vehicleId ? await q.where(eq(schema.vehicleChecklist.vehicleId, vehicleId)).all() : await q.all();
  return rows.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
}

/** Add several items at once — one per line; "2 x Track pump" or "Track pump x2" sets the quantity. */
export async function addChecklistLines(vehicleId: number, text: string) {
  await ready();
  const existing = await checklist(vehicleId);
  let sort = existing.reduce((m, r) => Math.max(m, r.sortOrder), 0);
  let added = 0;
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.replace(/^\s*[-*•☐☑]\s*/, "").trim();
    if (!line) continue;
    let qty = 1;
    const pre = /^(\d{1,3})\s*[x×]\s+(.+)$/i.exec(line);
    const post = /^(.+?)\s*[x×]\s*(\d{1,3})$/i.exec(line);
    if (pre) [qty, line] = [Number(pre[1]), pre[2]];
    else if (post) [line, qty] = [post[1], Number(post[2])];
    let note = "";
    const dash = /^(.+?)\s+[—–]\s+(.+)$/.exec(line);
    if (dash) [line, note] = [dash[1], dash[2]];
    line = line.slice(0, 120);
    if (existing.some((e) => e.name.toLowerCase() === line.toLowerCase())) continue;
    sort += 10;
    await db.insert(schema.vehicleChecklist).values({ vehicleId, name: line, qty: Math.max(1, Math.min(999, qty)), note: note.slice(0, 200), sortOrder: sort });
    existing.push({ name: line } as VehicleChecklistRow);
    added++;
  }
  return added;
}

export async function setChecked(actor: Actor, id: number, checked: boolean) {
  await ready();
  await db
    .update(schema.vehicleChecklist)
    .set({ checked, checkedBy: checked ? actor.name : "", checkedAt: checked ? nowIso() : "" })
    .where(eq(schema.vehicleChecklist.id, id));
}

export async function saveChecklistRow(id: number, input: { name: string; qty: number; note: string }) {
  await ready();
  const name = clip(input.name, 120);
  if (!name) throw new Error("An item needs a name");
  await db
    .update(schema.vehicleChecklist)
    .set({ name, qty: Math.max(1, Math.min(999, Math.round(input.qty) || 1)), note: clip(input.note, 200) })
    .where(eq(schema.vehicleChecklist.id, id));
}

export async function deleteChecklistRow(id: number) {
  await ready();
  await db.delete(schema.vehicleChecklist).where(eq(schema.vehicleChecklist.id, id));
}

/** Untick everything — for running the check again on the morning. */
export async function resetChecklist(vehicleId: number) {
  await ready();
  await db.update(schema.vehicleChecklist).set({ checked: false, checkedBy: "", checkedAt: "" }).where(eq(schema.vehicleChecklist.vehicleId, vehicleId));
}

// ---- Positions ---------------------------------------------------------------

const TRAIL = 300;

export function validLatLng(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
}

export async function addPosition(
  vehicleId: number,
  p: { lat: number; lng: number; accuracy?: number | null; speed?: number | null; battery?: number | null; source: "phone" | "tracker" | "pasted"; by: string; at?: string },
): Promise<boolean> {
  await ready();
  if (!validLatLng(p.lat, p.lng)) return false;
  // At most one stored fix every 10 seconds per vehicle — trackers can be chatty.
  const last = await db.select().from(schema.vehiclePositions).where(eq(schema.vehiclePositions.vehicleId, vehicleId)).orderBy(desc(schema.vehiclePositions.id)).limit(1).get();
  const at = p.at && !Number.isNaN(Date.parse(p.at)) && Date.parse(p.at) <= Date.now() + 120_000 ? new Date(p.at).toISOString() : nowIso();
  if (last && p.source !== "pasted" && Math.abs(Date.parse(at) - Date.parse(last.at)) < 10_000) return true;
  const num = (v: number | null | undefined) => (v != null && Number.isFinite(v) ? v : null);
  await db.insert(schema.vehiclePositions).values({
    vehicleId,
    lat: Math.round(p.lat * 1e6) / 1e6,
    lng: Math.round(p.lng * 1e6) / 1e6,
    accuracy: num(p.accuracy),
    speed: num(p.speed),
    battery: num(p.battery),
    source: p.source,
    by: p.by.slice(0, 40),
    at,
  });
  // Keep a short trail per vehicle.
  const cut = await db.select({ id: schema.vehiclePositions.id }).from(schema.vehiclePositions).where(eq(schema.vehiclePositions.vehicleId, vehicleId)).orderBy(desc(schema.vehiclePositions.id)).limit(1).offset(TRAIL).get();
  if (cut) await db.delete(schema.vehiclePositions).where(and(eq(schema.vehiclePositions.vehicleId, vehicleId), lt(schema.vehiclePositions.id, cut.id + 1)));
  return true;
}

export async function clearPositions(vehicleId: number) {
  await ready();
  await db.delete(schema.vehiclePositions).where(eq(schema.vehiclePositions.vehicleId, vehicleId));
}

/** Latest fix per vehicle plus a trail of recent fixes (oldest first). */
export async function positionsFor(vehicleIds: number[], trail = 60): Promise<Map<number, VehiclePosition[]>> {
  await ready();
  const out = new Map<number, VehiclePosition[]>();
  if (!vehicleIds.length) return out;
  const rows = await db.select().from(schema.vehiclePositions).where(inArray(schema.vehiclePositions.vehicleId, vehicleIds)).orderBy(desc(schema.vehiclePositions.id)).all();
  for (const r of rows) {
    const list = out.get(r.vehicleId) ?? [];
    if (list.length < trail) list.push(r);
    out.set(r.vehicleId, list);
  }
  for (const [k, v] of out) out.set(k, v.reverse());
  return out;
}

/** Pull a latitude/longitude out of whatever was pasted: a Google / Apple Maps link
 *  (what WhatsApp gives you when you copy a shared location), a what3words-free
 *  "53.86, -1.69", or a geo: URI. */
export function parseLatLng(text: string): { lat: number; lng: number } | null {
  const t = decodeURIComponent(text.trim().replace(/\+/g, " "));
  const num = String.raw`(-?\d{1,3}\.\d+)`;
  const patterns = [
    new RegExp(String.raw`!3d${num}!4d${num}`), // google place data — the pin itself
    new RegExp(String.raw`[?&](?:q|query|ll|sll|daddr|destination|center)=(?:loc:)?${num}\s*,\s*${num}`), // ?q=53.8,-1.6
    new RegExp(String.raw`@${num},\s*${num}`), // google.com/maps/@53.8,-1.6,15z (the map's centre)
    new RegExp(String.raw`geo:${num},${num}`),
    new RegExp(String.raw`(?:^|[^\d.])${num}\s*,\s*${num}(?:[^\d]|$)`), // bare pair
  ];
  for (const re of patterns) {
    const m = re.exec(t);
    if (!m) continue;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (validLatLng(lat, lng)) return { lat, lng };
  }
  return null;
}

/** Short map links (maps.app.goo.gl, goo.gl/maps) hide the coordinates behind a redirect — follow it. */
export async function resolveMapLink(text: string): Promise<{ lat: number; lng: number } | null> {
  const direct = parseLatLng(text);
  if (direct) return direct;
  const m = /https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs|maps\.apple\/p)\/[\w\-./?=&%]+/i.exec(text);
  if (!m) return null;
  let url = m[0];
  for (let hop = 0; hop < 4; hop++) {
    try {
      const r = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(5000), headers: { "user-agent": "Mozilla/5.0 (JCMR crew board)" } });
      const next = r.headers.get("location");
      if (!next) {
        // Some short links answer with a page that carries the full link inside it.
        const body = r.ok ? (await r.text()).slice(0, 200_000) : "";
        return parseLatLng(body);
      }
      url = new URL(next, url).toString();
      const ll = parseLatLng(url);
      if (ll) return ll;
    } catch {
      return null;
    }
  }
  return null;
}

// ---- Seed --------------------------------------------------------------------

type SeedVehicle = { name: string; colour: string; storage: string; sort: number; checklist: string[] };

// Descriptions are left for Gary to write; the checklists are a starting point to edit.
const SEED: SeedVehicle[] = [
  {
    name: "Follow vehicle",
    colour: "v1",
    storage: "car",
    sort: 10,
    checklist: ["Spare front wheel", "Spare rear wheel", "Track pump", "Tool kit — multi-tool, tyre levers, chain tool", "Spare inner tubes x8", "First aid kit", "Hi-vis vests x2", "Torch / head torch", "Water bottles, filled x8", "Rider snacks box", "Phone mount and charging cables", "Printed route and stop list"],
  },
  {
    name: "Motorhome",
    colour: "v2",
    storage: "robyn",
    sort: 20,
    checklist: ["Gas bottle — full", "Kettle, mugs, tea, coffee", "Hot food for the lunch stops", "Towels x4", "Folding chairs x4", "Riders' overnight bags", "Spare warm layers", "Fresh water tank — full", "Bin bags", "Second first aid kit"],
  },
  {
    name: "Crew chief vehicle",
    colour: "v3",
    storage: "",
    sort: 30,
    checklist: ["Printed plan and contact list", "Power bank x2", "Cash for parking", "Spare car keys for the other vehicles"],
  },
  { name: "Extra vehicle", colour: "v4", storage: "", sort: 40, checklist: [] },
];

/** The vehicles we know about (idempotent by name). */
export async function seedVehicles() {
  await ready();
  let added = 0;
  for (const s of SEED) {
    const ex = await db.select({ id: schema.vehicles.id }).from(schema.vehicles).where(eq(schema.vehicles.name, s.name)).get();
    if (ex) continue;
    const r = await db
      .insert(schema.vehicles)
      .values({ name: s.name, colour: s.colour, kitStorage: s.storage, sortOrder: s.sort, token: randomToken(16), updatedBy: "seed", updatedAt: nowIso() })
      .returning({ id: schema.vehicles.id })
      .get();
    if (s.checklist.length) await addChecklistLines(r.id, s.checklist.join("\n"));
    added++;
  }
  return added;
}
