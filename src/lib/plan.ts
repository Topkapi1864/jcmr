// The timeline planner: a plan (start times, pace, stop rules, named stops) and a
// route profile in, a timetable out. Pure TypeScript, shared by the crew page
// (live as the sliders move) and the server (saving planned times to the stops).

import type { ProfilePoint, RouteProfile } from "./route";

export type NamedStop = {
  /** Stable key: "db:<id>" for a route_stops row, "wp:<day>:<mile>" for a GPX waypoint. */
  key: string;
  day: number;
  name: string;
  mile: number;
  durMin: number;
  enabled: boolean;
  /** A stop the riders may skip — shown as optional, counted only when enabled. */
  optional?: boolean;
  kind?: string;
  notes?: string;
};

export type DayPlan = {
  start: string; // "07:00"
  speedMph: number | null; // null → the plan's speed
};

export type Plan = {
  version: 1;
  speedMph: number;
  days: Record<number, DayPlan>;
  /** A short stop (bottles, a wee) every N riding minutes. */
  shortStop: { enabled: boolean; everyMin: number; durMin: number };
  /** A longer stop (food, clothing) every N riding minutes. Resets the short-stop clock. */
  longStop: { enabled: boolean; everyMin: number; durMin: number };
  /** One break at half distance. */
  halfway: { enabled: boolean; durMin: number };
  /** A named stop counts as a break and resets both clocks. */
  namedResetsClock: boolean;
  /** Skip a routine stop when a named stop is within this many riding minutes. */
  mergeWithinMin: number;
  namedStops: NamedStop[];
};

export const DEFAULT_PLAN: Plan = {
  version: 1,
  speedMph: 12,
  days: { 1: { start: "07:00", speedMph: null }, 2: { start: "07:00", speedMph: null } },
  shortStop: { enabled: true, everyMin: 60, durMin: 5 },
  longStop: { enabled: true, everyMin: 180, durMin: 15 },
  halfway: { enabled: false, durMin: 30 },
  namedResetsClock: true,
  mergeWithinMin: 20,
  namedStops: [],
};

export type EventKind = "start" | "short" | "long" | "halfway" | "named" | "finish";

export type PlanEvent = {
  kind: EventKind;
  day: number;
  name: string;
  mile: number;
  /** Minutes after midnight (London), may pass 24h. */
  arrive: number;
  depart: number;
  durMin: number;
  ridingMinFromPrev: number;
  milesFromPrev: number;
  lat: number;
  lon: number;
  eleM: number;
  dark: boolean;
  notes?: string;
  key?: string;
};

export type TownEta = { name: string; mile: number; eta: number; dark: boolean; offMi: number };

export type DayResult = {
  day: number;
  present: boolean;
  miles: number;
  start: number;
  finish: number;
  ridingMin: number;
  stoppedMin: number;
  darkRidingMin: number;
  sunrise: number;
  sunset: number;
  speedMph: number;
  events: PlanEvent[];
  towns: TownEta[];
};

export type SavedPlan = { plan: Plan; savedBy: string; savedAt: string } | null;

export const RIDE_DATES: Record<number, string> = { 1: "2026-11-14", 2: "2026-11-15" };

// ---- time helpers --------------------------------------------------------

export function parseHm(s: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return 7 * 60;
  return Math.min(23, Number(m[1])) * 60 + Math.min(59, Number(m[2]));
}

export function fmtHm(min: number): string {
  const m = Math.round(min);
  const h = Math.floor(m / 60) % 24;
  return `${String(h).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function fmtDur(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${String(m % 60).padStart(2, "0")}` : `${h} h`;
}

// ---- sunrise / sunset (NOAA, good to a couple of minutes) ------------------

/** Sunrise and sunset as minutes after local midnight (UK is on GMT in November). */
export function sunTimes(ymd: string, lat: number, lon: number): { sunrise: number; sunset: number } {
  const [y, mo, d] = ymd.split("-").map(Number);
  const a = Math.floor((14 - mo) / 12);
  const yy = y + 4800 - a;
  const mm = mo + 12 * a - 3;
  const jdn = d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
  const n = jdn - 2451545 + 0.0008;
  const Jstar = n - lon / 360;
  const M = ((357.5291 + 0.98560028 * Jstar) % 360) * (Math.PI / 180);
  const C = 1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M);
  const lambda = ((M * 180) / Math.PI + C + 180 + 102.9372) % 360;
  const lr = lambda * (Math.PI / 180);
  const Jtransit = 2451545 + Jstar + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * lr);
  const decl = Math.asin(Math.sin(lr) * Math.sin(23.4397 * (Math.PI / 180)));
  const latr = lat * (Math.PI / 180);
  const cosW = (Math.sin(-0.833 * (Math.PI / 180)) - Math.sin(latr) * Math.sin(decl)) / (Math.cos(latr) * Math.cos(decl));
  const w = Math.acos(Math.max(-1, Math.min(1, cosW)));
  const toMin = (jd: number) => ((jd + 0.5) % 1) * 1440; // UTC minutes after midnight
  return { sunrise: toMin(Jtransit - w / (2 * Math.PI)), sunset: toMin(Jtransit + w / (2 * Math.PI)) };
}

// ---- geometry on the profile --------------------------------------------

export function pointAtMile(points: ProfilePoint[], mile: number): ProfilePoint {
  if (!points.length) return [0, 0, 0, mile];
  if (mile <= points[0][3]) return points[0];
  const last = points[points.length - 1];
  if (mile >= last[3]) return last;
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid][3] <= mile) lo = mid;
    else hi = mid;
  }
  const a = points[lo];
  const b = points[hi];
  const f = b[3] === a[3] ? 0 : (mile - a[3]) / (b[3] - a[3]);
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, mile];
}

// ---- the simulation ------------------------------------------------------

export function planDay(plan: Plan, profile: RouteProfile): DayResult {
  const day = profile.day;
  const dp = plan.days[day] ?? { start: "07:00", speedMph: null };
  const speed = Math.max(4, dp.speedMph ?? plan.speedMph);
  const total = profile.miles;
  const minPerMile = 60 / speed;
  const named = plan.namedStops
    .filter((s) => s.day === day && s.enabled && s.mile > 0.5 && s.mile < total - 0.5)
    .sort((a, b) => a.mile - b.mile);

  const startPt = pointAtMile(profile.points, 0);
  const endPt = pointAtMile(profile.points, total);
  const mid = pointAtMile(profile.points, total / 2);
  const sun = sunTimes(RIDE_DATES[day] ?? "2026-11-14", mid[1] || 52.8, mid[0] || -1.2);
  const isDark = (t: number) => t < sun.sunrise || t > sun.sunset;

  const events: PlanEvent[] = [];
  let t = parseHm(dp.start);
  let mile = 0;
  let sinceShort = 0; // riding minutes since the last stop of any kind
  let sinceLong = 0; // riding minutes since the last long/named stop
  let halfwayDone = !plan.halfway.enabled;
  let ridingMin = 0;
  let stoppedMin = 0;
  let darkRidingMin = 0;
  let ni = 0;
  // A routine stop skipped because a named stop was near: that named stop then
  // does its job and resets its clock, even when named stops don't otherwise.
  let mergedShort = false;
  let mergedLong = false;

  const push = (kind: EventKind, name: string, atMile: number, dur: number, extra?: Partial<PlanEvent>) => {
    const ride = (atMile - mile) * minPerMile;
    // Dark riding minutes on this leg.
    const legStart = t;
    const legEnd = t + ride;
    const lit = Math.max(0, Math.min(legEnd, sun.sunset) - Math.max(legStart, sun.sunrise));
    darkRidingMin += Math.max(0, ride - lit);
    ridingMin += ride;
    stoppedMin += dur;
    const p = pointAtMile(profile.points, atMile);
    const arrive = t + ride;
    events.push({
      kind,
      day,
      name,
      mile: round1(atMile),
      arrive,
      depart: arrive + dur,
      durMin: dur,
      ridingMinFromPrev: ride,
      milesFromPrev: round1(atMile - mile),
      lat: p[1],
      lon: p[0],
      eleM: p[2],
      dark: isDark(arrive),
      ...extra,
    });
    t = arrive + dur;
    mile = atMile;
  };

  events.push({
    kind: "start",
    day,
    name: tidy(profile.waypoints.find((w) => /^start/i.test(w.name))?.name.replace(/^START\s*-\s*/i, "")) || (day === 1 ? "Castelnau, Barnes" : "The Link Hotel"),
    mile: 0,
    arrive: t,
    depart: t,
    durMin: 0,
    ridingMinFromPrev: 0,
    milesFromPrev: 0,
    lat: startPt[1],
    lon: startPt[0],
    eleM: startPt[2],
    dark: isDark(t),
  });

  // Walk forward: at each step the next thing is whichever comes first of the
  // next named stop, a due long stop, a due short stop, the halfway break, or
  // the finish.
  let guard = 0;
  while (mile < total - 1e-6 && guard++ < 500) {
    const nextNamed = named[ni];
    const toNamedMin = nextNamed ? (nextNamed.mile - mile) * minPerMile : Infinity;
    const toFinishMin = (total - mile) * minPerMile;
    const toLong = plan.longStop.enabled ? plan.longStop.everyMin - sinceLong : Infinity;
    const toShort = plan.shortStop.enabled ? plan.shortStop.everyMin - sinceShort : Infinity;
    const toHalf = !halfwayDone ? (total / 2 - mile) * minPerMile : Infinity;

    const candidates: { kind: EventKind; inMin: number }[] = [
      { kind: "finish", inMin: toFinishMin },
      { kind: "named", inMin: toNamedMin },
      { kind: "halfway", inMin: toHalf },
      { kind: "long", inMin: Math.max(0, toLong) },
      { kind: "short", inMin: Math.max(0, toShort) },
    ];
    candidates.sort((a, b) => a.inMin - b.inMin || order(a.kind) - order(b.kind));
    const next = candidates[0];

    if (next.kind === "finish") {
      push("finish", tidy(profile.waypoints.find((w) => /^(finish|overnight)/i.test(w.name))?.name.replace(/^(FINISH|OVERNIGHT)\s*-\s*/i, "")) || (day === 1 ? "The Link Hotel" : "Yeadon"), total, 0);
      break;
    }
    if (next.kind === "named" && nextNamed) {
      push("named", nextNamed.name, nextNamed.mile, nextNamed.durMin, { notes: nextNamed.notes, key: nextNamed.key });
      ni++;
      sinceShort = plan.namedResetsClock || mergedShort ? 0 : sinceShort + next.inMin;
      sinceLong = plan.namedResetsClock || mergedLong ? 0 : sinceLong + next.inMin;
      mergedShort = false;
      mergedLong = false;
      continue;
    }
    // A routine stop: skip it if a named stop or the finish is close.
    const nearSomething = Math.min(toNamedMin, toFinishMin) - next.inMin <= plan.mergeWithinMin;
    if (next.kind === "halfway") {
      halfwayDone = true;
      if (nearSomething) continue;
      push("halfway", "Halfway break", mile + next.inMin / minPerMile, plan.halfway.durMin);
      sinceShort = 0;
      sinceLong = 0;
      continue;
    }
    if (next.kind === "long") {
      if (nearSomething) {
        // Let the named stop / finish be the long stop.
        mergedLong = true;
        sinceLong = -1e9;
        continue;
      }
      push("long", "Long stop", mile + next.inMin / minPerMile, plan.longStop.durMin);
      sinceShort = 0;
      sinceLong = 0;
      continue;
    }
    if (next.kind === "short") {
      if (nearSomething) {
        mergedShort = true;
        sinceShort = -1e9;
        continue;
      }
      push("short", "Short stop", mile + next.inMin / minPerMile, plan.shortStop.durMin);
      sinceShort = 0;
      sinceLong += next.inMin;
      continue;
    }
  }

  const finish = events[events.length - 1]?.arrive ?? t;
  const towns: TownEta[] = profile.towns.map((tw) => {
    const eta = timeAtMile(events, tw.mile, minPerMile);
    return { name: tw.name, mile: tw.mile, eta, dark: isDark(eta), offMi: tw.offMi };
  });

  return {
    day,
    present: profile.present,
    miles: total,
    start: parseHm(dp.start),
    finish,
    ridingMin,
    stoppedMin,
    darkRidingMin,
    sunrise: sun.sunrise,
    sunset: sun.sunset,
    speedMph: speed,
    events,
    towns,
  };
}

/** GPX pins are shouted ("THE LINK HOTEL"); say them normally. */
function tidy(s: string | undefined): string {
  if (!s) return "";
  if (s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/(^|[\s(-])(\w)/g, (m, a, b) => a + b.toUpperCase());
}

function order(k: EventKind): number {
  return ["finish", "named", "halfway", "long", "short", "start"].indexOf(k);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Clock time at which the riders pass a mile, given the day's events. */
export function timeAtMile(events: PlanEvent[], mile: number, minPerMile: number): number {
  if (!events.length) return 0;
  for (let i = 1; i < events.length; i++) {
    const a = events[i - 1];
    const b = events[i];
    if (mile <= b.mile + 1e-9) return a.depart + (mile - a.mile) * minPerMile;
  }
  const last = events[events.length - 1];
  return last.depart + (mile - last.mile) * minPerMile;
}

/** Where the riders are at a clock time: mile, and whether they're stopped. */
export function mileAtTime(events: PlanEvent[], time: number, minPerMile: number): { mile: number; stopped: PlanEvent | null; before: boolean; after: boolean } {
  if (!events.length) return { mile: 0, stopped: null, before: true, after: false };
  if (time < events[0].arrive) return { mile: 0, stopped: events[0], before: true, after: false };
  for (let i = 0; i < events.length - 1; i++) {
    const e = events[i];
    const n = events[i + 1];
    // Stopped from the moment they arrive until the moment they leave; riding from then until the next arrival.
    if (time < e.depart) return { mile: e.mile, stopped: e, before: false, after: false };
    if (time < n.arrive) return { mile: e.mile + (time - e.depart) / minPerMile, stopped: null, before: false, after: false };
  }
  const last = events[events.length - 1];
  return { mile: last.mile, stopped: last, before: false, after: true };
}

export function planAll(plan: Plan, profiles: RouteProfile[]): DayResult[] {
  return profiles.map((p) => planDay(plan, p));
}

/** The events the public pages list: start, rendezvous and finish. The crew's routine stops stay on the crew side. */
export function publicEvents(events: PlanEvent[]): PlanEvent[] {
  return events.filter((e) => e.kind === "start" || e.kind === "named" || e.kind === "finish");
}

/** The town the riders are at or near a mile, if one is within 4 miles along the line. */
export function nearestTown(p: RouteProfile, mile: number): { name: string; offMi: number; mile: number } | null {
  let best: { name: string; offMi: number; mile: number; d: number } | null = null;
  for (const t of p.towns) {
    const d = Math.abs(t.mile - mile);
    if (!best || d < best.d) best = { name: t.name, offMi: t.offMi, mile: t.mile, d };
  }
  return best && best.d <= 4 ? best : null;
}

// ---- plan (de)serialisation ------------------------------------------------

export function normalisePlan(raw: unknown): Plan {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Plan>;
  const num = (v: unknown, d: number, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  const rule = (v: Partial<Plan["shortStop"]> | undefined, d: Plan["shortStop"]) => ({
    enabled: typeof v?.enabled === "boolean" ? v.enabled : d.enabled,
    everyMin: num(v?.everyMin, d.everyMin, 15, 600),
    durMin: num(v?.durMin, d.durMin, 1, 180),
  });
  const days: Record<number, DayPlan> = {};
  for (const d of [1, 2]) {
    const v = r.days?.[d];
    days[d] = { start: typeof v?.start === "string" && /^\d{1,2}:\d{2}$/.test(v.start) ? v.start : "07:00", speedMph: v?.speedMph == null ? null : num(v.speedMph, 12, 5, 25) };
  }
  const stops: NamedStop[] = Array.isArray(r.namedStops)
    ? r.namedStops
        .filter((s) => s && typeof s === "object" && typeof (s as NamedStop).key === "string")
        .map((s) => ({
          key: String(s.key),
          day: s.day === 2 ? 2 : 1,
          name: String(s.name ?? "Stop").slice(0, 80),
          mile: num(s.mile, 0, 0, 400),
          durMin: num(s.durMin, 20, 0, 600),
          enabled: s.enabled !== false,
          optional: !!s.optional,
          kind: typeof s.kind === "string" ? s.kind : undefined,
          notes: typeof s.notes === "string" ? s.notes.slice(0, 300) : undefined,
        }))
    : [];
  return {
    version: 1,
    speedMph: num(r.speedMph, 12, 5, 25),
    days,
    shortStop: rule(r.shortStop, DEFAULT_PLAN.shortStop),
    longStop: rule(r.longStop, DEFAULT_PLAN.longStop),
    halfway: { enabled: !!r.halfway?.enabled, durMin: num(r.halfway?.durMin, 30, 1, 180) },
    namedResetsClock: r.namedResetsClock !== false,
    mergeWithinMin: num(r.mergeWithinMin, 20, 0, 90),
    namedStops: stops,
  };
}

/** A plan as a URL-safe string, for sharing a scenario. */
export function encodePlan(plan: Plan): string {
  const json = JSON.stringify(plan);
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodePlan(s: string): Plan | null {
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return normalisePlan(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}

/** The timetable as text for WhatsApp / the printed roadbook. */
export function timetableText(results: DayResult[]): string {
  const lines: string[] = [];
  for (const r of results) {
    lines.push(`*Day ${r.day}* — ${r.miles} mi at ${r.speedMph} mph, start ${fmtHm(r.start)}, finish ~${fmtHm(r.finish)} (sunset ${fmtHm(r.sunset)})`);
    for (const e of r.events) {
      const stop = e.durMin ? ` · ${e.durMin} min, away ${fmtHm(e.depart)}` : "";
      lines.push(`${fmtHm(e.arrive)}  mile ${e.mile.toFixed(0).padStart(3)}  ${e.name}${stop}${e.dark && e.kind !== "start" ? " 🌙" : ""}`);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}
