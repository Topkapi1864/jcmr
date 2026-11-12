#!/usr/bin/env node
// Tests for tools/ride/build.mjs. No Google key, and no network beyond this machine: Google is played
// by a small local server. Run from the repo root:  node tools/ride/test.mjs
//   RIDE_ROOT=<a checkout>  to test this folder's generator against another checkout's content/route
//   RIDE_TMP=<dir>          where the scratch folder goes (default: the OS temp dir)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build, check, parseGpx, dayPoints, nearestOnLine, readData, report, nearestPoint } from './build.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.RIDE_ROOT ? path.resolve(process.env.RIDE_ROOT) : path.resolve(HERE, '../..');
const tmp = fs.mkdtempSync(path.join(process.env.RIDE_TMP || os.tmpdir(), 'ride-test-'));
let n = 0;
const ok = (name) => console.log(`ok ${++n} - ${name}`);
const KEY = 'AIzaTESTKEYnotarealkey0123456789abcdefg';

// "Google": no Street View between Day 2 miles 30 and 31.5 and at one lone Day 1 point; everything else has it.
const state = { asked: 0, pictures: 0, mode: 'ok' };
const d1 = parseGpx(fs.readFileSync(path.join(ROOT, 'content/route/day1.gpx'), 'utf8'));
const d2 = parseGpx(fs.readFileSync(path.join(ROOT, 'content/route/day2.gpx'), 'utf8'));
const bare = new Set(
  [...dayPoints(2, d2, 0).filter((p) => p.day_miles >= 30 && p.day_miles <= 31.5), dayPoints(1, d1, 0)[200]].map((p) => `${p.lat},${p.lon}`),
);
const json = (res, body) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.searchParams.get('key') !== KEY) return json(res, { status: 'REQUEST_DENIED', error_message: `The provided API key ${u.searchParams.get('key')} is invalid.` });
  if (u.pathname.endsWith('/streetview/metadata')) {
    state.asked++;
    if (state.mode === 'limit') return json(res, { status: 'OVER_QUERY_LIMIT' });
    const loc = u.searchParams.get('location');
    const [lat, lng] = loc.split(',').map(Number);
    return json(res, bare.has(loc) ? { status: 'ZERO_RESULTS' } : { status: 'OK', pano_id: 'x', date: '2023-07', location: { lat: lat + 0.00005, lng }, copyright: '© Google' });
  }
  if (u.pathname.endsWith('/streetview')) {
    state.pictures++;
    res.writeHead(200, { 'content-type': 'image/jpeg' });
    return res.end(Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  }
  res.writeHead(404);
  res.end();
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const api = `http://127.0.0.1:${server.address().port}/maps/api`;
const base = { root: ROOT, images: 'browser', coverage: 'build', keyEnv: 'RIDE_TEST_KEY', api, radius: 25, tolerance: 4, concurrency: 8, quiet: true };

try {
  // 1. the totals are the Route page's
  assert.equal(d1.miles.toFixed(1), '121.2');
  assert.equal(d2.miles.toFixed(1), '109.2');
  ok('the route files are 121.2 and 109.2 miles');

  // 2. no key: nothing written
  delete process.env.RIDE_TEST_KEY;
  await assert.rejects(build({ ...base, out: path.join(tmp, 'nokey') }), /no Google key/);
  assert.equal(fs.existsSync(path.join(tmp, 'nokey', 'view.html')), false);
  ok('no key: refuses, writes nothing');

  // 3. a key Google refuses: nothing written, and the key is not echoed
  process.env.RIDE_TEST_KEY = 'AIzaWRONGKEY000000000000000000000000000';
  await assert.rejects(build({ ...base, out: path.join(tmp, 'denied') }), (e) => /REQUEST_DENIED/.test(e.message) && !e.message.includes('AIzaWRONG'));
  assert.equal(fs.existsSync(path.join(tmp, 'denied', 'view.html')), false);
  ok('a refused key: stops, writes nothing, the key is not printed');

  // 4. the allowance runs out: nothing written
  process.env.RIDE_TEST_KEY = KEY;
  state.mode = 'limit';
  await assert.rejects(build({ ...base, out: path.join(tmp, 'limit'), concurrency: 2, tries: 2 }), /OVER_QUERY_LIMIT/);
  assert.equal(fs.existsSync(path.join(tmp, 'limit', 'view.html')), false);
  state.mode = 'ok';
  ok('allowance used up: stops, writes nothing');

  // 5. a whole build, pictures asked for by the browser
  const out = path.join(tmp, 'browser');
  fs.mkdirSync(path.join(out, 'img'), { recursive: true });
  fs.writeFileSync(path.join(out, 'img', 'D1-0000.jpg'), 'october');
  state.asked = 0;
  const b = await build({ ...base, out });
  const html = fs.readFileSync(b.out, 'utf8');
  const data = readData(html);
  const rep = report(data);
  assert.equal(state.asked, data.points.length);
  assert.equal(state.pictures, 0);
  assert.deepEqual(rep.days.map((d) => d.points), [485, 437]);
  assert.deepEqual(rep.days.map((d) => d.miles.toFixed(1)), ['121.2', '109.2']);
  assert.equal(rep.total_miles.toFixed(1), '230.4');
  assert.deepEqual(rep.days.map((d) => d.no_street_view), [1, 7]);
  assert.deepEqual(rep.days.map((d) => d.not_checked), [0, 0]);
  assert.equal(rep.days[1].longest_uncovered[0], 'mile 30.00–31.50 (7 points)');
  assert.equal(fs.existsSync(path.join(out, 'img')), false);
  assert.ok(!html.includes(KEY) && !/AIza[\w-]{30,}/.test(html));
  for (const bad of ['Mapillary', 'OLD ROUTE', '231.9', 'old line']) assert.ok(!html.includes(bad), bad);
  assert.ok(html.includes('No Street View here'));
  assert.ok(data.points.every((p) => !('img' in p) && !('s' in p) && !('mid' in p)));
  ok('browser build: 485 + 437 points, every one answered, gaps named by mile, October pictures gone, no key in the page');

  // 6. the page reads back clean against the route files, and passes the gate
  const c = check(ROOT, b.out);
  assert.deepEqual(c.problems, []);
  assert.ok(c.gate.every((g) => g.ok && g.checked));
  ok(`check: points and drawn line on the route files (within 2 m), gate passes at all ${c.gate.length} places`);

  // 7. the site's own server code still fits the page (src/lib/ride-viewer.ts: key slot once, back link, data shape, public start)
  assert.equal(html.split('__GMAPS_KEY__').length, 2);
  assert.ok(html.includes('<a class="back" href="/crew/route">← Route &amp; timeline</a>'));
  assert.ok(data.days.every((d) => Array.isArray(d.line) && d.line[0].length === 2));
  assert.ok(data.points.every((p) => typeof p.day_miles === 'number' && typeof p.lat === 'number'));
  assert.equal(data.points.filter((p) => p.day === 1 && p.day_miles < 0.5).length, 2);
  ok('fits src/lib/ride-viewer.ts (the public door still drops the first half mile)');

  // 8. a point with no Street View is never given a neighbour's picture; the nearest-point helper answers
  const gap = data.points.find((p) => p.day === 2 && p.day_miles === 30.5);
  assert.equal(gap.g, 0);
  assert.equal(gap.gd, undefined);
  assert.equal(nearestPoint(data, 2, 53.4363, -1.5386).id, 'D2-0260');
  ok('an uncovered point stays uncovered; nearest-point lookup works');

  // 9. build mode: every covered point's picture fetched once, none for the gaps
  const out2 = path.join(tmp, 'built');
  state.pictures = 0;
  const b2 = await build({ ...base, images: 'build', out: out2 });
  const data2 = readData(fs.readFileSync(b2.out, 'utf8'));
  const covered = data2.points.filter((p) => p.g === 1).length;
  assert.equal(state.pictures, covered);
  assert.equal(fs.readdirSync(path.join(out2, 'img')).length, covered);
  assert.ok(data2.points.filter((p) => p.g === 0).every((p) => !p.img));
  assert.equal(check(ROOT, b2.out).ok, true);
  ok(`build mode: ${covered} pictures fetched once, none for the 8 gaps`);

  // 10. THE DEFAULT: no key, no call to Google — the page asks in the browser. Nothing of Google's is in the page.
  delete process.env.RIDE_TEST_KEY;
  const out3 = path.join(tmp, 'default');
  fs.mkdirSync(path.join(out3, 'img'), { recursive: true });
  fs.writeFileSync(path.join(out3, 'img', 'D1-0000.jpg'), 'october');
  state.asked = 0;
  state.pictures = 0;
  const b3 = await build({ ...base, coverage: 'browser', api: 'http://127.0.0.1:1/unreachable', out: out3 });
  const html3 = fs.readFileSync(b3.out, 'utf8');
  const data3 = readData(html3);
  assert.equal(state.asked + state.pictures, 0);
  assert.equal(data3.coverage, 'browser');
  assert.deepEqual([data3.points.filter((p) => p.day === 1).length, data3.points.filter((p) => p.day === 2).length], [485, 437]);
  assert.ok(data3.points.every((p) => !('g' in p) && !('img' in p)));
  assert.equal(fs.existsSync(path.join(out3, 'img')), false);
  assert.ok(html3.includes('/metadata?') && html3.includes('No Street View here') && html3.includes('Google did not send this picture'));
  assert.equal(html3.split('__GMAPS_KEY__').length, 2);
  const c3 = check(ROOT, b3.out);
  assert.deepEqual(c3.problems, []);
  assert.ok(c3.gate.every((g) => g.ok && g.checked));
  ok('default build: no key, no call to Google, 485 + 437 points, October pictures gone, reads back clean, gate passes');

  // 11. the page holds no point of the old line
  const v1 = parseGpx(fs.readFileSync(path.join(ROOT, 'content/route/v1/day2.gpx'), 'utf8'));
  const far = dayPoints(2, v1, 0).filter((p) => nearestOnLine(d2.pts, p.lat, p.lon).d > 100).length;
  assert.ok(far > 20);
  assert.ok(data.points.filter((p) => p.day === 2).every((p) => nearestOnLine(d2.pts, p.lat, p.lon).d <= 2));
  ok(`every Day 2 point is on the final line (${far} quarter-mile points of the October line lie over 100 m from it)`);

  console.log(`\n${n}/${n} ok`);
} finally {
  server.close();
  fs.rmSync(tmp, { recursive: true });
}
