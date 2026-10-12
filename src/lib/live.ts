import { desc, eq } from "drizzle-orm";
import { db, ready, schema } from "@/db/client";
import { frameable, getDonateTotal } from "./donate";
import { getAllSettings } from "./settings";
import { RIDE_DAYS } from "./public";
import { londonDate } from "./time";

export type LivePayload = {
  now: string;
  day: 1 | 2 | null;
  mode: "single" | "all";
  status: { text: string; place: string; postedAt: string; postedBy: string } | null;
  nextStop: { name: string; plannedTime: string | null; kind: string } | null;
  links: { id: number; rider: string | null; provider: string; url: string; label: string; primary: boolean; frameable: boolean }[];
  total: { amount: number | null; target: number | null; fetchedAt: string | null };
};

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
  return {
    now: new Date().toISOString(),
    day,
    mode: s["tracker.mode"] === "all" ? "all" : "single",
    status: status ? { text: status.text, place: status.place, postedAt: status.postedAt, postedBy: status.postedBy } : null,
    nextStop,
    links,
    total: { amount: total.amount, target: total.target, fetchedAt: total.fetchedAt },
  };
}
