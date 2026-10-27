import "server-only";
import { db, ready, schema } from "@/db/client";
import { loadProfiles } from "./route";
import { getSetting } from "./settings";
import { DEFAULT_PLAN, normalisePlan, planAll, type DayResult, type NamedStop, type Plan, type SavedPlan } from "./plan";

// The route plan as the server sees it: the stops the planner can use, the saved
// crew plan, and the plan the page opens with. Shared by the crew planner and the
// public route page.

/** The stops the planner can switch on and off: the route_stops rows with a mile, plus
 *  Simon's GPX waypoints that aren't already one of them. */
function candidateStops(profiles: ReturnType<typeof loadProfiles>, rows: (typeof schema.routeStops.$inferSelect)[], days: (typeof schema.routeDays.$inferSelect)[]): NamedStop[] {
  const out: NamedStop[] = [];
  const dayOf = (dayId: number) => days.find((d) => d.id === dayId)?.day ?? 1;
  for (const r of rows) {
    if (r.approxMile == null) continue;
    const day = dayOf(r.dayId);
    const total = profiles.find((p) => p.day === day)?.miles ?? 999;
    if (r.approxMile <= 0.5 || r.approxMile >= total - 0.5 || r.kind === "overnight" || r.kind === "finish") continue; // ends aren't stops
    const optional = /optional/i.test(r.name) || /optional/i.test(r.notes ?? "");
    out.push({
      key: `db:${r.id}`,
      day,
      name: r.name,
      mile: r.approxMile,
      durMin: optional ? 10 : r.kind === "short" ? 10 : r.kind === "lunch" ? 30 : 25,
      enabled: !optional,
      optional,
      kind: r.kind,
      notes: r.notes ?? undefined,
    });
  }
  for (const p of profiles) {
    for (const w of p.waypoints) {
      if (w.mile <= 0.5 || w.mile >= p.miles - 0.5 || /^(start|finish|overnight)/i.test(w.name)) continue;
      if (out.some((s) => s.day === p.day && Math.abs(s.mile - w.mile) < 4)) continue;
      const optional = /optional/i.test(w.name);
      out.push({ key: `wp:${p.day}:${w.mile}`, day: p.day, name: w.name, mile: w.mile, durMin: optional ? 10 : 25, enabled: !optional, optional, kind: "long", notes: w.desc || undefined });
    }
  }
  return out.sort((a, b) => a.day - b.day || a.mile - b.mile);
}


export async function loadRoutePlan(): Promise<{ profiles: ReturnType<typeof loadProfiles>; days: (typeof schema.routeDays.$inferSelect)[]; saved: SavedPlan; initial: Plan }> {
  await ready();
  const profiles = loadProfiles();
  const days = await db.select().from(schema.routeDays).orderBy(schema.routeDays.day).all();
  const rows = await db.select().from(schema.routeStops).orderBy(schema.routeStops.dayId, schema.routeStops.sortOrder).all();
  const candidates = candidateStops(profiles, rows, days);

  let saved: SavedPlan = null;
  const raw = await getSetting("route.plan");
  if (raw) {
    try {
      const j = JSON.parse(raw) as { plan: unknown; savedBy: string; savedAt: string };
      saved = { plan: normalisePlan(j.plan), savedBy: String(j.savedBy ?? ""), savedAt: String(j.savedAt ?? "") };
    } catch {
      saved = null;
    }
  }
  const base: Plan = saved ? saved.plan : { ...DEFAULT_PLAN, namedStops: [] };
  const merged: NamedStop[] = candidates.map((c) => {
    const prev = base.namedStops.find((p) => p.key === c.key);
    return prev ? { ...c, durMin: prev.durMin, enabled: prev.enabled } : c;
  });
  return { profiles, days, saved, initial: { ...base, namedStops: merged } };
}

/** The pace the public pages run at. The crew can plan at any speed; the public sees one steady figure, Simon's 12. */
export const PUBLIC_SPEED_MPH = 12;

/** The crew's plan — start times, stop rules, the rendezvous — at the public pace. */
export function publicPlan(plan: Plan): Plan {
  const days: Plan["days"] = {};
  for (const [d, v] of Object.entries(plan.days)) days[Number(d)] = { ...v, speedMph: null };
  return { ...plan, speedMph: PUBLIC_SPEED_MPH, days };
}

/** The public timetable: the crew's plan at the public pace, every stop included so
 *  "where are they at 10:40" lands between the rendezvous. The page decides which
 *  stops it lists (see `publicEvents` in plan.ts). */
export function publicResults(plan: Plan, profiles: ReturnType<typeof loadProfiles>): DayResult[] {
  return planAll(publicPlan(plan), profiles);
}
