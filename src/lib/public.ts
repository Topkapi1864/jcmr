import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db, ready, schema } from "@/db/client";
import { getSession } from "./auth";
import { isPublicLive } from "./settings";
import { londonDate } from "./time";

export { RIDE_DAYS } from "./constants";
import { RIDE_DAYS } from "./constants";

export type Gate = {
  live: boolean; // the switch
  holding: boolean; // render the holding page
  preview: boolean; // a crew session is looking at dark pages
  liveActive: boolean; // show the "they're riding now" strip and the Live nav
  rideDay: 1 | 2 | null;
};

/** The dark switch (§3.3): everyone sees the holding page until the switch
 *  flips, except a signed-in crew session, which previews the full pages. */
export async function gate(sp: Record<string, string | undefined> = {}): Promise<Gate> {
  const live = await isPublicLive();
  const session = live ? null : await getSession();
  const preview = !live && !!session;
  const holding = !live && (!session || sp.holding === "1");
  await ready();
  const active = await db.select({ id: schema.trackerLinks.id }).from(schema.trackerLinks).where(eq(schema.trackerLinks.active, true)).limit(1).get();
  const today = londonDate();
  const rideDay = today === RIDE_DAYS[0] ? 1 : today === RIDE_DAYS[1] ? 2 : null;
  return { live, holding, preview, liveActive: !!active || rideDay !== null, rideDay };
}

export async function publicMetadata(title?: string): Promise<Metadata> {
  const live = await isPublicLive();
  return {
    title: title ?? "The Janet Channon Memorial Ride",
    robots: live ? { index: true, follow: true } : { index: false, follow: false },
  };
}
