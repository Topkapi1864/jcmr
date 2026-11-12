// Crew → Vehicle route through the front door: the BUILT site and a scratch database.
// Signed out (refused), a forged session (refused), a crew session (served).
//
// Start the built site yourself on a spare port against a scratch database, then
// run this with the SAME three settings (from the repo root, after `npm run build`):
//   export DATABASE_URL=file:/tmp/jcmr-vehicle-test/test.db SESSION_SECRET=test-only-secret-0123456789abcdef
//   npx next start -p 3988 &
//   JCMR_TEST_URL=http://localhost:3988 npx tsx scripts/test-vehicle-route-http.ts
// It refuses to run against anything but localhost.
import assert from "node:assert/strict";
import fs from "node:fs";

const B = (process.env.JCMR_TEST_URL ?? "").replace(/\/$/, "");
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(B)) throw new Error("set JCMR_TEST_URL to the local test site, e.g. http://localhost:3988");
if (!/^file:/.test(process.env.DATABASE_URL ?? "")) throw new Error("set DATABASE_URL to the scratch file: database the test site uses");
if (!process.env.SESSION_SECRET) throw new Error("set SESSION_SECRET to the one the test site uses");

let n = 0;
const ok = (name: string) => console.log(`ok ${++n} - ${name}`);
type Who = string | null;
const get = (p: string, who: Who) => fetch(B + p, { redirect: "manual", headers: who ? { cookie: `jcmr_session=${who}` } : {} });
const text = (html: string) =>
  html
    .replace(/<!--.*?-->/g, "")
    .replace(/&#x27;|&#39;|&rsquo;/g, "'")
    .replace(/&amp;/g, "&");

const PAGE = "/crew/vehicle-route";
const FILES = [
  { path: `${PAGE}/gpx/JCMR_vehicle_Day1_V1.0.gpx`, name: "JCMR_vehicle_Day1_V1.0.gpx", src: "content/vehicle/day1.gpx", day: 1 },
  { path: `${PAGE}/gpx/JCMR_vehicle_Day2A_via_Leeds_Dock_V1.0.gpx`, name: "JCMR_vehicle_Day2A_via_Leeds_Dock_V1.0.gpx", src: "content/vehicle/day2a.gpx", day: 2 },
  { path: `${PAGE}/gpx/JCMR_vehicle_Day2B_direct_V1.0.gpx`, name: "JCMR_vehicle_Day2B_direct_V1.0.gpx", src: "content/vehicle/day2b.gpx", day: 2 },
];
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

async function main() {
  const { client, ready } = await import("../src/db/client");
  const { signSession } = await import("../src/lib/session");
  await ready();
  await client.execute("INSERT OR IGNORE INTO people (id, name, short_name, role) VALUES (9002, 'Test Crew', 'TCrew', 'crew')");
  client.close();
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const crew = await signSession({ pid: 9002, name: "TCrew", role: "crew", exp });

  // ---- what is committed names no stop and carries no waypoint ----
  for (const f of FILES) {
    const x = fs.readFileSync(f.src, "utf8");
    assert.equal(count(x, /<wpt[\s>]/g), 0, `${f.src} has no waypoint`);
    assert.equal(count(x, /<trk>/g), 1);
    assert.equal(count(x, /<trkseg>/g), 1);
    assert.ok(!/<extensions|gpxx:|gpxtpx:/.test(x), "plain GPX 1.1");
  }
  ok("the committed tracks: one trk, one trkseg, no waypoint, no extensions");

  // ---- the leg data: the one meeting point that comes from the plan is not written down, and no place is called a stop ----
  const lib = fs.readFileSync("src/lib/vehicle-route.ts", "utf8");
  const legData = lib.slice(lib.indexOf("export const LEGS"), lib.indexOf("];", lib.indexOf("export const LEGS")));
  assert.ok(legData.length > 5000, "the leg data was found");
  for (const src of ["src/lib/vehicle-route.ts", "src/app/crew/vehicle-route/page.tsx", ...FILES.map((f) => f.src)]) assert.ok(!fs.readFileSync(src, "utf8").includes(["53", "774893"].join(".")), `${src} does not carry the plan's point`);
  const stopWords = legData.match(/[^".]*\bstops?\b[^".]*/gi) ?? [];
  assert.deepEqual(
    stopWords.map((w) => w.trim()),
    ["For the first two miles the car is on the dual carriageway 10 to 50 m from them but cannot stop"],
    "the word stop is in the leg data once, as what a car cannot do, and beside no place",
  );
  assert.equal(count(legData, /the meeting point/gi), 9, "place 6 of Day 2 says the meeting point, in its three parts");
  ok("the leg data: the plan's point is not in the repo, and no place is called a stop");

  // ---- signed out: the page and each download give the sign-in page and nothing else ----
  for (const p of [PAGE, ...FILES.map((f) => f.path), `${PAGE}/gpx/nothing.gpx`]) {
    const r = await get(p, null);
    assert.equal(r.status, 307, `${p} signed out`);
    assert.ok((r.headers.get("location") ?? "").includes("/crew/signin"), `${p} goes to sign-in`);
    const body = await r.text();
    assert.ok(!body.includes("<trkpt") && !body.includes("Kirkstall"), `${p} signed out serves nothing of the route`);
  }
  for (const p of [PAGE, FILES[0].path]) assert.equal((await get(p, crew.slice(0, -3) + "abc")).status, 307, "a forged session is refused");
  ok("signed out or forged: the page and the three downloads go to the sign-in page");

  for (const p of ["/", "/route", "/live", "/support-crew", "/weather", "/crew/signin", "/api/live", "/api/route-geo", "/api/route-geo?format=profile", "/robots.txt"]) {
    const t = await (await get(p, null)).text();
    assert.ok(!/vehicle[ -]route|JCMR_vehicle|OsmAnd|Leeds Dock/i.test(t), `${p} says nothing about the vehicle route`);
  }
  ok("no public page or feed says a word about the vehicle route");

  // ---- a crew session: the page ----
  const res = await get(PAGE, crew);
  assert.equal(res.status, 200);
  const html = await res.text();
  const page = text(html);
  assert.ok(page.includes("These roads come from the map. Nobody has driven them, the times have no traffic in them, and nothing has been checked for the motorhome's height or width. Go by the roads named and your own eyes."), "the top line, word for word");
  assert.ok(page.includes("Google Maps cannot follow a GPX. Use OsmAnd (Navigate by track) for the whole route, or the Maps buttons below leg by leg."), "the OsmAnd line");
  assert.ok(page.includes("A goes to Leeds Dock and round the ring road; B goes straight to Kirkstall Road by the M621 and is the one for a single vehicle; with two vehicles, one each."), "what A and B are");
  for (const f of FILES) assert.ok(html.includes(`href="${f.path}"`), `a download button for ${f.name}`);
  assert.equal(count(page, /download the GPX \(V 1\.0\)/g), 3, "three download buttons, each saying (V 1.0)");
  const legIds = [...html.matchAll(/id="place-(\d)-(\w+)"/g)].map((m) => `${m[1]}-${m[2]}`);
  assert.deepEqual(legIds, ["1-1", "1-2", "1-3", "1-4", "1-5", "1-6", "1-7", "1-8", "2-1", "2-2", "2-3", "2-4", "2-5", "2-6a", "2-6b", "2-6c", "2-7"], "eight places on Day 1, seven on Day 2 with place 6 in three parts, in order");
  const legButtons = count(html, /<a[^>]*href="https:\/\/www\.google\.com\/maps\/dir\/\?api=1&amp;[^"]+"[^>]*>Google Maps: /g);
  assert.equal(legButtons, 17, "a Google Maps button on every place");
  assert.ok(
    page.includes(
      "V 1.0 turns round in two places where it has followed the riders to a point a car cannot pass. Day 1, Leicester: the line goes to the end of Ryder Road, a dead end, and comes back about 690 m. Day 2, Sheffield: the line goes to the tram junction on Glossop Road and comes back about 300 m to Wilkinson Street. V 1.1 takes both out.",
    ),
    "the V 1.0 line under the downloads, word for word",
  );
  assert.ok(/href="\/crew\/vehicle-route"[^>]*>Vehicle route</.test(html), "its own entry in the crew menu");

  // The stops on the page are the plan's own, as the Stops tool lists them.
  const stopsPage = await (await get("/crew/stops", crew)).text();
  const planStops = count(stopsPage, /class="card stack-sm stop-row"/g);
  const stopButtons = count(page, /Google Maps to stop \d+</g);
  assert.ok(planStops > 0, "the scratch plan has stops");
  assert.equal(stopButtons, planStops, "every stop in the plan is listed, each with its Maps button");

  // Day 2's place 6: its point and its three Maps links come from the plan as it is now (the entry nearest mile 97.1, within 3 miles).
  const day2 = html.slice(html.indexOf('id="place-2-1"'));
  const day2Stops = [...day2.matchAll(/Mile (?:<!-- -->)?([\d.]+)[\s\S]{0,600}?href="https:\/\/www\.google\.com\/maps\/dir\/\?api=1&amp;destination=(-?[\d.]+),(-?[\d.]+)&amp;travelmode=driving"/g)].map((m) => ({ mile: Number(m[1]), lat: Number(m[2]), lon: Number(m[3]) }));
  assert.ok(day2Stops.length > 0, "Day 2's stops were read off the page");
  const near = day2Stops.reduce((a, b) => (Math.abs(b.mile - 97.1) < Math.abs(a.mile - 97.1) ? b : a));
  const href = (id: string) => (html.match(new RegExp(`id="place-2-${id}"[\\s\\S]*?<a[^>]*href="(https://www\\.google\\.com/maps/dir/[^"]+)"`)) ?? [])[1]?.replace(/&amp;/g, "&") ?? "";
  if (Math.abs(near.mile - 97.1) <= 3) {
    const at = `${near.lat.toFixed(6)},${near.lon.toFixed(6)}`;
    assert.equal(href("6a"), `https://www.google.com/maps/dir/?api=1&origin=53.75893,-1.44398&destination=${at}&waypoints=53.77167,-1.50876&travelmode=driving`);
    assert.equal(href("6b"), `https://www.google.com/maps/dir/?api=1&origin=${at}&destination=53.79259,-1.53395&travelmode=driving`);
    assert.equal(href("6c"), `https://www.google.com/maps/dir/?api=1&origin=${at}&destination=53.79805,-1.56186&travelmode=driving`);
    ok(`Day 2 place 6: the point and the three Maps links are the plan's stop at mile ${near.mile} (${at})`);
  } else {
    assert.equal(href("6a"), "https://www.google.com/maps/dir/?api=1&origin=53.75893,-1.44398&destination=53.77167,-1.50876&travelmode=driving");
    assert.equal(href("6b"), "https://www.google.com/maps/dir/?api=1&destination=53.79259,-1.53395&travelmode=driving");
    assert.equal(href("6c"), "https://www.google.com/maps/dir/?api=1&destination=53.79805,-1.56186&travelmode=driving");
    ok(`Day 2 place 6: no plan stop within 3 miles of mile 97.1 (nearest ${near.mile}); the links fall back to the turn and to where you are`);
  }
  ok(`a crew session: the page, its three lines, 17 leg buttons, 3 downloads, ${stopButtons} stops from the plan`);

  // ---- a crew session: the downloads ----
  const perDay: Record<number, number> = {};
  for (const f of FILES) {
    const r = await get(f.path, crew);
    assert.equal(r.status, 200, f.path);
    assert.equal(r.headers.get("content-type"), "application/gpx+xml");
    assert.equal(r.headers.get("content-disposition"), `attachment; filename="${f.name}"`);
    assert.match(r.headers.get("cache-control") ?? "", /private/);
    const x = await r.text();
    const src = fs.readFileSync(f.src, "utf8");
    assert.equal(count(x, /<trk>/g), 1);
    assert.equal(count(x, /<trkseg>/g), 1);
    assert.equal(count(x, /<trkpt /g), count(src, /<trkpt /g), "every track point of the committed file");
    assert.ok(!/<extensions|gpxx:/.test(x));
    const w = count(x, /<wpt /g);
    perDay[f.day] = perDay[f.day] ?? w;
    assert.equal(w, perDay[f.day], "the same stops in both Day 2 files");
    assert.ok(w > 0, "the day's stops are in the download as waypoints");
    assert.ok(/<wpt lat="-?\d+\.\d{6}" lon="-?\d+\.\d{6}"><name>D\d stop \d+ [^<]+ \d\d:\d\d<\/name>/.test(x), "waypoints named by day, number, name and time");
    assert.ok(x.indexOf("<wpt ") < x.indexOf("<trk>"), "waypoints before the track, as GPX 1.1 orders them");
  }
  assert.equal(perDay[1] + perDay[2], planStops, "the waypoints are the plan's stops, all of them");
  assert.equal((await get(`${PAGE}/gpx/nothing.gpx`, crew)).status, 404);
  ok("a crew session: three downloads as application/gpx+xml with a .gpx filename, one trk, one trkseg, the plan's stops as waypoints");

  console.log(`# ${n} passed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
