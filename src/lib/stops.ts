import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, ready, schema } from "@/db/client";
import { STOP_SPOT_KINDS, type StopSpot, type StopSpotKind } from "@/db/schema";
import { loadProfiles, nearestOnLine } from "./route";
import { loadRoutePlan } from "./plan-server";
import { refreshForRouteVersion } from "./route-version";
import { planAll, type PlanEvent } from "./plan";
import { nowIso } from "./time";
import { isShortMapsLink, parsePlace, type LatLon } from "./stop-place";
import type { Session } from "./session";

// Crew → Stops: real places scouted (on Street View, on the map, or on the
// ground) for the stops the planner generates. Crew only; nothing is public.

type Actor = Pick<Session, "pid" | "name" | "role">;

export const SPOT_NAME_MAX = 80;
export const SPOT_NOTES_MAX = 3000;
export const SPOT_PHOTOS_MAX = 12;
const PHOTO_MAX_CHARS = 2_000_000;

export type Placed = { day: 1 | 2; mile: number; offMi: number; town: string | null };

/** Where a point sits on the route: the day whose line it is nearest, the mile along that day, how far off, and the nearest town. */
export function placeOnRoute(lat: number, lon: number): Placed | null {
  let best: Placed | null = null;
  for (const p of loadProfiles()) {
    if (!p.points.length) continue;
    const n = nearestOnLine(p.points, lat, lon);
    if (best && n.distMi >= best.offMi) continue;
    const mile = p.points[n.i][3];
    let town: string | null = null;
    let td = Infinity;
    for (const t of p.towns) {
      const d = Math.abs(t.mile - mile);
      if (d < td && d <= 3) {
        td = d;
        town = t.name;
      }
    }
    best = { day: p.day === 2 ? 2 : 1, mile: Math.round(mile * 10) / 10, offMi: Math.round(n.distMi * 100) / 100, town };
  }
  return best;
}

/** Turn pasted text into a place, following a short Google share link if need be. */
export async function resolvePlace(raw: string): Promise<LatLon | null> {
  const direct = parsePlace(raw);
  if (direct) return direct;
  let url = (raw ?? "").trim();
  if (!isShortMapsLink(url)) return null;
  for (let hop = 0; hop < 4; hop++) {
    let r: Response;
    try {
      r = await fetch(url, { redirect: "manual", headers: { "user-agent": "Mozilla/5.0 (JCMR crew board)" }, signal: AbortSignal.timeout(6000) });
    } catch {
      return null;
    }
    const loc = r.headers.get("location");
    if (loc) {
      url = new URL(loc, url).toString();
      const p = parsePlace(url);
      if (p) return p;
      continue;
    }
    // The end of the chain: sometimes the position is only in the page itself.
    const body = r.ok ? await r.text().catch(() => "") : "";
    const m = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/.exec(body) ?? /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(body) ?? /\[null,null,(-?\d+\.\d+),(-?\d+\.\d+)\]/.exec(body);
    return m ? parsePlace(`${m[1]},${m[2]}`) : null;
  }
  return null;
}

export function asSpotKind(k: string): StopSpotKind {
  return (STOP_SPOT_KINDS as readonly string[]).includes(k) ? (k as StopSpotKind) : "hourly";
}

export type SpotLite = StopSpot & { photos: number; firstPhoto: number | null };

export async function listSpots(): Promise<SpotLite[]> {
  await ready();
  await refreshForRouteVersion();
  const spots = await db.select().from(schema.stopSpots).where(eq(schema.stopSpots.deleted, false)).orderBy(asc(schema.stopSpots.day), asc(schema.stopSpots.mile)).all();
  const counts = await db
    .select({ spotId: schema.stopSpotPhotos.spotId, n: sql<number>`count(*)`, first: sql<number>`min(${schema.stopSpotPhotos.id})` })
    .from(schema.stopSpotPhotos)
    .groupBy(schema.stopSpotPhotos.spotId)
    .all();
  return spots.map((s) => {
    const c = counts.find((x) => x.spotId === s.id);
    return { ...s, photos: Number(c?.n ?? 0), firstPhoto: c?.first ?? null };
  });
}

export async function getSpot(id: number): Promise<StopSpot | undefined> {
  await ready();
  await refreshForRouteVersion();
  return db
    .select()
    .from(schema.stopSpots)
    .where(and(eq(schema.stopSpots.id, id), eq(schema.stopSpots.deleted, false)))
    .get();
}

export type SpotPhotoLite = { id: number; caption: string; addedBy: string; addedAt: string };

export async function spotPhotos(spotId: number): Promise<SpotPhotoLite[]> {
  await ready();
  return db
    .select({ id: schema.stopSpotPhotos.id, caption: schema.stopSpotPhotos.caption, addedBy: schema.stopSpotPhotos.addedBy, addedAt: schema.stopSpotPhotos.addedAt })
    .from(schema.stopSpotPhotos)
    .where(eq(schema.stopSpotPhotos.spotId, spotId))
    .orderBy(asc(schema.stopSpotPhotos.id))
    .all();
}

export async function spotPhoto(id: number): Promise<string | null> {
  await ready();
  const r = await db
    .select({ photo: schema.stopSpotPhotos.photo })
    .from(schema.stopSpotPhotos)
    .innerJoin(schema.stopSpots, eq(schema.stopSpots.id, schema.stopSpotPhotos.spotId))
    .where(and(eq(schema.stopSpotPhotos.id, id), eq(schema.stopSpots.deleted, false)))
    .get();
  return r?.photo ?? null;
}

export type SpotInput = { name: string; kind: StopSpotKind; lat: number; lon: number; notes: string; day: number };

/** Create (id 0) or update a spot. The day and mile come from where the pin is; the chosen day only counts when the pin is far from both days' lines. */
export async function saveSpot(actor: Actor, id: number, input: SpotInput): Promise<number> {
  await ready();
  const placed = placeOnRoute(input.lat, input.lon);
  const near = placed && placed.offMi <= 5;
  const vals = {
    name: input.name.trim().slice(0, SPOT_NAME_MAX) || "Stop",
    kind: input.kind,
    lat: input.lat,
    lon: input.lon,
    day: near ? placed.day : input.day === 2 ? 2 : 1,
    mile: near ? placed.mile : null,
    offMi: placed ? placed.offMi : null,
    notes: input.notes.replace(/\r\n?/g, "\n").trim().slice(0, SPOT_NOTES_MAX),
  };
  if (id > 0) {
    // Moved off the route or onto the other day: no longer the stop it replaced.
    const was = await getSpot(id);
    const unplug = was?.inPlan && (vals.mile == null || vals.day !== was.day) ? { inPlan: false, replacesKey: null } : {};
    await db
      .update(schema.stopSpots)
      .set({ ...vals, ...unplug, updatedBy: actor.name, updatedAt: nowIso() })
      .where(eq(schema.stopSpots.id, id));
    return id;
  }
  const r = await db
    .insert(schema.stopSpots)
    .values({ ...vals, createdBy: actor.name, createdAt: nowIso() })
    .returning({ id: schema.stopSpots.id })
    .get();
  return r.id;
}

export async function removeSpot(actor: Actor, id: number): Promise<void> {
  await ready();
  await db.update(schema.stopSpots).set({ deleted: true, updatedBy: actor.name, updatedAt: nowIso() }).where(eq(schema.stopSpots.id, id));
}

export async function addSpotPhoto(actor: Actor, spotId: number, photo: string, caption: string): Promise<"ok" | "bad" | "full" | "missing"> {
  if (!(await getSpot(spotId))) return "missing";
  const p = (photo ?? "").trim();
  if (!p.startsWith("data:image/jpeg;base64,") || p.length > PHOTO_MAX_CHARS) return "bad";
  const n = await db.select({ n: sql<number>`count(*)` }).from(schema.stopSpotPhotos).where(eq(schema.stopSpotPhotos.spotId, spotId)).get();
  if (Number(n?.n ?? 0) >= SPOT_PHOTOS_MAX) return "full";
  await db.insert(schema.stopSpotPhotos).values({ spotId, photo: p, caption: caption.trim().slice(0, 200), addedBy: actor.name, addedAt: nowIso() });
  return "ok";
}

export async function removeSpotPhoto(photoId: number): Promise<number | null> {
  await ready();
  const r = await db.delete(schema.stopSpotPhotos).where(eq(schema.stopSpotPhotos.id, photoId)).returning({ spotId: schema.stopSpotPhotos.spotId }).get();
  return r?.spotId ?? null;
}

export async function setSpotPhotoCaption(photoId: number, caption: string): Promise<number | null> {
  await ready();
  const r = await db
    .update(schema.stopSpotPhotos)
    .set({ caption: caption.trim().slice(0, 200) })
    .where(eq(schema.stopSpotPhotos.id, photoId))
    .returning({ spotId: schema.stopSpotPhotos.spotId })
    .get();
  return r?.spotId ?? null;
}

export const spotPhotoUrl = (id: number) => `/api/stops/photo/${id}`;

// ---- The planned stops the spots are for -------------------------------------

export type PlannedStop = Pick<PlanEvent, "kind" | "day" | "name" | "mile" | "arrive" | "depart" | "durMin" | "lat" | "lon" | "dark" | "key" | "role"> & { n: number; town: string | null };

/** The stops in the crew's saved plan (the hourly and three-hourly ones, the named rendezvous, the halfway break), numbered per day. */
export async function plannedStops(): Promise<{ days: { day: number; miles: number; stops: PlannedStop[] }[]; savedBy: string | null }> {
  const { profiles, initial, saved } = await loadRoutePlan();
  const results = planAll(initial, profiles);
  return {
    savedBy: saved ? `${saved.savedBy}` : null,
    days: results.map((r) => {
      const prof = profiles.find((p) => p.day === r.day);
      let n = 0;
      return {
        day: r.day,
        miles: r.miles,
        stops: r.events
          .filter((e) => e.kind === "short" || e.kind === "long" || e.kind === "named" || e.kind === "halfway")
          .map((e) => {
            let town: string | null = null;
            let td = Infinity;
            for (const t of prof?.towns ?? []) {
              const d = Math.abs(t.mile - e.mile);
              if (d < td && d <= 3) {
                td = d;
                town = t.name;
              }
            }
            return { kind: e.kind, day: e.day, name: e.name, mile: e.mile, arrive: e.arrive, depart: e.depart, durMin: e.durMin, lat: e.lat, lon: e.lon, dark: e.dark, key: e.key, role: e.role, n: ++n, town };
          }),
      };
    }),
  };
}

/** Which planned stop each spot is for: the nearest one on its day by mile, within 8 miles. */
export function matchSpots<S extends { id: number; day: number; mile: number | null }>(stops: PlannedStop[], spots: S[]): Map<number, S[]> {
  const out = new Map<number, S[]>();
  for (const s of spots) {
    if (s.mile == null) continue;
    let best: PlannedStop | null = null;
    for (const p of stops) if (p.day === s.day && (!best || Math.abs(p.mile - s.mile) < Math.abs(best.mile - s.mile))) best = p;
    if (!best || Math.abs(best.mile - s.mile) > 8) continue;
    const key = best.day * 1000 + best.n;
    out.set(key, [...(out.get(key) ?? []), s]);
  }
  return out;
}

export const plannedKey = (p: Pick<PlannedStop, "day" | "n">) => p.day * 1000 + p.n;

export const spotKey = (id: number) => `spot:${id}`;

export type DeployResult = { ok: true; replaced: string; n: number; day: number } | { ok: false; why: string };

/** Make a spot the actual stop: it replaces the nearest planned stop on its day (within
 *  8 miles), takes on that stop's kind, and the timetable is worked out from its mile.
 *  A rendezvous it replaces is switched off; another deployed spot it replaces goes back
 *  to being just a pin. */
export async function deploySpot(id: number): Promise<DeployResult> {
  const spot = await getSpot(id);
  if (!spot) return { ok: false, why: "That stop has been removed." };
  if (spot.mile == null) return { ok: false, why: "It is too far from the route to be a stop on it. Move the pin closer first." };
  const { days } = await plannedStops();
  const mine = spotKey(spot.id);
  const stops = (days.find((d) => d.day === spot.day)?.stops ?? []).filter((p) => p.key !== mine);
  let target: PlannedStop | null = null;
  for (const p of stops) if (!target || Math.abs(p.mile - spot.mile) < Math.abs(target.mile - spot.mile)) target = p;
  if (target && Math.abs(target.mile - spot.mile) > 8) target = null;

  let replacesKey: string | null = null;
  let kind = spot.kind;
  if (target) {
    kind = target.role === "short" || target.kind === "short" ? "hourly" : target.kind === "halfway" ? spot.kind : "long";
    const other = target.key?.startsWith("spot:") ? Number(target.key.slice(5)) : null;
    if (other) {
      const o = await getSpot(other);
      replacesKey = o?.replacesKey ?? null;
      await db.update(schema.stopSpots).set({ inPlan: false, replacesKey: null }).where(eq(schema.stopSpots.id, other));
    } else if (target.kind === "named" && target.key) replacesKey = target.key;
  }
  await db.update(schema.stopSpots).set({ inPlan: true, replacesKey, kind }).where(eq(schema.stopSpots.id, spot.id));
  // The replaced rendezvous' planned time would otherwise linger on Live as "next stop".
  const row = /^db:(\d+)$/.exec(replacesKey ?? "");
  if (row) await db.update(schema.routeStops).set({ plannedTime: null }).where(eq(schema.routeStops.id, Number(row[1])));
  return target ? { ok: true, replaced: `${plannedLabel(target)} at mile ${target.mile.toFixed(0)}`, n: target.n, day: target.day } : { ok: true, replaced: "", n: 0, day: spot.day };
}

/** Back to being just a pin; the plan's own stop comes back. */
export async function undeploySpot(id: number): Promise<boolean> {
  await ready();
  const r = await db.update(schema.stopSpots).set({ inPlan: false, replacesKey: null }).where(eq(schema.stopSpots.id, id)).returning({ id: schema.stopSpots.id }).get();
  return !!r;
}

export function spotKindFor(kind: PlanEvent["kind"]): StopSpotKind {
  return kind === "short" ? "hourly" : kind === "long" || kind === "named" ? "long" : "other";
}

/** How a planned stop reads on the page: the crew's names for the routine stops, Simon's for the rendezvous. */
export function plannedLabel(p: Pick<PlannedStop, "kind" | "name" | "role">): string {
  if (p.role === "short") return "60 min stop";
  if (p.role === "long") return "Longer stop";
  if (p.kind === "short") return "60 min stop";
  if (p.kind === "long") return "180 min stop";
  if (p.kind === "halfway") return "Halfway break";
  const simon = /^D\d\s*STOP\s*(\d+)/i.exec(p.name);
  if (simon) return `Longer stop ${simon[1]}${/optional/i.test(p.name) ? " (optional)" : ""}`;
  return p.name.replace(/^Stop\s*\d+\s*[—-]\s*/i, "");
}
