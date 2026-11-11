import "server-only";
import { eq } from "drizzle-orm";
import { db, ready, schema } from "@/db/client";
import { ROUTE_VERSION } from "./constants";
import { loadProfiles, nearestOnLine } from "./route";
import { getSetting, setSetting } from "./settings";
import { nowIso } from "./time";

// When the route files change (content/route, ROUTE_VERSION), anything stored as
// "mile N" is a mile on the old line. The plan works its own miles out from the
// files on every load; what is stored is each scouted spot's mile (stop_spots)
// and the day totals (route_days). This puts those back on the new line, once,
// the first time the site runs with the new files. It only ever writes what the
// files say for a spot's own lat/lon, so running it twice (two requests at once,
// or again after a failure) does no harm.

let settled = false;

export async function refreshForRouteVersion(): Promise<void> {
  if (settled) return;
  await ready();
  try {
    if ((await getSetting("route.version")) === ROUTE_VERSION) {
      settled = true;
      return;
    }
    const profiles = loadProfiles();
    const spots = await db.select().from(schema.stopSpots).all();
    let moved = 0;
    for (const s of spots) {
      const p = profiles.find((x) => x.day === s.day);
      if (!p || !p.present || !p.points.length) continue;
      const n = nearestOnLine(p.points, s.lat, s.lon);
      const offMi = Math.round(n.distMi * 100) / 100;
      // As when a spot is saved: more than 5 miles off the line has no mile.
      const mile = offMi <= 5 ? Math.round(p.points[n.i][3] * 10) / 10 : null;
      if (mile === s.mile && offMi === s.offMi) continue;
      // A spot that is the stop keeps its place in the plan; only its mile moves.
      if (mile == null && s.inPlan) continue;
      await db.update(schema.stopSpots).set({ mile, offMi }).where(eq(schema.stopSpots.id, s.id));
      moved++;
    }
    const days = await db.select().from(schema.routeDays).all();
    for (const p of profiles) {
      if (!p.present) continue;
      const d = days.find((x) => x.day === p.day);
      if (d && (d.miles !== p.miles || d.feet !== p.climbFt)) await db.update(schema.routeDays).set({ miles: p.miles, feet: p.climbFt }).where(eq(schema.routeDays.id, d.id));
    }
    await setSetting("route.version", ROUTE_VERSION);
    await db.insert(schema.audit).values({ actor: "route", at: nowIso(), action: `route files V${ROUTE_VERSION}: ${moved} scouted spot${moved === 1 ? "" : "s"} re-placed on the new line` });
    settled = true;
  } catch (e) {
    // Never take a page down over this; the next request tries again.
    console.error("route version refresh failed", e);
  }
}

/** A GPX waypoint's key carries its mile ("wp:<day>:<mile>"), and the mile moves when
 *  the line does. The saved plan and the deployed spots hold the keys they were given,
 *  so a waypoint keeps the key already in use for it (same day, within 3 miles). */
export function stableWaypointKey(day: number, mile: number, known: Iterable<string>): string {
  let best: { key: string; d: number } | null = null;
  for (const k of known) {
    const m = /^wp:(\d+):(-?[\d.]+)$/.exec(k);
    if (!m || Number(m[1]) !== day) continue;
    const d = Math.abs(Number(m[2]) - mile);
    if (d <= 3 && (!best || d < best.d)) best = { key: k, d };
  }
  return best ? best.key : `wp:${day}:${mile}`;
}
