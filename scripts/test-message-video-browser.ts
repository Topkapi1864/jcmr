// Videos on the message board in a real browser, with real videos: the BUILT
// site, a scratch database, clips made here with ffmpeg in the shapes phones
// hand over (an Android 1080p MP4, an iPhone portrait .mov, HEVC, WebM, one
// with no sound, a long one, one too long, and a file that is no video).
// A phone-sized crew browser picks, shrinks, sends, posts, edits and removes;
// a signed-out browser watches on the public board.
//
// Needs, besides the repo's own packages: ffmpeg and ffprobe on the PATH, Chrome,
// and Playwright somewhere it can be imported from (it is not a dependency of
// the site). Start the built site as for the other front-door tests, then:
//   export DATABASE_URL=file:/tmp/jcmr-video-test/test.db SESSION_SECRET=test-only-secret-0123456789abcdef
//   npx next start -p 3987 &
//   JCMR_TEST_URL=http://localhost:3987 JCMR_PLAYWRIGHT=/path/to/node_modules/playwright/index.mjs \
//     JCMR_CHROME=/usr/bin/google-chrome npx tsx scripts/test-message-video-browser.ts
// JCMR_SHOTS=<folder> keeps a screenshot of each stage. It refuses to run against
// anything but localhost, and leaves the scratch site dark when it is done.
//
// What a phone's own hardware does cannot be tested here: this proves the pages,
// the shrinking in Chrome, the upload, the board and the player end to end.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const B = (process.env.JCMR_TEST_URL ?? "").replace(/\/$/, "");
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(B)) throw new Error("set JCMR_TEST_URL to the local test site, e.g. http://localhost:3987");
if (!/^file:/.test(process.env.DATABASE_URL ?? "")) throw new Error("set DATABASE_URL to the scratch file: database the test site uses");
if (!process.env.SESSION_SECRET) throw new Error("set SESSION_SECRET to the one the test site uses");

type Page = any; // eslint-disable-line @typescript-eslint/no-explicit-any -- a Playwright page (see the import below)

let n = 0;
const ok = (name: string) => console.log(`ok ${++n} - ${name}`);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jcmr-video-browser-"));
const shots = process.env.JCMR_SHOTS;
if (shots) fs.mkdirSync(shots, { recursive: true });

// ---- the clips ----
const ff = (...args: string[]) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: ["ignore", "ignore", "inherit"] });
const src = (size: string, rate: number) => ["-f", "lavfi", "-i", `testsrc2=size=${size}:rate=${rate}`];
const tone = (hz: number, sr = 48000) => ["-f", "lavfi", "-i", `sine=frequency=${hz}:sample_rate=${sr}`];
const clip = (name: string) => path.join(tmp, name);
function makeClips() {
  // An Android phone: 1080p H.264 at 12 Mbit/s, AAC, the index at the end of the file.
  ff(...src("1920x1080", 30), ...tone(440), "-t", "12", "-c:v", "libx264", "-preset", "veryfast", "-profile:v", "high", "-b:v", "12M", "-maxrate", "14M", "-bufsize", "24M", "-pix_fmt", "yuv420p", "-g", "30", "-c:a", "aac", "-b:a", "192k", "-ac", "2", clip("android.mp4"));
  // An iPhone, as Safari hands a library video over: 720p H.264 .mov, filmed upright (stored sideways with a rotation flag).
  ff(...src("1280x720", 30), ...tone(660, 44100), "-t", "10", "-c:v", "libx264", "-preset", "veryfast", "-b:v", "2800k", "-pix_fmt", "yuv420p", "-g", "30", "-c:a", "aac", "-b:a", "128k", "-ac", "1", "-f", "mov", clip("iphone-flat.mov"));
  ff("-display_rotation", "90", "-i", clip("iphone-flat.mov"), "-c", "copy", "-f", "mov", clip("iphone.mov"));
  // A phone's upright 1080p original: stored sideways with a rotation flag, far too big to post as it is.
  ff(...src("1920x1080", 30), ...tone(880), "-t", "6", "-c:v", "libx264", "-preset", "veryfast", "-b:v", "10M", "-pix_fmt", "yuv420p", "-g", "30", "-c:a", "aac", "-b:a", "128k", "-f", "mov", clip("upright-flat.mov"));
  ff("-display_rotation", "90", "-i", clip("upright-flat.mov"), "-c", "copy", "-f", "mov", clip("upright.mov"));
  // An iPhone's original: HEVC at 60 frames a second.
  ff(...src("1920x1080", 60), ...tone(550), "-t", "6", "-c:v", "libx265", "-preset", "ultrafast", "-b:v", "9M", "-pix_fmt", "yuv420p", "-tag:v", "hvc1", "-x265-params", "log-level=error", "-c:a", "aac", "-b:a", "160k", "-f", "mov", clip("hevc.mov"));
  // A screen recording: WebM, VP9 and Opus.
  ff(...src("1280x720", 30), ...tone(330), "-t", "6", "-c:v", "libvpx-vp9", "-b:v", "1500k", "-deadline", "realtime", "-cpu-used", "8", "-c:a", "libopus", "-b:a", "96k", clip("screen.webm"));
  // No sound at all.
  ff(...src("640x360", 30), "-t", "5", "-c:v", "libx264", "-preset", "veryfast", "-b:v", "600k", "-pix_fmt", "yuv420p", "-an", clip("silent.mp4"));
  // Three minutes ten: too big to post as it is, and long enough to need a smaller frame.
  ff(...src("1280x720", 30), ...tone(220), "-t", "190", "-c:v", "libx264", "-preset", "ultrafast", "-b:v", "4M", "-pix_fmt", "yuv420p", "-g", "60", "-c:a", "aac", "-b:a", "128k", clip("long.mp4"));
  // Over the five minutes.
  ff(...src("160x120", 5), "-t", "310", "-c:v", "libx264", "-preset", "ultrafast", "-b:v", "40k", "-pix_fmt", "yuv420p", "-an", clip("toolong.mp4"));
  fs.writeFileSync(clip("notes.mp4"), "These are my notes about the ride, saved with the wrong ending.\n".repeat(200));
}
type Probe = { video: { codec: string; width: number; height: number; rotation: number; bitrate: number; fps: number } | null; audio: { codec: string } | null; seconds: number; bytes: number };
function probe(file: string): Probe {
  const j = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_format", "-show_streams", "-of", "json", file], { encoding: "utf8" })) as { streams: Record<string, unknown>[]; format: Record<string, string> };
  const v = j.streams.find((s) => s.codec_type === "video") as Record<string, unknown> | undefined;
  const a = j.streams.find((s) => s.codec_type === "audio") as Record<string, unknown> | undefined;
  const rot = ((v?.side_data_list as { rotation?: number }[] | undefined) ?? []).find((s) => s.rotation !== undefined)?.rotation ?? 0;
  const [fn, fd] = String(v?.avg_frame_rate ?? "0/1").split("/").map(Number);
  return { video: v ? { codec: String(v.codec_name), width: Number(v.width), height: Number(v.height), rotation: Math.abs(rot), bitrate: Number(v.bit_rate ?? 0), fps: fd ? fn / fd : 0 } : null, audio: a ? { codec: String(a.codec_name) } : null, seconds: Number(j.format.duration), bytes: Number(j.format.size) };
}
/** The top-level boxes of an MP4, in order: "moov" before "mdat" is a file that can start playing at once. */
function boxes(file: string): string[] {
  const b = fs.readFileSync(file);
  const out: string[] = [];
  for (let at = 0; at + 8 <= b.length; ) {
    let size = b.readUInt32BE(at);
    out.push(b.toString("latin1", at + 4, at + 8));
    if (size === 1) size = Number(b.readBigUInt64BE(at + 8));
    if (size < 8) break;
    at += size;
  }
  return out;
}

async function main() {
  makeClips();
  const { client, ready } = await import("../src/db/client");
  const { signSession } = await import("../src/lib/session");
  const { VIDEO_MAX_BYTES: MAX, VIDEO_PART_BYTES: PART } = await import("../src/lib/video-rules");
  // Playwright is not one of the site's packages, so it is loaded from wherever it lives and left untyped.
  const { chromium } = (await import(process.env.JCMR_PLAYWRIGHT ?? "playwright")) as { chromium: { launch(options: object): Promise<any> } }; // eslint-disable-line @typescript-eslint/no-explicit-any
  await ready();
  await client.execute("INSERT OR IGNORE INTO people (id, name, short_name, role) VALUES (9001, 'Test Admin', 'TAdmin', 'admin'), (9002, 'Test Crew', 'TCrew', 'crew')");
  const setLive = (on: boolean) => client.execute({ sql: "INSERT INTO settings (key, value) VALUES ('site.public_live', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", args: [String(on)] });
  await setLive(true);
  const session = await signSession({ pid: 9002, name: "TCrew", role: "crew", exp: Math.floor(Date.now() / 1000) + 3600 });
  const unpostedNow = async () => Number((await client.execute("SELECT count(*) AS n FROM message_videos WHERE message_id IS NULL AND deleted = 0")).rows[0].n);
  const unpostedBefore = await unpostedNow();
  const unposted = async () => (await unpostedNow()) - unpostedBefore;
  const TAG = `vt${Date.now().toString(36)}`;

  // Sound may only start after a tap, as on a phone.
  const browser = await chromium.launch({ executablePath: process.env.JCMR_CHROME || undefined, args: ["--autoplay-policy=document-user-activation-required"] });
  const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
  const crewCtx = await browser.newContext(phone);
  await crewCtx.addCookies([{ name: "jcmr_session", value: session, url: B }]);
  const crew = await crewCtx.newPage();
  const pubCtx = await browser.newContext(phone);
  const pub = await pubCtx.newPage();
  const problems: string[] = [];
  for (const [who, p] of [["crew", crew], ["public", pub]] as const) {
    p.on("pageerror", (e: unknown) => problems.push(`${who}: ${String(e).slice(0, 300)}`));
    p.on("console", (m: { type(): string; text(): string }) => {
      // A clip this browser cannot play or decode is one of the cases; its own complaint about that is not a fault of the page.
      if (m.type() === "error" && !/Failed to load resource|404|DEMUXER_ERROR|PIPELINE_ERROR|MEDIA_ERR/i.test(m.text())) problems.push(`${who} console: ${m.text().slice(0, 300)}`);
    });
  }
  const shot = async (p: Page, name: string) => {
    if (shots) await p.screenshot({ path: path.join(shots, `${name}.png`) });
  };

  const PICKER = 'input[type=file][accept="video/*"]';
  const POST = "form button[type=submit].btn-primary";
  const key = (p: Page) => p.inputValue('input[name="video"]');
  /** Picks a clip and waits until it is ready to post; gives back the line under the preview and the key. */
  async function pick(p: Page, file: string, wait = 240_000) {
    await p.setInputFiles(PICKER, clip(file));
    await p.waitForSelector(".message-video-preview", { timeout: wait });
    return { line: (await p.textContent("p.xs.muted:has-text('Ready to post')"))!.trim(), key: await key(p) };
  }
  /** Fetches a posted video's pieces the way the page does and writes them out as one file. */
  async function fetchWhole(k: string, name: string) {
    const v = (await client.execute({ sql: "SELECT parts, bytes FROM message_videos WHERE key = ?", args: [k] })).rows[0];
    const bufs: Buffer[] = [];
    for (let i = 0; i < Number(v.parts); i++) {
      const r = await fetch(`${B}/api/messages/video/${k}/${i}`);
      assert.equal(r.status, 200, `piece ${i} of ${name}`);
      bufs.push(Buffer.from(await r.arrayBuffer()));
    }
    const whole = Buffer.concat(bufs);
    assert.equal(whole.length, Number(v.bytes));
    const file = path.join(tmp, name);
    fs.writeFileSync(file, whole);
    return file;
  }
  /** Posts what is in the form and waits for it to be on the list below, with the pickers clear again for the next one. */
  const posted = async (p: Page) => {
    const before = await p.locator("li.message-row").count();
    await p.click(POST);
    await p.waitForFunction((was: number) => document.querySelectorAll("li.message-row").length === was + 1 && document.querySelector<HTMLInputElement>('input[name="video"]')?.value === "", before, { timeout: 30_000 });
    assert.match(p.url(), /posted=1/);
    assert.equal(await p.locator(".message-video-preview").count(), 0, "the picker is clear again once the message has gone up");
  };
  /** On the public board: taps the still of the video at this address and waits for it to play. */
  async function play(p: Page, k: string) {
    const box = p.locator(`.message-video:has(img[src*="${k}"])`);
    await box.scrollIntoViewIfNeeded();
    await box.locator(".message-video-still").tap();
    await p.waitForSelector(`.message-video[data-at="playing"]`, { timeout: 120_000 });
    await p.waitForFunction(() => {
      const v = document.querySelector<HTMLVideoElement>('.message-video[data-at="playing"] video');
      return !!v && v.currentTime > 0.4;
    });
    return p.evaluate(() => {
      const v = document.querySelector<HTMLVideoElement>('.message-video[data-at="playing"] video')!;
      return { paused: v.paused, muted: v.muted, width: v.videoWidth, height: v.videoHeight, seconds: v.duration, controls: v.controls, inline: v.playsInline, blob: v.currentSrc.startsWith("blob:") };
    });
  }

  // ---- 1. a phone's 1080p video is made smaller on the way up ----
  const scriptsBefore = new Set<string>();
  const scriptsAfter = new Set<string>();
  let picked = false;
  type Req = { url(): string; method(): string; resourceType(): string };
  crew.on("request", (r: Req) => {
    if (r.resourceType() === "script") (picked ? scriptsAfter : scriptsBefore).add(new URL(r.url()).pathname);
  });
  const sent: string[] = [];
  crew.on("request", (r: Req) => {
    if (r.method() !== "GET" && r.url().includes("/api/messages/video")) sent.push(`${r.method()} ${new URL(r.url()).pathname.replace(/[0-9a-f]{32}/, "KEY")}`);
  });
  // A poor signal: the first try at sending the second piece is cut off, as if the connection dropped.
  let cutOff = 0;
  await crewCtx.route(/\/api\/messages\/video\/[0-9a-f]{32}\/1$/, (route: { request(): Req; abort(reason: string): Promise<void>; continue(): Promise<void> }) => (route.request().method() === "PUT" && cutOff++ === 0 ? route.abort("connectionreset") : route.continue()));
  await crew.goto(`${B}/crew/messages`);
  await crew.waitForLoadState("networkidle");
  assert.equal(await crew.textContent(POST), "Post as TCrew");
  picked = true;
  await crew.setInputFiles(PICKER, clip("android.mp4"));
  await crew.waitForSelector(".video-working");
  assert.equal(await crew.isDisabled(POST), true, "the Post button waits while a video is being made ready");
  assert.equal((await crew.textContent(POST))!.trim(), "Waiting for the video…");
  assert.ok(await crew.isVisible(".video-working button:has-text('Cancel')"));
  await shot(crew, "1-working");
  await crew.waitForSelector(".message-video-preview", { timeout: 240_000 });
  const first = { line: (await crew.textContent("p.xs.muted:has-text('Ready to post')"))!.trim(), key: await key(crew) };
  assert.match(first.line, /^0:12 · \d(\.\d)? MB \(17 MB before it was made smaller\)\. Ready to post\.$/, first.line);
  assert.match(first.key, /^[0-9a-f]{32}$/);
  assert.equal(await crew.isDisabled(POST), false);
  assert.deepEqual([sent[0], sent[sent.length - 1]], ["POST /api/messages/video", "POST /api/messages/video/KEY"], "start, the pieces, finish");
  assert.ok(sent.slice(1, -1).every((s) => /^PUT \/api\/messages\/video\/KEY\/\d$/.test(s)) && sent.length >= 5, sent.join(" | "));
  assert.equal(sent.filter((s) => s === "PUT /api/messages/video/KEY/1").length, 2, "the piece that was cut off was sent again, and only that one");
  assert.equal(new Set(sent).size, sent.length - 1, "every other piece was sent once");
  await crewCtx.unroute(/\/api\/messages\/video\/[0-9a-f]{32}\/1$/);
  const previewOk = await crew.evaluate(async () => {
    const v = document.querySelector<HTMLVideoElement>(".message-video-preview")!;
    if (v.readyState < 1) await new Promise((r) => v.addEventListener("loadedmetadata", r, { once: true }));
    return { w: v.videoWidth, h: v.videoHeight, d: Math.round(v.duration) };
  });
  assert.deepEqual(previewOk, { w: 1280, h: 720, d: 12 }, "the preview is the shrunk video itself");
  await shot(crew, "2-ready");
  await crew.fill('textarea[name="body"]', `${TAG} rolling into Yeadon`);
  await posted(crew);
  assert.ok(await crew.isVisible(`li.message-row:has-text("${TAG} rolling into Yeadon") .message-video`), "the crew list shows the message with its video");
  const f1 = await fetchWhole(first.key, "posted-android.mp4");
  const p1 = probe(f1);
  assert.ok(p1.video?.codec === "h264" && p1.video.width === 1280 && p1.video.height === 720 && p1.audio?.codec === "aac", JSON.stringify(p1));
  assert.ok(Math.abs(p1.seconds - 12) < 0.3 && p1.bytes < 5_000_000 && p1.bytes > 1_000_000, `12 s at ${p1.bytes} bytes`);
  assert.ok(boxes(f1).indexOf("moov") < boxes(f1).indexOf("mdat"), "its index comes first, so it starts playing at once");
  ok("a 17 MB 1080p phone video is shrunk in the browser to a 720p MP4 a fifth the size, sent in pieces (one of them twice, after a dropped connection), and posted");

  // ---- 2. the public board: a still until it is tapped, then it plays, with its sound ----
  const fetched: string[] = [];
  const pubScripts = new Set<string>();
  pub.on("request", (r: Req) => {
    if (/\/api\/messages\/video\/[0-9a-f]{32}\/\d+$/.test(r.url())) fetched.push(r.url());
    if (r.resourceType() === "script") pubScripts.add(new URL(r.url()).pathname);
  });
  // And for the watcher: the site stumbles once on the third piece.
  let stumbled = 0;
  await pubCtx.route(/\/api\/messages\/video\/[0-9a-f]{32}\/2$/, (route: { fulfill(r: object): Promise<void>; continue(): Promise<void> }) => (stumbled++ === 0 ? route.fulfill({ status: 503, body: "busy" }) : route.continue()));
  await pub.goto(`${B}/#messages`);
  await pub.waitForSelector(`.message-video img[src*="${first.key}"]`);
  await pub.locator(".messages-panel").scrollIntoViewIfNeeded();
  await pub.waitForFunction((k: string) => (document.querySelector<HTMLImageElement>(`.message-video img[src*="${k}"]`)?.naturalWidth ?? 0) > 0, first.key);
  await pub.waitForLoadState("networkidle");
  assert.equal(await pub.textContent(`.message-video:has(img[src*="${first.key}"]) .message-video-facts`), `0:12 · ${(p1.bytes / 1048576).toFixed(1)} MB`);
  assert.equal(fetched.length, 0, "nothing of the video is fetched until someone asks for it");
  await shot(pub, "3-board-still");
  const playing = await play(pub, first.key);
  assert.deepEqual(playing, { paused: false, muted: false, width: 1280, height: 720, seconds: playing.seconds, controls: true, inline: true, blob: true });
  assert.ok(Math.abs(playing.seconds - 12) < 0.3);
  assert.equal(new Set(fetched).size, Math.ceil(p1.bytes / PART), "every piece fetched");
  assert.equal(fetched.length, new Set(fetched).size + 1, "once each, but for the one the site stumbled on, which was asked for again");
  await pubCtx.unroute(/\/api\/messages\/video\/[0-9a-f]{32}\/2$/);
  const libraryOnly = [...scriptsAfter].filter((s) => !scriptsBefore.has(s));
  assert.ok(libraryOnly.length >= 1, "picking a video is what loads the video library");
  assert.ok(!libraryOnly.some((s) => pubScripts.has(s)), "and the public page never loads it");
  const fit = await pub.evaluate(() => {
    const v = document.querySelector('.message-video[data-at="playing"]')!.getBoundingClientRect();
    const s = document.querySelector(".updates-scroll")!.getBoundingClientRect();
    return { w: v.width, h: v.height, box: s.height, ratio: v.width / v.height };
  });
  assert.ok(fit.h < fit.box && Math.abs(fit.ratio - 16 / 9) < 0.05, JSON.stringify(fit));
  await shot(pub, "4-board-playing");
  ok("signed out on the home page: a still with its length and size, nothing fetched until the tap, then it plays in its box with sound, even though the site stumbled on a piece");

  // ---- 3. an iPhone's upright .mov is already fine: re-wrapped, not re-encoded ----
  const t0 = Date.now();
  const second = await pick(crew, "iphone.mov");
  assert.match(second.line, /^0:10 · 3\.5 MB\. Ready to post\.$/, second.line);
  assert.ok(Date.now() - t0 < 20_000, "nothing to re-encode, so it is quick");
  await posted(crew); // a video alone, no words
  const f2 = await fetchWhole(second.key, "posted-iphone.mp4");
  const p2 = probe(f2);
  const src2 = probe(clip("iphone.mov"));
  assert.ok(p2.video?.codec === "h264" && p2.audio?.codec === "aac" && Math.abs(p2.video.bitrate / src2.video!.bitrate - 1) < 0.01, "the same picture, not re-encoded");
  assert.ok(p2.video.rotation === 90 && p2.video.width === 1280, "still marked as filmed upright");
  assert.ok(boxes(f2)[0] === "ftyp" && boxes(f2).indexOf("moov") < boxes(f2).indexOf("mdat"), "now an MP4 that starts at once");
  await pub.reload();
  await pub.waitForSelector(`.message-video img[src*="${second.key}"]`);
  const upright = await play(pub, second.key);
  assert.ok(upright.width === 720 && upright.height === 1280 && !upright.paused, JSON.stringify(upright));
  const tall = await pub.evaluate(() => {
    const v = document.querySelector('.message-video[data-at="playing"]')!.getBoundingClientRect();
    const s = document.querySelector(".updates-scroll")!.getBoundingClientRect();
    return { w: v.width, h: v.height, box: s.height };
  });
  assert.ok(tall.h > tall.w && tall.h < tall.box && Math.abs(tall.w / tall.h - 9 / 16) < 0.03, JSON.stringify(tall));
  await shot(pub, "5-board-upright");
  ok("an iPhone's upright .mov is re-wrapped without re-encoding, posts on its own, and plays upright in a box that fits the board");

  // ---- 3b. an upright 1080p original is shrunk and stays upright ----
  const up = await pick(crew, "upright.mov");
  assert.match(up.line, /^0:06 · \d(\.\d)? MB \(\d(\.\d)? MB before it was made smaller\)\. Ready to post\.$/, up.line);
  await crew.fill('textarea[name="body"]', `${TAG} upright original`);
  await posted(crew);
  const pu = probe(await fetchWhole(up.key, "posted-upright.mp4"));
  assert.ok(pu.video?.codec === "h264" && pu.audio?.codec === "aac", JSON.stringify(pu));
  // upright either as 720x1280 frames or as 1280x720 frames flagged to be turned: both display 720 wide, 1280 tall
  const shown = pu.video.rotation === 90 || pu.video.rotation === 270 ? [pu.video.height, pu.video.width] : [pu.video.width, pu.video.height];
  assert.deepEqual(shown, [720, 1280], JSON.stringify(pu.video));
  await pub.reload();
  await pub.waitForSelector(`.message-video img[src*="${up.key}"]`);
  await pub.locator(`.message-video:has(img[src*="${up.key}"])`).scrollIntoViewIfNeeded();
  await pub.waitForFunction((k: string) => (document.querySelector<HTMLImageElement>(`.message-video img[src*="${k}"]`)?.naturalWidth ?? 0) > 0, up.key);
  const still = await pub.evaluate((k: string) => [document.querySelector<HTMLImageElement>(`.message-video img[src*="${k}"]`)!].map((img) => ({ w: img.naturalWidth, h: img.naturalHeight }))[0], up.key);
  assert.ok(still.h > still.w && Math.abs(still.w / still.h - 9 / 16) < 0.02, `the still is upright too: ${JSON.stringify(still)}`);
  const upPlay = await play(pub, up.key);
  assert.ok(upPlay.width === 720 && upPlay.height === 1280 && !upPlay.paused, JSON.stringify(upPlay));
  ok("an upright 1080p original is shrunk to 720 by 1280 and still plays, and shows its still, the right way up");

  // ---- 4. no sound, WebM, HEVC ----
  const silent = await pick(crew, "silent.mp4");
  await crew.fill('textarea[name="body"]', `${TAG} silent`);
  await posted(crew);
  const p3 = probe(await fetchWhole(silent.key, "posted-silent.mp4"));
  assert.ok(p3.video?.codec === "h264" && p3.audio === null && p3.video.width === 640);
  const webm = await pick(crew, "screen.webm");
  await crew.fill('textarea[name="body"]', `${TAG} screen recording`);
  await posted(crew);
  const p4 = probe(await fetchWhole(webm.key, "posted-screen.mp4"));
  assert.ok(p4.video && p4.audio, "a WebM keeps both its picture and its sound, whichever way this browser could carry it");
  assert.ok(/as it is/.test(webm.line) ? p4.video.codec === "vp9" : p4.video.codec === "h264", `${webm.line} -> ${p4.video.codec}/${p4.audio.codec}`);
  const hevc = await pick(crew, "hevc.mov");
  await crew.fill('textarea[name="body"]', `${TAG} original`);
  await posted(crew);
  const p5 = probe(await fetchWhole(hevc.key, "posted-hevc.mp4"));
  assert.ok(p5.video && p5.audio?.codec === "aac");
  if (/as it is/.test(hevc.line)) assert.ok(p5.video.codec === "hevc" && /may not play on every phone/.test(hevc.line), "a browser that cannot decode HEVC sends it as it is and says so");
  else assert.ok(p5.video.codec === "h264" && p5.video.width === 1280 && Math.abs(p5.video.fps - 30) < 1, "a browser that can decode HEVC makes it 720p H.264 at 30 frames a second");
  await pub.reload();
  await pub.waitForSelector(`.message-video img[src*="${webm.key}"]`);
  assert.equal((await play(pub, silent.key)).width, 640);
  await pub.reload();
  await pub.waitForSelector(`.message-video img[src*="${webm.key}"]`);
  assert.equal((await play(pub, webm.key)).width, 1280);
  ok(`a video with no sound, a WebM (${/as it is/.test(webm.line) ? "sent as it is here" : "shrunk"}) and an HEVC original (${/as it is/.test(hevc.line) ? "sent as it is here" : "shrunk"}) all go up with nothing lost`);

  // ---- 5. what is refused, and cancelling ----
  await crew.setInputFiles(PICKER, clip("toolong.mp4"));
  await crew.waitForSelector("form p.error");
  assert.match((await crew.textContent("form p.error"))!, /That video is 5:10 long\. The board takes videos of up to 5 minutes/);
  assert.equal(await key(crew), "");
  assert.equal(await crew.isDisabled(POST), false);
  await crew.setInputFiles(PICKER, clip("notes.mp4"));
  await crew.waitForSelector("form p.error:has-text(\"doesn't look like a video\")");
  await shot(crew, "6-refused");
  assert.equal(await unposted(), 0, "nothing was sent for either");
  await crew.setInputFiles(PICKER, clip("long.mp4"));
  await crew.waitForSelector(".video-working:has-text('Making it smaller')");
  await crew.click(".video-working button:has-text('Cancel')");
  await crew.waitForSelector("label.field:has-text('Add a video (optional)'):visible");
  assert.equal(await key(crew), "");
  assert.equal(await crew.isDisabled(POST), false);
  await crew.waitForTimeout(1500);
  assert.equal(await unposted(), 0, "a cancelled video leaves nothing behind");
  ok("a video over five minutes and a file that is no video are refused in plain words; Cancel stops the work and leaves nothing behind");

  // ---- 6. three minutes ten: a smaller frame and a lower rate, so it still fits ----
  const long = await pick(crew, "long.mp4", 600_000);
  assert.match(long.line, /^3:10 · \d\d MB \((9\d|1\d\d) MB before it was made smaller\)\. Ready to post\.$/, long.line);
  await crew.fill('textarea[name="body"]', `${TAG} the long one`);
  await posted(crew);
  const p6 = probe(await fetchWhole(long.key, "posted-long.mp4"));
  assert.ok(p6.video?.codec === "h264" && p6.video.width === 960 && p6.video.height === 540 && p6.audio?.codec === "aac", JSON.stringify(p6));
  assert.ok(Math.abs(p6.seconds - 190) < 0.5 && p6.bytes <= MAX && p6.bytes > 20_000_000, `${p6.bytes} bytes`);
  ok(`a 3:10 video of ${Math.round(fs.statSync(clip("long.mp4")).size / 1048576)} MB is brought down to 960 wide and ${Math.round(p6.bytes / 1048576)} MB, under the limit`);

  // ---- 7. a message's own page: change the video, take it off, remove the message ----
  await crew.goto(`${B}/crew/messages`);
  await crew.click(`li.message-row:has-text("${TAG} rolling into Yeadon") a:has-text("Edit")`);
  await crew.waitForSelector("label.field:has-text('Change the video')");
  assert.ok(await crew.isVisible(".message-video-still"), "the page shows the video the message has");
  const swap = await pick(crew, "silent.mp4");
  assert.ok(await crew.isVisible("button:has-text('Keep the old video')"));
  await shot(crew, "7-edit");
  await Promise.all([crew.waitForURL(/saved=1/), crew.click(POST)]);
  assert.equal((await fetch(`${B}/api/messages/video/${first.key}/0`)).status, 404, "the old video stops answering");
  assert.equal((await fetch(`${B}/api/messages/video/${swap.key}/0`)).status, 200);
  await crew.click(`li.message-row:has-text("${TAG} rolling into Yeadon") a:has-text("Edit")`);
  await crew.check('input[name="removeVideo"]');
  await Promise.all([crew.waitForURL(/saved=1/), crew.click(POST)]);
  assert.equal((await fetch(`${B}/api/messages/video/${swap.key}/0`)).status, 404);
  assert.equal(await crew.locator(`li.message-row:has-text("${TAG} rolling into Yeadon") .message-video`).count(), 0, "the words stay, the video is gone");
  await crew.click(`li.message-row:has-text("${TAG} the long one") a:has-text("Edit")`);
  await crew.click("a:has-text('Remove from the site')");
  await crew.waitForSelector("text=its video is deleted for good");
  await Promise.all([crew.waitForURL(/removed=1/), crew.click("button:has-text('Yes, remove it')")]);
  assert.equal((await fetch(`${B}/api/messages/video/${long.key}/0`)).status, 404);
  assert.equal(Number((await client.execute({ sql: "SELECT count(*) AS n FROM message_video_parts p JOIN message_videos v ON v.id = p.video_id WHERE v.key IN (?, ?, ?)", args: [first.key, swap.key, long.key] })).rows[0].n), 0, "their bytes are gone from the database");
  ok("on the message's page the video is changed, then taken off; removing a message deletes its video");

  // ---- 8. the board still keeps its height, on a phone and beside the donate card ----
  await pub.reload();
  await pub.waitForSelector(".message-video");
  await pub.locator(".messages-panel").scrollIntoViewIfNeeded();
  const onPhone = await pub.evaluate(() => {
    const s = document.querySelector(".updates-scroll")!;
    return { box: s.getBoundingClientRect().height, inside: s.scrollHeight, tallest: Math.max(...[...document.querySelectorAll(".message-video")].map((v) => v.getBoundingClientRect().height)) };
  });
  assert.ok(onPhone.inside > onPhone.box && onPhone.tallest < onPhone.box, `the list scrolls inside its box and no video is taller than it: ${JSON.stringify(onPhone)}`);
  await shot(pub, "8-board-phone");
  const desk = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await desk.goto(`${B}/#messages`);
  await desk.waitForSelector(".message-video");
  const level = await desk.evaluate(() => {
    const a = document.querySelector(".two-col > .messages-panel")!.getBoundingClientRect();
    const b = document.querySelector(".two-col > .donate-card")!.getBoundingClientRect();
    return { board: a.height, donate: b.height, side: Math.abs(a.top - b.top) < 1 };
  });
  assert.ok(level.side && Math.abs(level.board - level.donate) < 1, `the board and the donate card still stand level: ${JSON.stringify(level)}`);
  if (shots) await desk.screenshot({ path: path.join(shots, "9-board-desktop.png") });
  ok("with videos on it the board still scrolls inside its set height, and still stands level with the donate card");

  assert.deepEqual(problems, [], "no page raised an error along the way");
  ok("no page raised an error along the way");

  await browser.close();
  await setLive(false);
  client.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`# ${n} passed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
