// Day 2 leaves at 07:30 (Gary's word, Sun 15 Nov 2026), through the front door: the BUILT
// site and a scratch database. Two steps, because the move happens on the site's first request:
//   export DATABASE_URL=file:/tmp/jcmr-day2-test/test.db SESSION_SECRET=test-only-secret-0123456789abcdef PUBLIC_LIVE=true
//   npx tsx scripts/test-day2-start-http.ts prep          (a saved plan at 07:00 and the Day 2 times that went with it)
//   node node_modules/next/dist/bin/next start -p 3989 &
//   JCMR_TEST_URL=http://localhost:3989 npx tsx scripts/test-day2-start-http.ts check
// It refuses to run against anything but localhost and a file: database.
import assert from "node:assert/strict";

const mode = process.argv[2];
if (!/^file:/.test(process.env.DATABASE_URL ?? "")) throw new Error("set DATABASE_URL to the scratch file: database the test site uses");

let n = 0;
const ok = (name: string) => console.log(`ok ${++n} - ${name}`);
const text = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<!--.*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;|&rsquo;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

const D2_BEFORE: Record<string, string> = { start: "07:00", mid: "10:19", end: "17:26" };

async function prep() {
  const { client, ready } = await import("../src/db/client");
  const { seedAll } = await import("../src/lib/seed-data");
  const { DEFAULT_PLAN } = await import("../src/lib/plan");
  await ready();
  await seedAll(false);
  const plan = { ...DEFAULT_PLAN, days: { 1: { start: "07:00", speedMph: null }, 2: { start: "07:00", speedMph: null } } };
  await client.execute({ sql: "INSERT INTO settings (key, value) VALUES ('route.plan', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", args: [JSON.stringify({ plan, savedBy: "TCrew", savedAt: "2026-11-13T10:00:00.000Z" })] });
  const days = await client.execute("SELECT id, day FROM route_days ORDER BY day");
  const d1 = Number(days.rows.find((r) => Number(r.day) === 1)!.id);
  const d2 = Number(days.rows.find((r) => Number(r.day) === 2)!.id);
  await client.execute({ sql: "DELETE FROM route_stops WHERE name LIKE 'T2 %' OR name LIKE 'T1 %'", args: [] });
  await client.execute({ sql: "INSERT INTO route_stops (day_id, sort_order, name, approx_mile, kind, planned_time) VALUES (?, 900, 'T1 start', NULL, 'short', '07:00'), (?, 901, 'T1 late', NULL, 'short', '18:51')", args: [d1, d1] });
  await client.execute({
    sql: "INSERT INTO route_stops (day_id, sort_order, name, approx_mile, kind, planned_time) VALUES (?, 900, 'T2 start', NULL, 'short', ?), (?, 901, 'T2 mid', NULL, 'short', ?), (?, 902, 'T2 end', NULL, 'short', ?), (?, 903, 'T2 none', NULL, 'short', NULL), (?, 904, 'T2 odd', NULL, 'short', 'tbc')",
    args: [d2, D2_BEFORE.start, d2, D2_BEFORE.mid, d2, D2_BEFORE.end, d2, d2],
  });
  client.close();
  console.log("prepared: a saved plan with Day 2 at 07:00, and test rows on both days");
}

async function check() {
  const B = (process.env.JCMR_TEST_URL ?? "").replace(/\/$/, "");
  if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(B)) throw new Error("set JCMR_TEST_URL to the local test site, e.g. http://localhost:3989");
  const { createClient } = await import("@libsql/client");
  const db = createClient({ url: process.env.DATABASE_URL! });
  const rowsOf = async (prefix: string) => Object.fromEntries((await db.execute({ sql: "SELECT name, planned_time FROM route_stops WHERE name LIKE ? ORDER BY sort_order", args: [`${prefix} %`] })).rows.map((r) => [String(r.name), r.planned_time == null ? null : String(r.planned_time)]));
  const planNow = async () => JSON.parse(String((await db.execute("SELECT value FROM settings WHERE key = 'route.plan'")).rows[0].value)) as { plan: { days: Record<string, { start: string }> }; savedBy: string; savedAt: string };
  const marks = async () => (await db.execute("SELECT value FROM settings WHERE key = 'route.day2_start_0730'")).rows.length;
  const audits = async () => (await db.execute("SELECT action FROM audit WHERE action LIKE 'Day 2 start%'")).rows.map((r) => String(r.action));

  // Several requests at once, on the pages that run the move: the first is the one that moves it.
  const pages = await Promise.all(["/route", "/route", "/api/live", "/route", "/weather", "/route"].map((p) => fetch(B + p).then(async (r) => ({ p, status: r.status, body: await r.text() }))));
  const route = pages.find((x) => x.p === "/route")!;
  assert.equal(route.status, 200, "/route is served signed out");
  ok("six requests at once, /route served signed out");

  const t = text((await (await fetch(B + "/route")).text()));
  assert.match(t, /Day 2 — Sunday 15 November/, "the Day 2 section is there");
  const d1 = t.slice(t.indexOf("Day 1 — Saturday 14 November"), t.indexOf("Day 2 — Sunday 15 November"));
  const d2 = t.slice(t.indexOf("Day 2 — Sunday 15 November"));
  assert.match(d1, /07:00 off · ~ ?18:51 in/, `Day 1 as it was: ${d1.slice(0, 200)}`);
  ok("Day 1: 07:00 off, ~18:51 in, unchanged");
  assert.match(d2, /07:30 off · ~ ?17:56 in/, `Day 2 at 07:30: ${d2.slice(0, 200)}`);
  assert.ok(!/\b07:00\b/.test(d2), "no 07:00 left in the Day 2 section");
  ok("Day 2: 07:30 off, ~17:56 in, and no 07:00 anywhere in its section");
  assert.match(d2, /Download the GPX \(V ?2\.3 ?\)/, "Day 2 GPX is still V 2.3");
  assert.match(d2, /109\.2 mi/, "Day 2 is still 109.2 mi");
  ok("Day 2 still 109.2 mi, GPX V 2.3");

  const p = await planNow();
  assert.equal(p.plan.days["2"].start, "07:30");
  assert.equal(p.plan.days["1"].start, "07:00");
  assert.ok(p.savedAt > "2026-11-13T10:00:00.000Z" && /TCrew; Day 2 start moved to 07:30 on Gary's word/.test(p.savedBy), `savedBy/savedAt: ${p.savedBy} ${p.savedAt}`);
  ok("the saved plan: Day 2 07:30, Day 1 07:00, a new savedAt");

  assert.deepEqual(await rowsOf("T2"), { "T2 start": "07:30", "T2 mid": "10:49", "T2 end": "17:56", "T2 none": null, "T2 odd": "tbc" });
  assert.deepEqual(await rowsOf("T1"), { "T1 start": "07:00", "T1 late": "18:51" });
  ok("Day 2 planned times moved 30 minutes, once; Day 1's and the ones that are not a time untouched");
  assert.equal(await marks(), 1);
  assert.equal((await audits()).length, 1, `one line in the audit: ${JSON.stringify(await audits())}`);
  ok(`marked once, one audit line: ${(await audits())[0]}`);

  // The plan is the crew's again: a start they set afterwards stays.
  const mine = { ...p, plan: { ...p.plan, days: { ...p.plan.days, "2": { ...p.plan.days["2"], start: "07:45" } } }, savedBy: "TCrew", savedAt: new Date().toISOString() };
  await db.execute({ sql: "UPDATE settings SET value = ? WHERE key = 'route.plan'", args: [JSON.stringify(mine)] });
  const t2 = text(await (await fetch(B + "/route")).text());
  assert.match(t2.slice(t2.indexOf("Day 2 — Sunday 15 November")), /07:45 off · ~ ?18:11 in/, "a start the crew sets afterwards is the one shown");
  assert.deepEqual(await rowsOf("T2"), { "T2 start": "07:30", "T2 mid": "10:49", "T2 end": "17:56", "T2 none": null, "T2 odd": "tbc" });
  assert.equal((await planNow()).plan.days["2"].start, "07:45");
  ok("afterwards the crew's own start (07:45) is shown and nothing is moved again");
  await db.execute({ sql: "UPDATE settings SET value = ? WHERE key = 'route.plan'", args: [JSON.stringify(p)] });
  db.close();
  console.log(`\n${n} checks passed`);
}

(mode === "prep" ? prep() : mode === "check" ? check() : Promise.reject(new Error("say prep or check"))).catch((e) => {
  console.error(e);
  process.exit(1);
});
