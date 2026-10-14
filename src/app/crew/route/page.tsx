import { db, ready, schema } from "@/db/client";
import { requireCrew } from "@/lib/auth";
import { loadProfiles } from "@/lib/route";
import { getSetting } from "@/lib/settings";
import { DEFAULT_PLAN, normalisePlan, type NamedStop, type Plan, type SavedPlan } from "@/lib/plan";
import { RoutePlanner } from "@/components/route-planner";

export const dynamic = "force-dynamic";

/** The stops the planner can switch on and off: the route_stops rows with a mile, plus
 *  Simon's GPX waypoints that aren't already one of them. */
function candidateStops(profiles: ReturnType<typeof loadProfiles>, rows: (typeof schema.routeStops.$inferSelect)[], days: (typeof schema.routeDays.$inferSelect)[]): NamedStop[] {
  const out: NamedStop[] = [];
  const dayOf = (dayId: number) => days.find((d) => d.id === dayId)?.day ?? 1;
  for (const r of rows) {
    if (r.approxMile == null) continue;
    const day = dayOf(r.dayId);
    const total = profiles.find((p) => p.day === day)?.miles ?? 999;
    if (r.approxMile <= 0.05 || r.approxMile >= total - 0.05) continue; // ends aren't stops
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
      if (w.mile <= 0.05 || w.mile >= p.miles - 0.05) continue;
      if (out.some((s) => s.day === p.day && Math.abs(s.mile - w.mile) < 2)) continue;
      const optional = /optional/i.test(w.name);
      out.push({ key: `wp:${p.day}:${w.mile}`, day: p.day, name: w.name, mile: w.mile, durMin: optional ? 10 : 25, enabled: !optional, optional, kind: "long", notes: w.desc || undefined });
    }
  }
  return out.sort((a, b) => a.day - b.day || a.mile - b.mile);
}

export default async function CrewRoutePage() {
  const s = await requireCrew();
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

  // The plan the page opens with: the saved one if there is one, with any new
  // candidate stops added; otherwise the defaults over the candidates.
  const base: Plan = saved ? saved.plan : { ...DEFAULT_PLAN, namedStops: [] };
  const merged: NamedStop[] = candidates.map((c) => {
    const prev = base.namedStops.find((p) => p.key === c.key);
    return prev ? { ...c, durMin: prev.durMin, enabled: prev.enabled } : c;
  });
  const initial: Plan = { ...base, namedStops: merged };

  return <RoutePlanner profiles={profiles} initial={initial} saved={saved} me={s.name} isAdmin={s.role === "admin"} />;
}
