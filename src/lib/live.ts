import { desc, eq } from "drizzle-orm";
import { db, ready, schema } from "@/db/client";
import { frameable, getDonateTotal } from "./donate";
import { getAllSettings } from "./settings";
import { RIDE_DAYS } from "./public";
import { londonDate } from "./time";
import { gpxExists } from "./gpx";

export type LivePayload = {
  now: string;
  day: 1 | 2 | null;
  mode: "single" | "all";
  status: { text: string; place: string; postedAt: string; postedBy: string } | null;
  nextStop: { name: string; plannedTime: string | null; kind: string } | null;
  links: { id: number; rider: string | null; provider: string; url: string; label: string; primary: boolean; frameable: boolean }[];
  total: { amount: number | null; target: number | null; fetchedAt: string | null };
  // Follow-the-Ride card (design handoff): progress and the feed.
  phase: "pre" | "riding" | "overnight" | "finished";
  mile: number; // approx miles done, from the latest status that gave one
  totalMiles: number;
  overnightMile: number;
  labels: { start: string; overnight: string; finish: string };
  daysToGo: number;
  hasRoute: boolean;
  updates: { id: number; text: string; place: string; mile: number | null; postedAt: string; postedBy: string }[];
  riders: { id: number; name: string; bio: string; link: string | null }[];
};

const RIDE_MILES = 240;

export async function livePayload(): Promise<LivePayload> {
  await ready();
  const s = await getAllSettings();
  const today = londonDate();
  const day = today === RIDE_DAYS[0] ? 1 : today === RIDE_DAYS[1] ? 2 : null;

  const status = await db.select().from(schema.liveStatus).orderBy(desc(schema.liveStatus.id)).limit(1).get();

  const rows = await db
    .select({ link: schema.trackerLinks, rider: schema.riders })
    .from(schema.trackerLinks)
    .leftJoin(schema.riders, eq(schema.trackerLinks.riderId, schema.riders.id))
    .where(eq(schema.trackerLinks.active, true))
    .orderBy(schema.trackerLinks.id)
    .all();
  const primaryId = Number(s["tracker.primary_rider"]) || null;
  const links = await Promise.all(
    rows.map(async ({ link, rider }) => ({
      id: link.id,
      rider: rider?.displayName ?? null,
      provider: link.provider,
      url: link.url,
      label: link.label || rider?.displayName || link.provider,
      primary: primaryId !== null && link.riderId === primaryId,
      frameable: await frameable(link.url),
    })),
  );
  // In single mode with no primary set, the first link is the primary.
  if (s["tracker.mode"] === "single" && links.length && !links.some((l) => l.primary)) links[0].primary = true;

  // The next planned stop: first stop on today's day with a planned time still ahead.
  let nextStop: LivePayload["nextStop"] = null;
  if (day) {
    const d = await db.select().from(schema.routeDays).where(eq(schema.routeDays.day, day)).get();
    if (d) {
      const stops = await db.select().from(schema.routeStops).where(eq(schema.routeStops.dayId, d.id)).orderBy(schema.routeStops.sortOrder).all();
      const hhmm = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
      const ahead = stops.find((st) => st.plannedTime && st.plannedTime >= hhmm);
      if (ahead) nextStop = { name: ahead.name, plannedTime: ahead.plannedTime, kind: ahead.kind };
    }
  }

  const total = await getDonateTotal();

  // Progress. Miles come from the crew's posts; the overnight tick from the day-1 length.
  const days = await db.select().from(schema.routeDays).orderBy(schema.routeDays.day).all();
  const d1 = days.find((d) => d.day === 1);
  const d2 = days.find((d) => d.day === 2);
  const totalMiles = Math.round((d1?.miles ?? 0) + (d2?.miles ?? 0)) || RIDE_MILES;
  const overnightMile = d1?.miles ?? Math.round(totalMiles / 2);
  const recent = await db.select().from(schema.liveStatus).orderBy(desc(schema.liveStatus.id)).limit(20).all();
  const withMile = recent.find((r) => r.mile != null);
  const mile = Math.min(totalMiles, Math.max(0, withMile?.mile ?? 0));
  const msPerDay = 86_400_000;
  const daysToGo = Math.max(0, Math.ceil((Date.parse(RIDE_DAYS[0] + "T07:00:00Z") - Date.now()) / msPerDay));
  const phase: LivePayload["phase"] = today < RIDE_DAYS[0] ? "pre" : today > RIDE_DAYS[1] || mile >= totalMiles ? "finished" : day === 1 && mile >= overnightMile && recent[0]?.text ? "overnight" : "riding";
  const riderRows = await db.select().from(schema.riders).orderBy(schema.riders.sortOrder).all();
  const linkFor = (id: number) => links.find((l) => rows.find((r) => r.link.id === l.id)?.link.riderId === id)?.url ?? null;

  return {
    phase,
    mile,
    totalMiles,
    overnightMile,
    labels: {
      start: d1 ? `${d1.startLabel}, Sat 07:00` : "Barnes, Sat 07:00",
      overnight: d1 ? `${d1.endLabel}, overnight` : "Overnight",
      finish: d2 ? `${d2.endLabel}, Sun` : "Yeadon Cemetery, Sun",
    },
    daysToGo,
    hasRoute: gpxExists(1) || gpxExists(2),
    updates: recent.map((r) => ({ id: r.id, text: r.text, place: r.place, mile: r.mile ?? null, postedAt: r.postedAt, postedBy: r.postedBy })),
    riders: riderRows.map((r) => ({ id: r.id, name: r.displayName, bio: r.bioMd.split(/\n/)[0].replace(/[*_#]/g, "").slice(0, 90), link: linkFor(r.id) })),
    now: new Date().toISOString(),
    day,
    mode: s["tracker.mode"] === "all" ? "all" : "single",
    status: status ? { text: status.text, place: status.place, postedAt: status.postedAt, postedBy: status.postedBy } : null,
    nextStop,
    links,
    total: { amount: total.amount, target: total.target, fetchedAt: total.fetchedAt },
  };
}
