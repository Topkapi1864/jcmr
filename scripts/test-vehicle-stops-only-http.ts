// Crew → Vehicle route → "Stops only (motorhome and Crew Chief)", through the front door:
// the BUILT site and a scratch database. Signed out (refused), a crew session (served).
// Run as scripts/test-vehicle-route-http.ts is run, with the same three settings:
//   export DATABASE_URL=file:/tmp/jcmr-vehicle-test/test.db SESSION_SECRET=test-only-secret-0123456789abcdef
//   node node_modules/next/dist/bin/next start -p 3988 &
//   JCMR_TEST_URL=http://localhost:3988 npx tsx scripts/test-vehicle-stops-only-http.ts
// It refuses to run against anything but localhost.
import assert from "node:assert/strict";
import fs from "node:fs";

const B = (process.env.JCMR_TEST_URL ?? "").replace(/\/$/, "");
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(B)) throw new Error("set JCMR_TEST_URL to the local test site, e.g. http://localhost:3988");
if (!/^file:/.test(process.env.DATABASE_URL ?? "")) throw new Error("set DATABASE_URL to the scratch file: database the test site uses");
if (!process.env.SESSION_SECRET) throw new Error("set SESSION_SECRET to the one the test site uses");

// Fiona's ruling of 13 Nov 2026 (18:37Z): B, no GPX on the site. The section is its lines and the table with its Maps buttons.
const PAGE = "/crew/vehicle-route";
const FILES = [
  { day: 1, name: "JCMR_vehicle_stops_only_Day1_V1.0.gpx", src: "content/vehicle/day1s.gpx" },
  { day: 2, name: "JCMR_vehicle_stops_only_Day2_V1.0.gpx", src: "content/vehicle/day2s.gpx" },
].map((f) => ({ ...f, path: `${PAGE}/gpx/${f.name}` }));
const MOTORHOME = "The motorhome's height and width have been checked against nothing: not on any road, and not at any stop.";
const TIGHT = "Three legs are tight even with no traffic: Barnes to stop 1, stop 8 to stop 9, and stop 17 to Yeadon. On those, leave BEFORE the riders.";
const TURN = "At stops 1, 2, 9, 10, 11 and 17 you leave the way you came in. Nobody has checked there is room to turn the motorhome.";
const LINE = "Stop to stop for the motorhome and Crew Chief. This does NOT follow the riders between stops.";

let n = 0;
const ok = (name: string) => console.log(`ok ${++n} - ${name}`);
const get = (p: string, who: string | null) => fetch(B + p, { redirect: "manual", headers: who ? { cookie: `jcmr_session=${who}` } : {} });
const text = (html: string) =>
  html
    .replace(/<!--.*?-->/g, "")
    .replace(/&#x27;|&#39;|&rsquo;/g, "'")
    .replace(/&amp;/g, "&");
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

async function main() {
  const { client, ready } = await import("../src/db/client");
  const { signSession } = await import("../src/lib/session");
  await ready();
  await client.execute("INSERT OR IGNORE INTO people (id, name, short_name, role) VALUES (9002, 'Test Crew', 'TCrew', 'crew')");
  client.close();
  const crew = await signSession({ pid: 9002, name: "TCrew", role: "crew", exp: Math.floor(Date.now() / 1000) + 3600 });

  // ---- what is committed: no stops-only track, under any name ----
  for (const f of FILES) assert.ok(!fs.existsSync(f.src), `${f.src} is not in the repo`);
  assert.deepEqual(fs.readdirSync("content/vehicle").sort(), ["day1.gpx", "day2a.gpx", "day2b.gpx"], "content/vehicle holds the three V 1.1 tracks and nothing else");
  ok("no stops-only track is in the repo");

  // ---- signed out ----
  for (const p of [PAGE, ...FILES.map((f) => f.path)]) {
    const r = await get(p, null);
    assert.equal(r.status, 307, `${p} signed out`);
    assert.ok((r.headers.get("location") ?? "").includes("/crew/signin"), `${p} goes to sign-in`);
    const body = await r.text();
    assert.ok(!body.includes("<trkpt") && !/stops only/i.test(body), `${p} signed out serves nothing of it`);
  }
  for (const p of ["/", "/route", "/live", "/support-crew", "/weather", "/crew/signin", "/api/live", "/api/route-geo", "/api/route-geo?format=profile", "/robots.txt"]) {
    const t = await (await get(p, null)).text();
    assert.ok(!/stops only|JCMR_vehicle|motorhome and Crew Chief/i.test(t), `${p} says nothing about it`);
  }
  ok("signed out: the page and the two addresses go to the sign-in page; no public page or feed says a word of it");

  // ---- a crew session: the section ----
  const res = await get(PAGE, crew);
  assert.equal(res.status, 200);
  const html = await res.text();
  const page = text(html);
  const from = html.indexOf('id="stops-only"');
  const to = html.indexOf("The vehicle GPX files");
  assert.ok(from > 0 && to > from, "the section is above the three vehicle files");
  const sec = html.slice(from, to);
  const secText = text(sec);
  assert.ok(secText.includes(">Stops only (motorhome and Crew Chief)</h2>"), "its heading, word for word");
  assert.ok(secText.includes(LINE), "the line: stop to stop, does NOT follow the riders");
  assert.ok(secText.includes(MOTORHOME), "the motorhome line");
  assert.ok(secText.includes(TIGHT), "Fiona's line on the three tight legs, word for word");
  assert.ok(secText.includes(TURN), "Fiona's line on the six stops left the way you came in, word for word");
  assert.ok(!/download|\.gpx|OsmAnd/i.test(secText), "no download, no file name, no word of a track in the section");

  // the table: every stop in the plan, numbered through, then each day's finish, each with a Maps button from where the phone is
  const stopsPage = await (await get("/crew/stops", crew)).text();
  const planStops = count(stopsPage, /class="card stack-sm stop-row"/g);
  assert.ok(planStops > 0, "the scratch plan has stops");
  const rows = [...sec.matchAll(/<li[^>]*data-stops-only="(main|short|finish)"[\s\S]*?<\/li>/g)].map((m) => ({ kind: m[1], html: m[0], href: ((m[0].match(/href="(https:\/\/www\.google\.com\/maps\/dir\/[^"]+)"/) ?? [])[1] ?? "").replace(/&amp;/g, "&") }));
  assert.equal(rows.filter((r) => r.kind !== "finish").length, planStops, "every stop in the plan has a row");
  assert.equal(rows.filter((r) => r.kind === "finish").length, 2, "each day's finish has a row");
  const nums = rows.filter((r) => r.kind !== "finish").map((r) => Number((r.html.match(/class="stop-n">(?:<!-- -->)?(\d+)</) ?? [])[1]));
  assert.deepEqual(nums, nums.map((_, i) => i + 1), "numbered 1 to the last, through the two days");
  for (const r of rows) {
    assert.match(r.href, /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=-?\d+\.\d+,-?\d+\.\d+(&waypoints=53\.77167,-1\.50876)?&travelmode=driving$/, "a Maps button: destination, driving, no origin");
    assert.match(text(r.html), /riders due (?:<!-- -->)?\d\d:\d\d/, "the riders' time");
  }
  assert.ok(rows.filter((r) => r.href.includes("waypoints=")).length <= 1, "at most one row goes in by the turn off Pontefract Road");
  // the finish rows are the last point of each day's public bike line
  const fin = rows.filter((r) => r.kind === "finish");
  assert.ok(text(fin[0].html).includes("Day 1 finish") && text(fin[1].html).includes("Day 2 finish"), "the two finishes, in order");
  // the one that goes in by the turn is the plan's stop nearest mile 97.1 of Day 2, when there is one within 3 miles (as place 6 has it)
  const day2Stops = [...html.slice(html.indexOf('id="place-2-1"')).matchAll(/Mile (?:<!-- -->)?([\d.]+)[\s\S]{0,600}?href="https:\/\/www\.google\.com\/maps\/dir\/\?api=1&amp;destination=(-?[\d.]+),(-?[\d.]+)&amp;travelmode=driving"/g)].map((m) => ({ mile: Number(m[1]), at: `${m[2]},${m[3]}` }));
  const near = day2Stops.length ? day2Stops.reduce((a, b) => (Math.abs(b.mile - 97.1) < Math.abs(a.mile - 97.1) ? b : a)) : null;
  const viaRow = rows.find((r) => r.href.includes("waypoints="));
  if (near && Math.abs(near.mile - 97.1) <= 3) assert.equal(viaRow?.href, `https://www.google.com/maps/dir/?api=1&destination=${near.at}&waypoints=53.77167,-1.50876&travelmode=driving`, "the stop at mile 97 goes in by the turn");
  else assert.equal(viaRow, undefined, "no plan stop near mile 97.1: no row carries the turn");
  ok(`a crew session: the section above the three files, its lines, ${planStops} stops and 2 finishes, each with a Maps button${viaRow ? ", one by the turn" : ""}`);

  // ---- the three V 1.1 files below are as they were ----
  assert.equal(count(page.slice(page.indexOf("The vehicle GPX files")), /download the GPX \(V 1\.1\)/g), 3, "the three V 1.1 buttons are still there");
  // (the page's own markup only: what follows the first self.__next_f is the same text again, for the browser)
  const shown = text(html.slice(0, html.indexOf("self.__next_f")));
  assert.equal(count(shown, /download the GPX/g), 3, "and they are the only downloads on the page");
  for (const v of ["JCMR_vehicle_Day1_V1.1.gpx", "JCMR_vehicle_Day2A_via_Leeds_Dock_V1.1.gpx", "JCMR_vehicle_Day2B_direct_V1.1.gpx"]) {
    const r = await get(`${PAGE}/gpx/${v}`, crew);
    assert.equal(r.status, 200, v);
    assert.ok((await r.text()).includes("<trkpt"), `${v} is still served to a crew session`);
  }
  ok("the existing section: three V 1.1 buttons and their three files, as they were");

  // ---- no stops-only file is served to anyone ----
  for (const f of FILES) assert.equal((await get(f.path, crew)).status, 404, `${f.path} serves nothing`);
  ok("the two stops-only addresses serve nothing to a crew session either (404)");

  console.log(`# ${n} passed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
