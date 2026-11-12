#!/usr/bin/env node
// "Ride the route" — the generator. Builds ride/view.html (and, in build mode, ride/img/*.jpg)
// from the route files the site itself draws: content/route/day1.gpx and content/route/day2.gpx.
//
// Every picture is Google Street View, from the Google API (Gary, 12 Nov 2026: "completely rebuilt …
// just street view only images this time from the Google API"). No other picture source. A quarter-mile
// point where Google has no Street View says so; it is never filled from a neighbour or anywhere else.
//
//   node tools/ride/build.mjs                      the whole ride written to ride/ — no key, no call to Google:
//                                                  the page asks Google, in the visitor's browser and under the
//                                                  site's own key, whether each point has a picture
//   node tools/ride/build.mjs --out DIR            the same, to another folder (a preview)
//   node tools/ride/build.mjs --check              read ride/view.html back against the route files
//   node tools/ride/build.mjs --coverage build     ask Google here instead, once, with a key of our own
//                                                  (env GOOGLE_MAPS_KEY_STUDIO, --key-env NAME, --env-file PATH);
//                                                  add --images build to fetch the pictures too (see README: terms)
//
// A key, when one is used, is never written to any file or printed.
// Nothing is written to ride/ unless the line passes the gate (and, with --coverage build, every point got a
// plain answer from Google).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MI = 1609.344;
const R_EARTH = 6371000; // the same sphere and mile as src/lib/route.ts, so the totals agree with the Route page
const STEP_MI = 0.25;
const DATA_OPEN = '<script id="data" type="application/json">';

// ---------- geometry
const rad = (d) => (d * Math.PI) / 180;
export function haversineM(lat1, lon1, lat2, lon2) {
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(a));
}
export function bearing(lat1, lon1, lat2, lon2) {
  const y = Math.sin(rad(lon2 - lon1)) * Math.cos(rad(lat2));
  const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lon2 - lon1));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
/** metres from a point to the segment a–b (flat-earth, fine at these lengths) and how far along it (0..1) */
function segDist(lat, lon, a, b) {
  const kx = Math.cos(rad(lat)) * 111320, ky = 110540;
  const ax = (a.lon - lon) * kx, ay = (a.lat - lat) * ky, bx = (b.lon - lon) * kx, by = (b.lat - lat) * ky;
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L2)) : 0;
  return { d: Math.hypot(ax + t * dx, ay + t * dy), t };
}
/** nearest place on a line of {lat,lon}[, cum] to a point: metres off, and the mile if the line has cum */
export function nearestOnLine(line, lat, lon) {
  let best = { d: Infinity, i: 0, t: 0 };
  for (let i = 0; i < line.length - 1; i++) {
    const s = segDist(lat, lon, line[i], line[i + 1]);
    if (s.d < best.d) best = { d: s.d, i, t: s.t };
  }
  const a = line[best.i], b = line[best.i + 1];
  const mile = a.cum == null ? null : a.cum + best.t * (b.cum - a.cum);
  return { d: best.d, mile, lat: a.lat + best.t * (b.lat - a.lat), lon: a.lon + best.t * (b.lon - a.lon) };
}

// ---------- the route files
export function parseGpx(xml) {
  const pts = [];
  const re = /<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt>|<trkpt\b([^>]*)\/>/g;
  let m;
  while ((m = re.exec(xml))) {
    const attrs = m[1] ?? m[3];
    const lat = Number(/lat="([^"]+)"/.exec(attrs)?.[1]), lon = Number(/lon="([^"]+)"/.exec(attrs)?.[1]);
    const ele = Number(/<ele>([^<]+)<\/ele>/.exec(m[2] ?? '')?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('GPX: a track point without lat/lon');
    pts.push({ lat, lon, ele: Number.isFinite(ele) ? ele : null });
  }
  if (pts.length < 2) throw new Error('GPX: no track');
  pts[0].cum = 0;
  for (let i = 1; i < pts.length; i++) pts[i].cum = pts[i - 1].cum + haversineM(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon) / MI;
  const wpts = [];
  const rw = /<wpt\b([^>]*)>([\s\S]*?)<\/wpt>/g;
  const unx = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  while ((m = rw.exec(xml))) {
    wpts.push({
      lat: Number(/lat="([^"]+)"/.exec(m[1])?.[1]), lon: Number(/lon="([^"]+)"/.exec(m[1])?.[1]),
      name: unx(/<name>([\s\S]*?)<\/name>/.exec(m[2])?.[1] ?? '').trim(), desc: unx(/<desc>([\s\S]*?)<\/desc>/.exec(m[2])?.[1] ?? '').trim(),
    });
  }
  const name = unx(/<trk>\s*<name>([\s\S]*?)<\/name>/.exec(xml)?.[1] ?? '').trim();
  return { pts, wpts, name, miles: pts[pts.length - 1].cum };
}
/** the place `mile` miles along the track */
export function at(pts, mile) {
  let lo = 0, hi = pts.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pts[mid].cum <= mile) lo = mid; else hi = mid; }
  const a = pts[lo], b = pts[hi], span = b.cum - a.cum, t = span > 0 ? Math.max(0, Math.min(1, (mile - a.cum) / span)) : 0;
  const ele = a.ele == null || b.ele == null ? (a.ele ?? b.ele) : a.ele + t * (b.ele - a.ele);
  return { lat: a.lat + t * (b.lat - a.lat), lon: a.lon + t * (b.lon - a.lon), ele };
}
/** Douglas–Peucker, tolerance in metres: the map's line, never further than that from the route file */
export function simplify(pts, tolM) {
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let worst = 0, wi = -1;
    for (let i = a + 1; i < b; i++) { const d = segDist(pts[i].lat, pts[i].lon, pts[a], pts[b]).d; if (d > worst) { worst = d; wi = i; } }
    if (worst > tolM) { keep[wi] = 1; stack.push([a, wi], [wi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/** One day's quarter-mile points. The camera looks along the road ahead (the last point looks the way it came in). */
export function dayPoints(day, track, totalBefore) {
  const n = Math.floor(track.miles / STEP_MI + 1e-9) + 1, out = [];
  for (let k = 0; k < n; k++) {
    const mile = k * STEP_MI, p = at(track.pts, mile);
    const AHEAD = 0.025; // 40 m: far enough to look down the road, short enough to turn with it
    const a = mile + AHEAD <= track.miles ? p : at(track.pts, Math.max(0, mile - AHEAD));
    const b = mile + AHEAD <= track.miles ? at(track.pts, mile + AHEAD) : p;
    out.push({
      id: `D${day}-${String(k).padStart(4, '0')}`, day, idx: k, day_miles: mile, total_miles: Math.round((totalBefore + mile) * 100) / 100,
      lat: Math.round(p.lat * 1e6) / 1e6, lon: Math.round(p.lon * 1e6) / 1e6,
      heading: Math.round(bearing(a.lat, a.lon, b.lat, b.lon) * 10) / 10, ele: Math.round(p.ele ?? 0),
    });
  }
  return out;
}

/** The viewer's stops: every waypoint inside the route files (the rendezvous, the hotel — as in October),
 *  name and words exactly as the file has them, placed by mile on this line.
 *  The crew's pinned stops live in the site's database and most are hidden from the public — not used here. */
export function stopsOf(day, track) {
  return track.wpts.filter((w) => w.name && Number.isFinite(w.lat) && Number.isFinite(w.lon)).map((w) => {
    const n = nearestOnLine(track.pts, w.lat, w.lon);
    return { day, name: w.name, desc: w.desc, miles: Math.round(n.mile * 100) / 100, off_m: Math.round(n.d) };
  }).sort((a, b) => a.miles - b.miles);
}

// ---------- the places the line must pass (Fiona's gate, 12 Nov 2026) — checked on the map line the page draws.
// "pass" points are on the road named: Fiona's own coordinates, or the road's geometry in OpenStreetMap (read 12 Nov 2026).
// "avoid" points are where the OLD line went (the furthest point of content/route/v1 or v2.0 from the final line).
export const GATE = [
  { day: 1, name: 'St Albans: on the road (A4147 Bluehouse Hill), not through Gorhambury',
    pass: [[51.750296, -0.360398], [51.755329, -0.354810]], avoid: [[51.758446, -0.391454]], avoidM: 300 },
  { day: 2, name: 'Shepshed: straight past Brookside Close, no out-and-back up it',
    avoid: [[52.765484, -1.290074], [52.765420, -1.289845]], avoidM: 60 },
  { day: 2, name: 'Oughtibridge: up Bridge Hill', pass: [[53.4363, -1.5386], [53.4360, -1.5396]] },
  { day: 2, name: 'Wharncliffe Side: the A6102 valley road, not Wharncliffe Woods',
    pass: [[53.449707, -1.552446], [53.454765, -1.554710], [53.460111, -1.554427]], avoid: [[53.46398, -1.54817]], avoidM: 200 },
  { day: 2, name: 'Silkstone: the B6449, the Pinfold Lane bend', pass: [[53.5259, -1.5624]], avoid: [[53.52858, -1.57552]], avoidM: 200 },
  { day: 2, name: 'Woodlesford: the estate road (The Locks), by the gate', pass: [[53.7602, -1.4447]] },
];
export function gateCheck(lines, gate = GATE, passM = 30) {
  return gate.map((g) => {
    const line = lines[g.day];
    const pass = (g.pass ?? []).map(([la, lo]) => ({ at: [la, lo], off_m: Math.round(nearestOnLine(line, la, lo).d) }));
    const avoid = (g.avoid ?? []).map(([la, lo]) => ({ at: [la, lo], off_m: Math.round(nearestOnLine(line, la, lo).d) }));
    const ok = pass.every((p) => p.off_m <= passM) && avoid.every((a) => a.off_m >= (g.avoidM ?? 100));
    return { day: g.day, name: g.name, ok, pass, avoid, checked: pass.length + avoid.length > 0 };
  });
}

// ---------- Google
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function readKey(opts) {
  const name = opts.keyEnv;
  if (process.env[name]) return process.env[name].trim();
  if (opts.envFile && fs.existsSync(opts.envFile)) {
    const line = fs.readFileSync(opts.envFile, 'utf8').split(/\r?\n/).find((l) => l.startsWith(name + '='));
    if (line) return line.slice(name.length + 1).trim().replace(/^["']|["']$/g, '');
  }
  return '';
}
const redact = (s, key) => (key ? String(s).split(key).join('<key>') : String(s));

/** Ask Google whether there is a Street View picture within `radius` metres of a point. Free of charge. */
export async function coverage(p, { api, key, radius, fetchImpl = fetch, tries = 5 }) {
  const u = `${api}/streetview/metadata?location=${p.lat},${p.lon}&radius=${radius}&source=outdoor&key=${encodeURIComponent(key)}`;
  let last = '';
  for (let t = 0; t < tries; t++) {
    let j;
    try {
      const r = await fetchImpl(u);
      j = await r.json();
    } catch (e) { last = 'network: ' + redact(e.message, key); await sleep(400 * 2 ** t); continue; }
    if (j.status === 'OK') {
      const off = j.location ? Math.round(haversineM(p.lat, p.lon, j.location.lat, j.location.lng)) : null;
      return { g: 1, gd: typeof j.date === 'string' ? j.date : '', go: off };
    }
    if (j.status === 'ZERO_RESULTS' || j.status === 'NOT_FOUND') return { g: 0 };
    last = `${j.status}${j.error_message ? ': ' + redact(j.error_message, key) : ''}`;
    if (j.status === 'OVER_QUERY_LIMIT' || j.status === 'UNKNOWN_ERROR') { await sleep(600 * 2 ** t); continue; }
    break; // REQUEST_DENIED, INVALID_REQUEST: asking again will not help
  }
  const err = new Error(`Google gave no plain answer for ${p.id}: ${last}`);
  err.google = last;
  throw err;
}
async function fetchPicture(p, file, { api, key, radius, fetchImpl = fetch }) {
  const u = `${api}/streetview?size=640x480&location=${p.lat},${p.lon}&heading=${Math.round(p.heading)}&fov=90&pitch=0&radius=${radius}&source=outdoor&return_error_code=true&key=${encodeURIComponent(key)}`;
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetchImpl(u);
      if (r.ok && /^image\/jpeg/.test(r.headers.get('content-type') ?? '')) { fs.writeFileSync(file, Buffer.from(await r.arrayBuffer())); return; }
      if (r.status === 404) throw Object.assign(new Error(`no picture for ${p.id} though Google said there was one`), { fatal: true });
      if (r.status === 403) throw Object.assign(new Error(`Google refused the picture for ${p.id} (403: key, billing or allowance)`), { fatal: true });
    } catch (e) { if (e.fatal) throw e; }
    await sleep(500 * 2 ** t);
  }
  throw new Error(`picture for ${p.id} did not arrive`);
}
async function pool(items, n, fn) {
  let i = 0, failed = null;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length && !failed) { const it = items[i++]; try { await fn(it); } catch (e) { failed = failed ?? e; } }
  }));
  if (failed) throw failed;
}

// ---------- the report
export function report(data) {
  const days = data.days.map((d) => {
    const pts = data.points.filter((p) => p.day === d.day);
    const gaps = []; let run = null;
    for (const p of pts) {
      if (p.g === 0) { if (!run) run = { from: p.day_miles, to: p.day_miles, n: 0 }; run.to = p.day_miles; run.n++; } else if (run) { gaps.push(run); run = null; }
    }
    if (run) gaps.push(run);
    gaps.sort((a, b) => b.n - a.n || a.from - b.from);
    return {
      day: d.day, version: d.version, miles: d.miles, points: pts.length, spacing_miles: STEP_MI,
      street_view: pts.filter((p) => p.g === 1).length, no_street_view: pts.filter((p) => p.g === 0).length,
      not_checked: pts.filter((p) => p.g == null).length,
      longest_uncovered: gaps.slice(0, 8).map((g) => `mile ${g.from.toFixed(2)}–${g.to.toFixed(2)} (${g.n} point${g.n > 1 ? 's' : ''})`),
      no_street_view_points: pts.filter((p) => p.g === 0).map((p) => `${p.id} mile ${p.day_miles.toFixed(2)} (${p.lat}, ${p.lon})`),
      line_points: d.line.length,
    };
  });
  return { mode: data.mode, built: data.built, line_id: data.line_id, total_miles: Math.round(data.days.reduce((a, d) => a + d.miles, 0) * 10) / 10, days, stops: data.stops };
}
/** the quarter-mile point nearest a place, for checking by hand */
export function nearestPoint(data, day, lat, lon) {
  let best = null;
  for (const p of data.points) if (p.day === day) { const d = haversineM(lat, lon, p.lat, p.lon); if (!best || d < best.d) best = { d, p }; }
  return { id: best.p.id, mile: best.p.day_miles, lat: best.p.lat, lon: best.p.lon, heading: best.p.heading, street_view: best.p.g, taken: best.p.gd ?? '', metres_from_place: Math.round(best.d) };
}

// ---------- build
export function readData(html) {
  const s = html.indexOf(DATA_OPEN), e = html.indexOf('</script>', s);
  if (s < 0 || e < 0) throw new Error('view.html: data block not found');
  return JSON.parse(html.slice(s + DATA_OPEN.length, e));
}
export function versionOf(track, fallback) { return /\bV\s?(\d+(?:\.\d+)*)\s*$/i.exec(track.name)?.[0].replace(/\s/g, '').toUpperCase() ?? fallback; }

export async function build(opts) {
  const root = opts.root;
  const files = { 1: path.join(root, 'content/route/day1.gpx'), 2: path.join(root, 'content/route/day2.gpx') };
  const tracks = { 1: parseGpx(fs.readFileSync(files[1], 'utf8')), 2: parseGpx(fs.readFileSync(files[2], 'utf8')) };
  const versions = { 1: opts.versions?.[1] ?? versionOf(tracks[1], ''), 2: opts.versions?.[2] ?? versionOf(tracks[2], '') };
  const points = [...dayPoints(1, tracks[1], 0), ...dayPoints(2, tracks[2], Math.round(tracks[1].miles * 100) / 100)];
  const lines = { 1: simplify(tracks[1].pts, opts.tolerance), 2: simplify(tracks[2].pts, opts.tolerance) };
  const r5 = (v) => Math.round(v * 1e5) / 1e5;
  const crypto = await import('node:crypto');
  const md5 = (f) => crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex');
  const data = {
    mode: opts.images, coverage: opts.coverage, radius: opts.radius, built: new Date().toISOString().slice(0, 10),
    line_id: `${md5(files[1]).slice(0, 8)}-${md5(files[2]).slice(0, 8)}`,
    days: [1, 2].map((d) => ({ day: d, version: versions[d], miles: Math.round(tracks[d].miles * 100) / 100, line: lines[d].map((p) => [r5(p.lat), r5(p.lon)]) })),
    stops: [...stopsOf(1, tracks[1]), ...stopsOf(2, tracks[2])],
    points,
  };

  // the gate is read on the line the page will draw, not on the file it came from
  const drawn = { 1: data.days[0].line.map(([lat, lon]) => ({ lat, lon })), 2: data.days[1].line.map(([lat, lon]) => ({ lat, lon })) };
  const gate = gateCheck(drawn, opts.gate ?? GATE);
  const gateFailed = gate.filter((g) => g.checked && !g.ok);

  const outDir = opts.out ?? path.join(root, 'ride');
  const isRepoRide = path.resolve(outDir) === path.resolve(root, 'ride');
  if (opts.images === 'build' && opts.coverage !== 'build') throw new Error('--images build needs --coverage build (a picture is only fetched where Google says there is one)');
  if (gateFailed.length) throw new Error('the line fails the gate — nothing written: ' + gateFailed.map((x) => x.name).join('; '));
  if (opts.coverage !== 'build') {
    // The default. No call to Google from here and no key: the page itself asks Google, in the visitor's browser,
    // under the site's own key, whether each point has a picture. No picture is kept in the repo, old or new.
    fs.rmSync(path.join(outDir, 'img'), { recursive: true, force: true });
  } else {
    const key = readKey(opts);
    if (!key) throw new Error(`no Google key: set ${opts.keyEnv} (nothing written)`);
    const g = { api: opts.api, key, radius: opts.radius, fetchImpl: opts.fetchImpl, tries: opts.tries ?? 5 };
    let done = 0;
    await pool(points, opts.concurrency, async (p) => {
      Object.assign(p, await coverage(p, g));
      if (++done % 100 === 0 && !opts.quiet) console.error(`  asked Google about ${done} of ${points.length} points`);
    });
    if (opts.images === 'build') {
      const tmp = fs.mkdtempSync(path.join(path.dirname(outDir), '.ride-img-'));
      try {
        const want = points.filter((p) => p.g === 1);
        await pool(want, Math.min(opts.concurrency, 6), async (p) => { await fetchPicture(p, path.join(tmp, `${p.id}.jpg`), g); p.img = `img/${p.id}.jpg`; });
        // all of them arrived: only now does the old folder go
        fs.rmSync(path.join(outDir, 'img'), { recursive: true, force: true });
        fs.mkdirSync(outDir, { recursive: true });
        fs.renameSync(tmp, path.join(outDir, 'img'));
      } catch (e) { fs.rmSync(tmp, { recursive: true, force: true }); throw e; }
    } else {
      // the browser asks Google for each picture: no picture is kept in the repo, old or new
      fs.rmSync(path.join(outDir, 'img'), { recursive: true, force: true });
    }
  }
  const tpl = fs.readFileSync(path.join(HERE, 'view.template.html'), 'utf8');
  if (tpl.split('__DATA__').length !== 2) throw new Error('template: one __DATA__ slot expected');
  const html = tpl.replace('__DATA__', () => JSON.stringify(data).replace(/<\//g, '<\\/'));
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'view.html'), html);
  return { data, gate, out: path.join(outDir, 'view.html'), bytes: html.length };
}

/** Read a built page back against the route files: the same line, the same points, the totals, the gate. */
export function check(root, file = path.join(root, 'ride/view.html')) {
  const html = fs.readFileSync(file, 'utf8');
  const data = readData(html);
  const problems = [];
  const lines = {};
  for (const d of [1, 2]) {
    const track = parseGpx(fs.readFileSync(path.join(root, `content/route/day${d}.gpx`), 'utf8'));
    const day = data.days.find((x) => x.day === d);
    if (Math.abs(day.miles - track.miles) > 0.011) problems.push(`day ${d}: the page says ${day.miles} miles, the route file is ${track.miles.toFixed(2)}`);
    const want = dayPoints(d, track, 0), got = data.points.filter((p) => p.day === d);
    if (want.length !== got.length) problems.push(`day ${d}: ${got.length} points, the route file gives ${want.length}`);
    let worst = 0;
    for (const p of got) worst = Math.max(worst, nearestOnLine(track.pts, p.lat, p.lon).d);
    if (worst > 2) problems.push(`day ${d}: a point is ${worst.toFixed(1)} m off the route file`);
    lines[d] = day.line.map(([lat, lon]) => ({ lat, lon }));
    let lineWorst = 0;
    for (const q of lines[d]) lineWorst = Math.max(lineWorst, nearestOnLine(track.pts, q.lat, q.lon).d);
    if (lineWorst > 2) problems.push(`day ${d}: the drawn line is ${lineWorst.toFixed(1)} m off the route file`);
    if (data.coverage === 'build' && got.some((p) => p.g !== 0 && p.g !== 1)) problems.push(`day ${d}: points Google was never asked about`);
    if (data.coverage !== 'build' && got.some((p) => 'g' in p || 'img' in p)) problems.push(`day ${d}: the page is set to ask Google in the browser but carries build-time answers`);
    if (got.some((p) => p.g === 0 && p.img)) problems.push(`day ${d}: a point with no Street View carries a picture`);
  }
  for (const bad of ['Mapillary', 'mapillary', 'OLD ROUTE', '231.9']) if (html.includes(bad)) problems.push(`the page still says "${bad}"`);
  if (/AIza[\w-]{30,}/.test(html)) problems.push('a Google key is written into the page');
  const gate = gateCheck(lines);
  for (const g of gate) if (g.checked && !g.ok) problems.push('gate: ' + g.name);
  return { ok: problems.length === 0, problems, gate, report: report(data), data };
}

// ---------- command line
function args(argv) {
  const o = { images: 'browser', coverage: 'browser', keyEnv: 'GOOGLE_MAPS_KEY_STUDIO', api: 'https://maps.googleapis.com/maps/api', radius: 25, tolerance: 4, concurrency: 8, root: path.resolve(HERE, '../..') };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = () => { if (argv[i + 1] == null) throw new Error(`${a} needs a value`); return argv[++i]; };
    if (a === '--images') { o.images = v(); if (!['browser', 'build'].includes(o.images)) throw new Error('--images browser|build'); }
    else if (a === '--key-env') o.keyEnv = v();
    else if (a === '--env-file') o.envFile = v();
    else if (a === '--api') o.api = v().replace(/\/$/, '');
    else if (a === '--radius') o.radius = Number(v());
    else if (a === '--root') o.root = path.resolve(v());
    else if (a === '--out') o.out = path.resolve(v());
    else if (a === '--coverage') { o.coverage = v(); if (!['browser', 'build'].includes(o.coverage)) throw new Error('--coverage browser|build'); }
    else if (a === '--check') o.check = true;
    else if (a === '--near') { const [d, la, lo] = v().split(',').map(Number); (o.near ??= []).push([d, la, lo]); }
    else throw new Error('unknown option ' + a);
  }
  return o;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const o = args(process.argv.slice(2));
    if (o.check) {
      const c = check(o.root, o.out ? path.join(o.out, 'view.html') : undefined);
      const near = (o.near ?? []).map(([d, la, lo]) => ({ place: [la, lo], day: d, ...nearestPoint(c.data, d, la, lo) }));
      console.log(JSON.stringify({ ok: c.ok, problems: c.problems, gate: c.gate, report: c.report, near }, null, 1));
      process.exit(c.ok ? 0 : 1);
    }
    const b = await build(o);
    const near = (o.near ?? []).map(([d, la, lo]) => ({ place: [la, lo], day: d, ...nearestPoint(b.data, d, la, lo) }));
    console.log(JSON.stringify({ written: b.out, bytes: b.bytes, gate: b.gate, report: report(b.data), near }, null, 1));
  } catch (e) {
    console.error('ride build: ' + e.message);
    process.exit(1);
  }
}
