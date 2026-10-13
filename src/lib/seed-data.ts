// Seed the settled facts (spec §2) and, optionally, the first items (§9).
// Used by `npm run db:seed` locally and by GET /api/seed on the deployed site.
// Idempotent: re-running updates in place and never duplicates.

import fs from "node:fs";
import path from "node:path";
import { eq, and } from "drizzle-orm";
import { db, ready, schema } from "@/db/client";
import { SETTING_DEFAULTS } from "./settings";

const PEOPLE: { name: string; shortName: string; role: "admin" | "crew"; sort: number }[] = [
  { name: "Gary Channon", shortName: "Gary", role: "admin", sort: 1 },
  { name: "Fiona", shortName: "Fiona", role: "admin", sort: 2 },
  { name: "Simon Channon", shortName: "Simon", role: "crew", sort: 10 },
  { name: "Nathan Channon", shortName: "Nathan", role: "crew", sort: 11 },
  { name: "Steve Brook (Brooky)", shortName: "Steve", role: "crew", sort: 12 },
  { name: "Yasmin", shortName: "Yasmin", role: "crew", sort: 20 },
  { name: "Ewan", shortName: "Ewan", role: "crew", sort: 30 },
  { name: "Sedef", shortName: "Sedef", role: "crew", sort: 31 },
  { name: "Lara", shortName: "Lara", role: "crew", sort: 32 },
  { name: "Chris Hague", shortName: "Chris", role: "crew", sort: 33 },
  { name: "Adam Haggy", shortName: "Adam", role: "crew", sort: 38 },
  { name: "Uncle Paul", shortName: "Paul", role: "crew", sort: 34 },
  { name: "Brogan", shortName: "Brogan", role: "crew", sort: 35 },
  { name: "Alex", shortName: "Alex", role: "crew", sort: 36 },
  { name: "Jonathan", shortName: "Jonathan", role: "crew", sort: 37 },
  { name: "Sarah", shortName: "Sarah", role: "crew", sort: 40 },
  { name: "Sharon", shortName: "Sharon", role: "crew", sort: 41 },
  { name: "David Scope", shortName: "David", role: "crew", sort: 42 },
];

const RIDERS = [
  { short: "Gary", display: "Gary Channon", sort: 1 },
  { short: "Simon", display: "Simon Channon", sort: 2 },
  { short: "Nathan", display: "Nathan Channon", sort: 3 },
  { short: "Steve", display: "Steve Brook", sort: 4 },
];

const DAYS = [
  { day: 1, label: "Day 1 — Saturday 14 November", start: "Barnes, London", end: "Loughborough", miles: 133, feet: 6000, gpx: "content/route/day1.gpx" },
  { day: 2, label: "Day 2 — Sunday 15 November", start: "Loughborough", end: "Yeadon Cemetery", miles: 110, feet: 5700, gpx: "content/route/day2.gpx" },
];

// Stops are placeholders until Simon's pins arrive (§4.4): only the known ends.
const STOPS: { day: number; sort: number; name: string; kind: (typeof schema.STOP_KINDS)[number]; mile: number | null }[] = [
  { day: 1, sort: 0, name: "Start — Barnes", kind: "short", mile: 0 },
  { day: 1, sort: 99, name: "Loughborough — overnight", kind: "overnight", mile: 133 },
  { day: 2, sort: 0, name: "Loughborough", kind: "short", mile: 0 },
  { day: 2, sort: 98, name: "Yeadon Cemetery", kind: "finish", mile: 110 },
  { day: 2, sort: 99, name: "Yeadon Cricket Club", kind: "finish", mile: null },
];

const LINKS = [
  { label: "JustGiving — give here", url: "https://www.justgiving.com/page/simon-gary-sarahchannon-3" },
  { label: "JCMR Master Task List (Google Sheet)", url: "" },
  { label: "WhatsApp — JCMR group", url: "" },
  { label: "WhatsApp — Zwiff (riders)", url: "" },
  { label: "Strava — Day 1 route", url: "" },
  { label: "Strava — Day 2 route", url: "" },
  { label: "Drive — JCMR folder", url: "" },
];

const CONTENT: Record<string, string> = {
  home_intro_md: "On 15 November 2024 we lost our Mum, Janet. Two years on, four of us are cycling 240 miles from the house in Barnes where she died to Yeadon in West Yorkshire, where she came from and where she is buried. We are raising money for the Royal British Legion.",
  mum_story_md: "_Simon's \"our story\" piece goes here — the same text as the JustGiving page. Admin → Content._",
};

export async function seedAll(withItems: boolean, log: (s: string) => void = console.log): Promise<string[]> {
  const lines: string[] = [];
  const say = (m: string) => { lines.push(m); log(m); };
  await ready();

  for (const p of PEOPLE) {
    const ex = await db.select().from(schema.people).where(eq(schema.people.shortName, p.shortName)).get();
    if (ex) await db.update(schema.people).set({ name: p.name, role: p.role, sortOrder: p.sort }).where(eq(schema.people.id, ex.id));
    else await db.insert(schema.people).values({ name: p.name, shortName: p.shortName, role: p.role, sortOrder: p.sort, active: true });
  }
  say(`people: ${PEOPLE.length}`);

  for (const r of RIDERS) {
    const person = await db.select().from(schema.people).where(eq(schema.people.shortName, r.short)).get();
    const ex =
      (person ? await db.select().from(schema.riders).where(eq(schema.riders.personId, person.id)).get() : undefined) ??
      (await db.select().from(schema.riders).where(eq(schema.riders.displayName, r.display)).get());
    if (ex) await db.update(schema.riders).set({ personId: person?.id, displayName: r.display, sortOrder: r.sort }).where(eq(schema.riders.id, ex.id));
    else await db.insert(schema.riders).values({ personId: person?.id, displayName: r.display, sortOrder: r.sort, bioMd: "" });
  }
  say(`riders: ${RIDERS.length}`);

  for (const d of DAYS) {
    const ex = await db.select().from(schema.routeDays).where(eq(schema.routeDays.day, d.day)).get();
    const vals = { label: d.label, startLabel: d.start, endLabel: d.end, miles: d.miles, feet: d.feet, gpxPath: d.gpx };
    let id: number;
    if (ex) {
      await db.update(schema.routeDays).set(vals).where(eq(schema.routeDays.id, ex.id));
      id = ex.id;
    } else {
      id = (await db.insert(schema.routeDays).values({ day: d.day, ...vals }).returning({ id: schema.routeDays.id }))[0].id;
    }
    for (const st of STOPS.filter((s) => s.day === d.day)) {
      const exs = await db.select().from(schema.routeStops).where(and(eq(schema.routeStops.dayId, id), eq(schema.routeStops.name, st.name))).get();
      if (!exs) await db.insert(schema.routeStops).values({ dayId: id, sortOrder: st.sort, name: st.name, kind: st.kind, approxMile: st.mile });
    }
  }
  say(`route days: ${DAYS.length}`);

  const existingLinks = await db.select().from(schema.links).all();
  if (existingLinks.length === 0) {
    let i = 0;
    for (const l of LINKS) await db.insert(schema.links).values({ label: l.label, url: l.url, sortOrder: i++ });
    say(`links: ${LINKS.length} (blank URLs to fill in Admin → Links)`);
  }

  const mumPhoto = await db.select().from(schema.assets).where(eq(schema.assets.kind, "mum_photo")).get();
  if (!mumPhoto) await db.insert(schema.assets).values({ kind: "mum_photo", path: "/photos/janet-portrait.jpg", chosenBy: "handoff", at: new Date().toISOString() });

  for (const [key, md] of Object.entries(CONTENT)) {
    const ex = await db.select().from(schema.content).where(eq(schema.content.key, key)).get();
    if (!ex) await db.insert(schema.content).values({ key, md });
  }

  for (const [key, value] of Object.entries(SETTING_DEFAULTS)) {
    const ex = await db.select().from(schema.settings).where(eq(schema.settings.key, key)).get();
    if (!ex) await db.insert(schema.settings).values({ key, value });
  }
  // The placeholder strapline and intro from the first build give way to the handoff copy.
  const strap = await db.select().from(schema.settings).where(eq(schema.settings.key, "site.strapline")).get();
  if (strap?.value?.startsWith("Four of us, 240 miles")) await db.update(schema.settings).set({ value: SETTING_DEFAULTS["site.strapline"] }).where(eq(schema.settings.key, "site.strapline"));
  const intro = await db.select().from(schema.content).where(eq(schema.content.key, "home_intro_md")).get();
  if (intro?.md?.startsWith("On 14–15 November 2026 four of us")) await db.update(schema.content).set({ md: CONTENT.home_intro_md }).where(eq(schema.content.key, "home_intro_md"));
  // The embed verdict is a fact of the first build (12 Oct 2026).
  await db
    .insert(schema.settings)
    .values({ key: "donate.embed_verdict", value: "refused — x-frame-options: SAMEORIGIN (checked 12 Oct 2026)" })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: "refused — x-frame-options: SAMEORIGIN (checked 12 Oct 2026)" } });
  say("settings + content: ok");

  {
    const { importCatalogueCsv, importRiderItemsCsv } = await import("./kit");
    const catPath = path.join(process.cwd(), "content", "seed", "kit-catalogue.csv");
    const ridersPath = path.join(process.cwd(), "content", "seed", "kit-riders.csv");
    if (fs.existsSync(catPath)) {
      const r = await importCatalogueCsv(fs.readFileSync(catPath, "utf8"));
      say(`kit suggested list: ${r.imported} imported, ${r.updated} updated, ${r.rejected.length} rejected`);
    }
    if (fs.existsSync(ridersPath)) {
      const fiona = await db.select().from(schema.people).where(eq(schema.people.shortName, "Fiona")).get();
      const r = await importRiderItemsCsv({ name: "Fiona", pid: fiona!.id, role: "admin" }, fs.readFileSync(ridersPath, "utf8"));
      say(`kit riders' lists: ${r.imported} imported, ${r.updated} updated, ${r.rejected.length} rejected`);
    }
  }

  {
    const { seedPlaces } = await import("./sleeping");
    const n = await seedPlaces();
    say(`sleeping places: ${n} added`);
  }

  if (withItems) {
    const { importItemsCsv } = await import("./import");
    const csvPath = path.join(process.cwd(), "content", "seed", "items.csv");
    const fiona = await db.select().from(schema.people).where(eq(schema.people.shortName, "Fiona")).get();
    const report = await importItemsCsv({ name: "Fiona", pid: fiona!.id, role: "admin" }, fs.readFileSync(csvPath, "utf8"));
    say(`items: imported ${report.imported}, updated ${report.updated}, rejected ${report.rejected.length}`);
    for (const r of report.rejected) say(`  row ${r.row}: ${r.reason} — ${r.title}`);
    await db.insert(schema.audit).values({ actor: "seed", at: new Date().toISOString(), action: `seed import: ${report.imported} imported, ${report.updated} updated, ${report.rejected.length} rejected` });
  }
  return lines;
}
