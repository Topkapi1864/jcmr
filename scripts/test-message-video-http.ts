// Videos on the message board through the front door: the BUILT site, a scratch
// database, made-up bytes that begin the way an MP4 does. Signed out, a crew
// session, another crew session, an admin; the site dark and then live.
//
// Start the built site yourself on a spare port against a scratch database, then
// run this with the SAME three settings (from the repo root, after `npm run build`):
//   export DATABASE_URL=file:/tmp/jcmr-video-test/test.db SESSION_SECRET=test-only-secret-0123456789abcdef
//   npx next start -p 3987 &
//   JCMR_TEST_URL=http://localhost:3987 npx tsx scripts/test-message-video-http.ts
// It refuses to run against anything but localhost. It leaves the scratch site
// dark again when it is done. (The browser's half, with real videos, is
// scripts/test-message-video-browser.ts.)
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

const B = (process.env.JCMR_TEST_URL ?? "").replace(/\/$/, "");
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(B)) throw new Error("set JCMR_TEST_URL to the local test site, e.g. http://localhost:3987");
if (!/^file:/.test(process.env.DATABASE_URL ?? "")) throw new Error("set DATABASE_URL to the scratch file: database the test site uses");
if (!process.env.SESSION_SECRET) throw new Error("set SESSION_SECRET to the one the test site uses");

let n = 0;
const ok = (name: string) => console.log(`ok ${++n} - ${name}`);

type Who = string | null;
const cookie = (who: Who): Record<string, string> => (who ? { cookie: `jcmr_session=${who}` } : {});
const get = (p: string, who: Who) => fetch(B + p, { redirect: "manual", headers: cookie(who) });
const api = (method: string, p: string, who: Who, body?: BodyInit, type?: string) => fetch(B + p, { method, redirect: "manual", headers: { ...cookie(who), ...(type ? { "content-type": type } : {}) }, body });
const why = async (r: Response) => ((await r.json().catch(() => ({}))) as { error?: string }).error ?? "";

/** Bytes that start like an MP4 ("....ftypisom"), random after that. */
function fakeMp4(bytes: number): Buffer {
  const b = randomBytes(bytes);
  Buffer.from([0, 0, 0, 0x1c]).copy(b, 0);
  b.write("ftypisom", 4, "latin1");
  return b;
}
const POSTER = "data:image/jpeg;base64," + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]).toString("base64");

/** A server action posted the way the form posts it. */
async function act(page: string, action: string, who: Who, fields: Record<string, string>) {
  const fd = new FormData();
  fd.append(action, "");
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  const r = await fetch(B + page, { method: "POST", body: fd, redirect: "manual", headers: { origin: B, ...cookie(who) } });
  return { status: r.status, to: r.headers.get("location") ?? "" };
}
/** The server-action ids on a page, by what each form holds. */
function actions(html: string) {
  const out: Record<string, string> = {};
  for (const m of html.matchAll(/<form[^>]*>([\s\S]*?)<\/form>/g)) {
    const id = /name="(\$ACTION_ID_[0-9a-f]+)"/.exec(m[1])?.[1];
    if (!id) continue;
    const kind = /name="body"/.test(m[1]) ? "write" : /name="pinned"/.test(m[1]) ? "pin" : /name="id"/.test(m[1]) ? "remove" : "other";
    out[kind] ??= id;
  }
  return out;
}

async function main() {
  const { client, ready } = await import("../src/db/client");
  const { signSession } = await import("../src/lib/session");
  const { VIDEO_PART_BYTES: PART, VIDEO_MAX_BYTES: MAX, fmtVideoSize } = await import("../src/lib/video-rules");
  await ready();
  await client.execute("INSERT OR IGNORE INTO people (id, name, short_name, role) VALUES (9001, 'Test Admin', 'TAdmin', 'admin'), (9002, 'Test Crew', 'TCrew', 'crew'), (9003, 'Other Crew', 'TOther', 'crew')");
  const setLive = (on: boolean) => client.execute({ sql: "INSERT INTO settings (key, value) VALUES ('site.public_live', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", args: [String(on)] });
  await setLive(false);
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const admin = await signSession({ pid: 9001, name: "TAdmin", role: "admin", exp });
  const crew = await signSession({ pid: 9002, name: "TCrew", role: "crew", exp });
  const other = await signSession({ pid: 9003, name: "TOther", role: "crew", exp });
  const WORDS = `Video test ${randomBytes(4).toString("hex")}`;

  const start = (who: Who, facts: Record<string, unknown>) => api("POST", "/api/messages/video", who, JSON.stringify(facts), "application/json");
  const put = (who: Who, key: string, i: number | string, bytes: Uint8Array) => api("PUT", `/api/messages/video/${key}/${i}`, who, new Uint8Array(bytes), "application/octet-stream");
  /** Sends a whole made-up video the way the page does; gives back its key. */
  async function upload(who: Who, bytes: Buffer, facts: Record<string, unknown> = {}) {
    const s = await start(who, { bytes: bytes.length, seconds: 12, width: 1280, height: 720, poster: POSTER, ...facts });
    assert.equal(s.status, 200);
    const { key, parts, partBytes } = (await s.json()) as { key: string; parts: number; partBytes: number };
    assert.equal(partBytes, PART);
    await Promise.all([...Array(parts).keys()].map(async (i) => assert.equal((await put(who, key, i, bytes.subarray(i * PART, (i + 1) * PART))).status, 200)));
    assert.equal((await api("POST", `/api/messages/video/${key}`, who)).status, 200);
    return key;
  }
  const readBack = async (key: string, parts: number, who: Who) => Buffer.concat(await Promise.all([...Array(parts).keys()].map(async (i) => Buffer.from(await (await get(`/api/messages/video/${key}/${i}`, who)).arrayBuffer()))));

  // ---- signed out: nothing can be sent ----
  for (const r of [await start(null, { bytes: 1000, seconds: 1 }), await put(null, "0".repeat(32), 0, fakeMp4(1000)), await api("POST", `/api/messages/video/${"0".repeat(32)}`, null), await api("DELETE", `/api/messages/video/${"0".repeat(32)}`, null)]) {
    assert.equal(r.status, 401);
    assert.equal(await why(r), "signed-out");
  }
  let r = await start(crew.slice(0, -3) + "abc", { bytes: 1000, seconds: 1 });
  assert.equal(r.status, 401, "a forged session is refused");
  ok("signed out, or with a forged session, no step of an upload is accepted");

  // ---- what an upload may be ----
  r = await api("POST", "/api/messages/video", crew, "not json", "application/json");
  assert.equal(r.status, 400);
  r = await start(crew, { bytes: MAX + 1, seconds: 10 });
  assert.ok(r.status === 413 && (await why(r)) === "too-big");
  r = await start(crew, { bytes: 5000, seconds: 301 + 5 });
  assert.ok(r.status === 413 && (await why(r)) === "too-long");
  r = await start(crew, { bytes: 5000, seconds: 5, poster: "<svg onload=alert(1)>" });
  assert.ok(r.status === 400 && (await why(r)) === "bad-poster");
  ok("not JSON, too big, too long and a still that is not a JPEG are refused at the first step");

  const clip = fakeMp4(PART * 2 + 54_321);
  r = await start(crew, { bytes: clip.length, seconds: 12.5, width: 1280, height: 720, poster: POSTER });
  assert.equal(r.status, 200);
  assert.match(r.headers.get("cache-control") ?? "no-store", /no-store|private|no-cache/);
  const up = (await r.json()) as { key: string; parts: number; partBytes: number };
  assert.ok(/^[0-9a-f]{32}$/.test(up.key) && up.parts === 3 && up.partBytes === PART);
  const k1 = up.key;
  r = await put(other, k1, 0, clip.subarray(0, PART));
  assert.ok(r.status === 403 && (await why(r)) === "denied", "another crew member cannot add to it");
  r = await put(crew, k1, 0, Buffer.alloc(PART, 7));
  assert.ok(r.status === 415 && (await why(r)) === "not-video", "the first piece must begin like a video");
  r = await put(crew, k1, 1, clip.subarray(0, 1000));
  assert.ok(r.status === 400 && (await why(r)) === "bad-part", "a piece of the wrong size");
  r = await put(crew, k1, 1, Buffer.alloc(PART + 1));
  assert.equal(r.status, 400, "a piece that is too big");
  r = await put(crew, k1, "poster", clip.subarray(0, PART));
  assert.equal(r.status, 400);
  r = await put(crew, k1, 7, clip.subarray(0, PART));
  assert.equal(r.status, 400, "a piece past the end");
  assert.equal((await put(crew, k1, 0, clip.subarray(0, PART))).status, 200);
  assert.equal((await put(crew, k1, 2, clip.subarray(PART * 2))).status, 200);
  r = await api("POST", `/api/messages/video/${k1}`, crew);
  assert.ok(r.status === 409 && (await why(r)) === "incomplete", "it cannot be finished with a piece missing");
  assert.equal((await put(crew, k1, 1, clip.subarray(PART, PART * 2))).status, 200);
  assert.equal((await api("POST", `/api/messages/video/${k1}`, other)).status, 403);
  assert.equal((await api("POST", `/api/messages/video/${k1}`, crew)).status, 200);
  ok("a crew session sends a video piece by piece; strangers, wrong sizes and non-videos are refused; it finishes only when whole");

  // ---- not on the board until it is posted ----
  for (const who of [null, crew, admin]) {
    assert.equal((await get(`/api/messages/video/${k1}/0`, who)).status, 404);
    assert.equal((await get(`/api/messages/video/${k1}/poster`, who)).status, 404);
  }
  let page = await (await get("/crew/messages", crew)).text();
  const write = actions(page).write;
  assert.ok(write, "the message form is on the page");
  assert.ok(/name="video"/.test(page) && /accept="video\/\*"/.test(page), "the form has the video picker and the field its key travels in");
  let a = await act("/crew/messages", write, other, { body: "not mine", photo: "", video: k1 });
  assert.ok(a.to.includes("badvideo=1"), "someone else cannot post it");
  a = await act("/crew/messages", write, crew, { body: "ghost", photo: "", video: "f".repeat(32) });
  assert.ok(a.to.includes("badvideo=1"), "a key that is no upload posts nothing");
  page = await (await get("/crew/messages", crew)).text();
  assert.ok(!page.includes("not mine") && !page.includes("ghost"));
  ok("an unposted upload is served to nobody; a post with a wrong or stolen key posts nothing at all");

  // ---- posted: on the crew list, in the feed, and served piece by piece ----
  a = await act("/crew/messages", write, crew, { body: WORDS, photo: "", video: k1 });
  assert.ok(a.status === 303 && a.to.includes("posted=1"), "the message goes up");
  page = await (await get("/crew/messages", crew)).text();
  assert.ok(page.includes(WORDS) && page.includes(`/api/messages/video/${k1}/poster`), "the crew list shows the message with its video's still");
  const id1 = Number(new RegExp(`id="m-(\\d+)"[\\s\\S]*?${WORDS}`).exec(page)?.[1]);
  assert.ok(id1 > 0);
  let feed = (await (await get("/api/live", crew)).json()) as { updates: { id: string; text: string; video: Record<string, unknown> | null }[] };
  const u = feed.updates.find((x) => x.text === WORDS)!;
  assert.deepEqual(u.video, { src: `/api/messages/video/${k1}`, parts: 3, bytes: clip.length, type: "video/mp4", seconds: 12.5, width: 1280, height: 720, poster: `/api/messages/video/${k1}/poster` });
  assert.ok(!JSON.stringify(feed).includes("base64"), "the feed carries addresses, never bytes");
  assert.ok((await readBack(k1, 3, crew)).equals(clip), "read back piece by piece, byte for byte");
  let p = await get(`/api/messages/video/${k1}/1`, crew);
  assert.equal(p.headers.get("content-type"), "application/octet-stream");
  assert.equal(p.headers.get("content-length"), String(PART));
  assert.equal(p.headers.get("cache-control"), "private, max-age=3600", "while the site is dark a piece is for the crew's own browsers only");
  assert.equal(p.headers.get("vercel-cache-tag"), null, "and is not filed in the CDN");
  p = await get(`/api/messages/video/${k1}/poster`, crew);
  assert.equal(p.headers.get("content-type"), "image/jpeg");
  assert.ok(Buffer.from(await p.arrayBuffer()).equals(Buffer.from(POSTER.split(",")[1], "base64")));
  for (const bad of ["3", "999", "-1", "x", "1.5", "poster2", "0x1"]) assert.equal((await get(`/api/messages/video/${k1}/${bad}`, crew)).status, 404, `piece "${bad}"`);
  assert.equal((await get(`/api/messages/video/${k1.slice(0, 31)}/0`, crew)).status, 404);
  assert.equal((await put(crew, k1, 0, clip.subarray(0, PART))).status, 404, "a posted video takes no more pieces");
  assert.equal((await api("DELETE", `/api/messages/video/${k1}`, crew)).status, 404, "and cannot be dropped as if unposted");
  a = await act("/crew/messages", write, crew, { body: "twice", photo: "", video: k1 });
  assert.ok(a.to.includes("badvideo=1"), "an upload is posted once");
  ok("posted, the video is on the crew list and in the feed, and its pieces come back byte-identical");

  // ---- the gate: dark, then live ----
  for (const path of [`/api/messages/video/${k1}/0`, `/api/messages/video/${k1}/poster`]) {
    const dark = await get(path, null);
    assert.equal(dark.status, 404, `${path} signed out while dark`);
    assert.match(dark.headers.get("cache-control") ?? "", /no-store/);
  }
  await setLive(true);
  p = await get(`/api/messages/video/${k1}/2`, null);
  assert.equal(p.status, 200);
  assert.equal(p.headers.get("cache-control"), "public, max-age=31536000, s-maxage=604800, immutable", "live: the browser keeps a piece for good, the CDN for a week");
  assert.equal(p.headers.get("vercel-cache-tag"), `video-${k1}`, "filed under the video's own tag, so taking the video down can clear it from the CDN");
  assert.equal(p.headers.get("set-cookie"), null, "nothing that would stop the CDN keeping it");
  assert.ok(!/cookie|\*/i.test(p.headers.get("vary") ?? ""));
  assert.ok(Buffer.from(await p.arrayBuffer()).equals(clip.subarray(PART * 2)));
  p = await get(`/api/messages/video/${k1}/poster`, null);
  assert.equal(p.headers.get("cache-control"), "public, max-age=31536000, s-maxage=604800, immutable");
  assert.equal(p.headers.get("vercel-cache-tag"), `video-${k1}`);
  assert.ok((await readBack(k1, 3, null)).equals(clip));
  const home = await (await get("/", null)).text();
  assert.ok(home.includes(WORDS) && home.includes(`/api/messages/video/${k1}/poster`) && home.includes("message-video-still"), "the home page shows the still with its play button");
  assert.ok(!home.includes(`/api/messages/video/${k1}/0`), "and asks for none of the video until it is tapped");
  assert.ok((await (await get("/live", null)).text()).includes(`/api/messages/video/${k1}/poster`), "and so does Live");
  feed = (await (await get("/api/live", null)).json()) as typeof feed;
  assert.equal(feed.updates.find((x) => x.text === WORDS)!.video!.src, `/api/messages/video/${k1}`);
  ok("dark, only the crew are served it; live, anyone is, with headers that let the CDN and the browser keep each piece");

  // ---- a message's own page: replace the video, then take it off ----
  page = await (await get(`/crew/messages/${id1}`, crew)).text();
  const edit = actions(page);
  assert.ok(edit.write, "the message's page has its edit form");
  assert.ok(page.includes("Change the video") && page.includes('name="removeVideo"'));
  const clip2 = fakeMp4(PART + 777);
  const k2 = await upload(crew, clip2, { seconds: 7 });
  a = await act(`/crew/messages/${id1}`, edit.write, other, { id: String(id1), body: "hacked", photo: "", video: "" });
  assert.ok(a.to.includes("denied=1"), "another crew member cannot edit it");
  a = await act(`/crew/messages/${id1}`, edit.write, crew, { id: String(id1), body: WORDS, photo: "", video: "e".repeat(32) });
  assert.ok(a.to.includes("badvideo=1"));
  assert.ok((await readBack(k1, 3, null)).equals(clip), "a refused edit leaves the video as it was");
  a = await act(`/crew/messages/${id1}`, edit.write, crew, { id: String(id1), body: WORDS + " (new cut)", photo: "", video: k2 });
  assert.ok(a.to.includes("saved=1"), "the video is replaced");
  assert.equal((await get(`/api/messages/video/${k1}/0`, null)).status, 404, "the old video's address stops answering");
  assert.ok((await readBack(k2, 2, null)).equals(clip2));
  feed = (await (await get("/api/live", null)).json()) as typeof feed;
  assert.equal(feed.updates.find((x) => x.text.startsWith(WORDS))!.video!.src, `/api/messages/video/${k2}`);
  a = await act(`/crew/messages/${id1}`, edit.write, admin, { id: String(id1), body: WORDS + " (new cut)", photo: "", video: "", removeVideo: "on" });
  assert.ok(a.to.includes("saved=1"), "an admin takes the video off");
  assert.equal((await get(`/api/messages/video/${k2}/0`, null)).status, 404);
  feed = (await (await get("/api/live", null)).json()) as typeof feed;
  assert.equal(feed.updates.find((x) => x.text.startsWith(WORDS))!.video, null);
  ok("on the message's page the video is replaced or taken off; the old address stops answering");

  // ---- a video alone, and removing its message ----
  const clip3 = fakeMp4(300_000);
  const k3 = await upload(other, clip3, { seconds: 3, width: 720, height: 1280, poster: "" });
  a = await act("/crew/messages", write, other, { body: "", photo: "", video: k3 });
  assert.ok(a.to.includes("posted=1"), "a video alone is a message");
  feed = (await (await get("/api/live", null)).json()) as typeof feed;
  const alone = feed.updates.find((x) => x.video?.src === `/api/messages/video/${k3}`)!;
  assert.ok(alone && alone.text === "" && alone.video!.poster === null && alone.video!.width === 720);
  const id3 = Number(alone.id.slice(1));
  page = await (await get(`/crew/messages/${id3}?confirm=1`, other)).text();
  assert.ok(page.includes("its video is deleted for good"), "the confirm step says the video goes for good");
  a = await act(`/crew/messages/${id3}`, actions(page).remove, crew, { id: String(id3) });
  assert.ok(a.to.includes("denied=1"), "another crew member cannot remove it");
  a = await act(`/crew/messages/${id3}`, actions(page).remove, other, { id: String(id3) });
  assert.ok(a.to.includes("removed=1"));
  assert.equal((await get(`/api/messages/video/${k3}/0`, null)).status, 404, "a removed message's video stops answering");
  feed = (await (await get("/api/live", null)).json()) as typeof feed;
  assert.ok(!feed.updates.some((x) => x.video?.src === `/api/messages/video/${k3}`));
  const left = await client.execute({ sql: "SELECT count(*) AS n FROM message_video_parts p JOIN message_videos v ON v.id = p.video_id WHERE v.key IN (?, ?, ?)", args: [k1, k2, k3] });
  assert.equal(Number(left.rows[0].n), 0, "and the bytes of all three are gone from the database");
  ok("a video alone is a message; removing the message takes the video down and deletes its bytes");

  // ---- taken off before posting ----
  const k4 = await upload(crew, fakeMp4(200_000));
  assert.equal((await api("DELETE", `/api/messages/video/${k4}`, other)).status, 403);
  assert.equal((await api("DELETE", `/api/messages/video/${k4}`, crew)).status, 200);
  a = await act("/crew/messages", write, crew, { body: "after dropping", photo: "", video: k4 });
  assert.ok(a.to.includes("badvideo=1"));
  ok("a video taken off before posting is gone and can no longer be posted");

  // ---- messages without a video are as they were ----
  a = await act("/crew/messages", write, crew, { body: `${WORDS} words only`, photo: "", video: "" });
  assert.ok(a.to.includes("posted=1"));
  a = await act("/crew/messages", write, crew, { body: "", photo: "", video: "" });
  assert.ok(a.to.includes("empty=1"));
  feed = (await (await get("/api/live", null)).json()) as typeof feed;
  assert.equal(feed.updates.find((x) => x.text === `${WORDS} words only`)!.video, null);
  ok("a message with no video posts as before; nothing at all is still refused");

  const journal = await client.execute("SELECT action FROM audit WHERE action LIKE 'messages:%' ORDER BY id");
  const lines = journal.rows.map((x) => String(x.action));
  assert.ok(lines.some((l) => l.includes(`posted #${id1} with a video (0:13, ${fmtVideoSize(clip.length)}) "${WORDS}"`)), "the journal says a video went up, how long and how big");
  assert.ok(lines.some((l) => l === `messages: edited #${id1} (new video)`) && lines.some((l) => l === `messages: edited #${id1} (video removed)`));
  assert.ok(lines.some((l) => l.includes(`removed #${id3} "(a video)" (its video deleted)`)));
  ok("every post, change and removal of a video is in the journal");

  await setLive(false);
  client.close();
  console.log(`# ${n} passed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
