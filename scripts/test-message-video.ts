// Tests for videos on the message board (src/lib/video-rules.ts,
// src/lib/message-video.ts and the video side of src/lib/messages.ts).
// Uses a scratch database under the OS temp dir; no network, no real video:
// the "videos" are made-up bytes that begin the way an MP4 or a WebM does.
// Run from the repo root:
//   npx tsx scripts/test-message-video.ts
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jcmr-video-test-"));
process.env.DATABASE_URL = `file:${path.join(tmp, "test.db")}`;

let n = 0;
const ok = (name: string) => console.log(`ok ${++n} - ${name}`);

/** Bytes that start like an MP4 ("....ftypisom"), random after that. */
function fakeMp4(bytes: number): Buffer {
  const b = randomBytes(bytes);
  Buffer.from([0, 0, 0, 0x1c]).copy(b, 0);
  b.write("ftypisom", 4, "latin1");
  return b;
}
const POSTER = "data:image/jpeg;base64," + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]).toString("base64");

async function main() {
  const rules = await import("../src/lib/video-rules");
  const video = await import("../src/lib/message-video");
  const messages = await import("../src/lib/messages");
  const { fullBackup } = await import("../src/lib/backup");
  const { client, ready } = await import("../src/db/client");
  const { VIDEO_PART_BYTES: PART, VIDEO_MAX_BYTES: MAX } = rules;

  // Stand in for Vercel: the per-request object its CDN purge is reached through (src/lib/cdn.ts).
  const cleared: string[][] = [];
  let purgeFails = false;
  (globalThis as unknown as Record<symbol, unknown>)[Symbol.for("@vercel/request-context")] = {
    get: () => ({
      purge: {
        dangerouslyDeleteByTag: async (tags: string[]) => {
          if (purgeFails) throw new Error("purge is down");
          cleared.push(tags);
        },
      },
    }),
  };

  await ready();
  await client.execute("INSERT INTO people (id, name, short_name, role) VALUES (9001, 'Test Admin', 'TAdmin', 'admin'), (9002, 'Test Crew', 'TCrew', 'crew'), (9003, 'Other Crew', 'TOther', 'crew')");
  const admin = { pid: 9001, name: "TAdmin", role: "admin" as const };
  const crew = { pid: 9002, name: "TCrew", role: "crew" as const };
  const other = { pid: 9003, name: "TOther", role: "crew" as const };

  /** Sends a whole made-up video the way the browser does; gives back its key. */
  async function upload(who: typeof crew, bytes: Buffer, facts: { seconds?: number; width?: number; height?: number; poster?: string } = {}) {
    const s = await video.startVideoUpload(who, { bytes: bytes.length, seconds: facts.seconds ?? 12, width: facts.width ?? 1280, height: facts.height ?? 720, poster: facts.poster ?? POSTER });
    assert.ok(s.ok, "the upload starts");
    assert.equal(s.parts, rules.videoPartCount(bytes.length));
    // out of order, as three at a time over a phone connection would be
    for (const i of [...Array(s.parts).keys()].reverse()) assert.equal(await video.putVideoPart(who, s.key, i, bytes.subarray(i * PART, (i + 1) * PART)), "ok");
    assert.equal(await video.finishVideoUpload(who, s.key), "ok");
    return s.key;
  }
  const readBack = async (key: string, parts: number) => Buffer.concat(await Promise.all([...Array(parts).keys()].map(async (i) => Buffer.from((await video.videoPart(key, i)) ?? new Uint8Array()))));
  const partRows = async () => Number((await client.execute("SELECT count(*) AS n FROM message_video_parts")).rows[0].n);

  // ---- the plan: leave it, shrink it, refuse it ----
  const phone = { videoCodec: "avc", audioCodec: "aac", fps: 30 };
  assert.deepEqual(rules.planVideo({ ...phone, bytes: 3_700_000, seconds: 10, width: 720, height: 1280 }), { how: "copy" });
  assert.deepEqual(rules.planVideo({ ...phone, bytes: 18_300_000, seconds: 12, width: 1920, height: 1080 }), { how: "shrink", width: 1280, height: 720, videoBitrate: 2_200_000, fps: null });
  assert.deepEqual(rules.planVideo({ ...phone, bytes: 9_000_000, seconds: 8, width: 1080, height: 1920, fps: 60 }), { how: "shrink", width: 720, height: 1280, videoBitrate: 2_200_000, fps: 30 });
  const hevc = rules.planVideo({ ...phone, videoCodec: "hevc", bytes: 1_000_000, seconds: 4, width: 640, height: 360 });
  assert.ok(hevc.how === "shrink" && hevc.width === 640 && hevc.height === 360 && hevc.videoBitrate === 640 * 360 * 3, "a codec not every phone plays is re-encoded even when small, and never enlarged");
  assert.deepEqual(rules.planVideo({ ...phone, audioCodec: "opus", videoCodec: "vp9", bytes: 1_100_000, seconds: 6, width: 1280, height: 720 }).how, "shrink");
  ok("a small H.264 clip is left alone; a 1080p one goes to 720p; 60 frames a second become 30; other codecs are re-encoded");

  for (const seconds of [20, 100, 150, 200, 300]) {
    const p = rules.planVideo({ ...phone, bytes: seconds * 2_000_000, seconds, width: 1920, height: 1080 });
    assert.ok(p.how === "shrink");
    const total = ((p.videoBitrate + 128_000) * seconds) / 8;
    assert.ok(total <= 34 * 1024 * 1024 + seconds, `${seconds}s plans to ${Math.round(total / 1e6)} MB`); // + a rounded bit a second
    assert.ok(p.width % 2 === 0 && p.height % 2 === 0 && Math.abs(p.width / p.height - 16 / 9) < 0.01);
    assert.equal(p.width, seconds <= 150 ? 1280 : seconds <= 200 ? 960 : 854);
  }
  assert.deepEqual(rules.planVideo({ ...phone, bytes: 500_000_000, seconds: 302, width: 1920, height: 1080 }), { how: "refuse", why: "too-long" });
  assert.deepEqual(rules.planVideo({ ...phone, videoCodec: null, bytes: 5_000_000, seconds: 30, width: 0, height: 0 }), { how: "refuse", why: "no-picture" });
  ok("every length up to five minutes is planned to fit, keeping its shape; longer is refused, and so is sound without pictures");

  assert.equal(rules.videoMime(fakeMp4(64)), "video/mp4");
  assert.equal(rules.videoMime(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4, 5, 6, 7, 8])), "video/webm");
  assert.equal(rules.videoMime(Buffer.from("<html>not a video at all</html>")), null);
  assert.equal(rules.videoMime(Buffer.alloc(0)), null);
  assert.equal(rules.videoPartCount(PART * 2), 2);
  assert.equal(rules.videoPartCount(PART * 2 + 1), 3);
  assert.equal(rules.videoPartSize(PART * 2 + 5, 2), 5);
  assert.equal(rules.videoPartSize(PART * 2 + 5, 0), PART);
  assert.equal(rules.fmtVideoLength(42.4), "0:42");
  assert.equal(rules.fmtVideoLength(185), "3:05");
  assert.equal(rules.fmtVideoSize(640 * 1024), "640 KB");
  assert.equal(rules.fmtVideoSize(6.14 * 1024 * 1024), "6.1 MB");
  ok("a video is told by its first bytes; pieces are counted and sized; lengths and sizes read plainly");

  // ---- what an upload may be ----
  assert.deepEqual(await video.startVideoUpload(crew, { bytes: 0, seconds: 1 }), { ok: false, why: "empty" });
  assert.deepEqual(await video.startVideoUpload(crew, { bytes: MAX + 1, seconds: 10 }), { ok: false, why: "too-big" });
  assert.deepEqual(await video.startVideoUpload(crew, { bytes: 1000, seconds: 400 }), { ok: false, why: "too-long" });
  assert.deepEqual(await video.startVideoUpload(crew, { bytes: 1000, seconds: 5, poster: "data:image/png;base64,AAAA" }), { ok: false, why: "bad-poster" });
  assert.deepEqual(await video.startVideoUpload(crew, { bytes: 1000, seconds: 5, poster: "data:image/jpeg;base64," + "A".repeat(rules.VIDEO_POSTER_MAX_CHARS) }), { ok: false, why: "bad-poster" });
  assert.equal(await video.videoBytesStored(), 0);
  ok("nothing, too big, too long and a still that is not a small JPEG are refused before anything is stored");

  // ---- the pieces ----
  const clip = fakeMp4(PART * 2 + 12_345); // three pieces, the last a short one
  const s1 = await video.startVideoUpload(crew, { bytes: clip.length, seconds: 12.5, width: 1280, height: 720, poster: POSTER });
  assert.ok(s1.ok && s1.parts === 3 && /^[0-9a-f]{32}$/.test(s1.key));
  const k1 = s1.key;
  assert.equal(await video.putVideoPart(other, k1, 0, clip.subarray(0, PART)), "denied", "someone else's upload");
  assert.equal(await video.putVideoPart(crew, "0".repeat(32), 0, clip.subarray(0, PART)), "not-found");
  assert.equal(await video.putVideoPart(crew, "../../etc", 0, clip.subarray(0, PART)), "not-found");
  assert.equal(await video.putVideoPart(crew, k1, 3, clip.subarray(0, PART)), "bad-part", "a piece past the end");
  assert.equal(await video.putVideoPart(crew, k1, 1, clip.subarray(0, PART - 1)), "bad-part", "a short middle piece");
  assert.equal(await video.putVideoPart(crew, k1, 2, clip.subarray(0, PART)), "bad-part", "a last piece of the wrong size");
  assert.equal(await video.putVideoPart(crew, k1, 0, Buffer.alloc(PART, 7)), "not-video", "a first piece that does not begin like a video");
  assert.equal(await partRows(), 0);
  assert.equal(await video.putVideoPart(crew, k1, 2, clip.subarray(PART * 2)), "ok");
  assert.equal(await video.putVideoPart(crew, k1, 0, clip.subarray(0, PART)), "ok");
  assert.equal(await video.finishVideoUpload(crew, k1), "incomplete", "one piece is still missing");
  assert.equal(await video.videoToPost(crew, k1), null, "an unfinished upload cannot be posted");
  assert.equal(await video.putVideoPart(crew, k1, 1, Buffer.alloc(PART, 9)), "ok");
  assert.equal(await video.putVideoPart(crew, k1, 1, clip.subarray(PART, PART * 2)), "ok", "a piece sent again replaces the first try");
  assert.equal(await video.finishVideoUpload(other, k1), "denied");
  assert.equal(await video.finishVideoUpload(crew, k1), "ok");
  assert.equal(await video.finishVideoUpload(crew, k1), "ok", "finishing twice is harmless");
  assert.equal(await video.putVideoPart(crew, k1, 1, clip.subarray(PART, PART * 2)), "bad-part", "a finished upload takes no more pieces");
  assert.equal(await partRows(), 3);
  ok("pieces arrive in any order and can be re-sent; wrong sizes, strangers and non-videos are refused; it finishes only when whole");

  // ---- not on the board until its message is posted ----
  assert.equal(await video.videoPart(k1, 0), null, "an unposted upload is served to nobody");
  assert.equal(await video.videoPoster(k1), null);
  assert.equal(await video.videoToPost(other, k1), null, "only whoever sent it can post it");
  await assert.rejects(messages.postMessage(other, "mine now", null, k1), /bad video/);
  await assert.rejects(messages.postMessage(crew, "x", null, "f".repeat(32)), /bad video/);
  assert.equal((await messages.listMessages()).length, 0, "a refused post leaves no message behind");
  ok("an unposted upload is served to nobody, and nobody else can post it");

  const id1 = await messages.postMessage(crew, "", null, k1);
  assert.ok(typeof id1 === "number", "a video alone is a message");
  let m1 = (await messages.getMessage(id1!))!;
  assert.deepEqual(m1.video, { key: k1, mime: "video/mp4", bytes: clip.length, parts: 3, seconds: 12.5, width: 1280, height: 720, hasPoster: true });
  assert.equal(m1.body, "");
  assert.equal(m1.hasPhoto, false);
  assert.ok((await readBack(k1, 3)).equals(clip), "read back piece by piece, byte for byte");
  assert.equal(await video.videoPart(k1, 3), null);
  assert.equal(await video.videoPoster(k1), POSTER);
  await assert.rejects(messages.postMessage(crew, "again", null, k1), /bad video/, "an upload is posted once");
  assert.equal(await video.putVideoPart(crew, k1, 0, clip.subarray(0, PART)), "not-found", "a posted video takes no more pieces");
  assert.equal(await video.dropVideoUpload(crew, k1), "not-found", "and cannot be dropped as if unposted");
  assert.equal((await messages.listMessages()).length, 1);
  ok("posting the message puts the video on the board: its facts in the list, its pieces byte-identical, once");

  const forPages = video.boardVideo(m1.video!);
  assert.deepEqual(forPages, { src: `/api/messages/video/${k1}`, parts: 3, bytes: clip.length, type: "video/mp4", seconds: 12.5, width: 1280, height: 720, poster: `/api/messages/video/${k1}/poster` });
  assert.ok(!JSON.stringify(await messages.listMessages()).includes("base64"), "a list carries the video's facts, never its still or its bytes");
  ok("the pages are given where the video's pieces are and the shape of its box");

  // ---- words, a picture and a video together; and messages without one are as before ----
  const k2 = await upload(crew, fakeMp4(300_000), { seconds: 3, width: 720, height: 1280, poster: "" });
  const JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2Q==";
  const id2 = await messages.postMessage(crew, "At the finish.\n\nAll four in.", JPEG, k2);
  const m2 = (await messages.getMessage(id2!))!;
  assert.ok(m2.hasPhoto && m2.video?.key === k2 && m2.video.parts === 1 && m2.video.hasPoster === false && m2.body.startsWith("At the finish."));
  const id3 = await messages.postMessage(admin, "Words only.");
  assert.equal((await messages.getMessage(id3!))!.video, null);
  assert.equal(await messages.postMessage(crew, "  ", null, ""), null, "nothing at all is still not a message");
  const list = await messages.listMessages();
  assert.deepEqual(list.map((x) => x.id), [id3, id2, id1], "newest first, one row per message");
  assert.equal(video.boardVideo(m2.video!).poster, null, "a video with no still says so");
  ok("words, a picture and a video go up together; a message without a video is as it was");

  // ---- editing: leave, replace, remove ----
  assert.equal(await messages.updateMessage(crew, id2!, "At the finish. All four in."), "ok");
  assert.equal((await messages.getMessage(id2!))!.video?.key, k2, "editing the words leaves the video");
  assert.equal(await messages.updateMessage(other, id2!, "hacked", undefined, null), "denied");
  assert.equal(await messages.updateMessage(crew, id2!, "x", undefined, "e".repeat(32)), "bad-video");
  assert.equal((await messages.getMessage(id2!))!.body, "At the finish. All four in.", "a refused edit changes nothing");
  const before = await partRows();
  const replacement = fakeMp4(PART + 99);
  const k3 = await upload(crew, replacement, { seconds: 7 });
  assert.equal(await partRows(), before + 2);
  assert.deepEqual(cleared, [], "nothing has been cleared from the CDN so far: posting, editing words and refused edits take nothing down");
  assert.equal(await messages.updateMessage(crew, id2!, "At the finish. All four in.", undefined, k3), "ok");
  assert.deepEqual(cleared.splice(0), [[`video-${k2}`]], "the replaced video is cleared from the CDN by its tag");
  const m2b = (await messages.getMessage(id2!))!;
  assert.ok(m2b.video?.key === k3 && m2b.hasPhoto && m2b.editedBy === "TCrew");
  assert.equal(await video.videoPart(k2, 0), null, "the old video's address stops answering");
  assert.ok((await readBack(k3, 2)).equals(replacement));
  assert.equal(await partRows(), before + 2 - 1, "and its pieces are deleted");
  assert.equal((await messages.listMessages()).length, 3, "still one row per message");
  assert.equal(await messages.updateMessage(admin, id2!, "At the finish. All four in.", undefined, null), "ok", "an admin can take a video off");
  assert.equal((await messages.getMessage(id2!))!.video, null);
  assert.deepEqual(cleared.splice(0), [[`video-${k3}`]]);
  assert.equal(await video.videoPart(k3, 0), null);
  assert.equal(await partRows(), 3, "only the first message's three pieces are left");
  assert.equal(await messages.updateMessage(crew, id1!, "", undefined, null), "empty", "a message cannot be left with nothing");
  assert.equal((await messages.getMessage(id1!))!.video?.key, k1);
  ok("an edit leaves the video, replaces it or removes it; a replaced or removed video's bytes are deleted");

  // ---- removing the message ----
  assert.equal(await messages.removeMessage(other, id1!), false);
  assert.deepEqual(cleared, []);
  purgeFails = true; // the CDN's purge being down must not stop a video being taken off the site
  assert.equal(await messages.removeMessage(crew, id1!), true);
  purgeFails = false;
  assert.equal(await video.videoPart(k1, 0), null, "a removed message's video stops answering");
  assert.equal(await video.videoPoster(k1), null);
  assert.equal(await partRows(), 0);
  assert.equal(await video.videoBytesStored(), 0);
  assert.ok(!(await messages.listMessages()).some((x) => x.id === id1));
  const kept = await client.execute("SELECT count(*) AS n FROM message_videos WHERE deleted = 1");
  assert.equal(Number(kept.rows[0].n), 3, "each video's record stays, marked");
  assert.equal(await messages.removeMessage(admin, id3!), true);
  assert.equal(await messages.removeMessage(crew, id2!), true);
  assert.deepEqual(cleared, [], "a message with no video clears nothing");
  const kx = await upload(crew, fakeMp4(100_000));
  const idx = await messages.postMessage(crew, "one more", null, kx);
  assert.equal(await messages.removeMessage(crew, idx!), true);
  assert.deepEqual(cleared.splice(0), [[`video-${kx}`]], "a removed message's video is cleared from the CDN by its tag");
  ok("removing the message takes its video down, deletes its bytes and clears it from the CDN; the records stay, marked");

  // ---- taken off before posting, and never posted at all ----
  const k4 = await upload(crew, fakeMp4(300_000));
  assert.equal(await video.dropVideoUpload(other, k4), "denied");
  assert.equal(await video.dropVideoUpload(crew, k4), "ok");
  assert.equal(await video.videoToPost(crew, k4), null);
  assert.equal(await partRows(), 0);
  const k5 = await upload(crew, fakeMp4(300_000));
  const k6 = await upload(other, fakeMp4(PART + 1));
  await client.execute({ sql: "UPDATE message_videos SET created_at = ? WHERE key = ?", args: [new Date(Date.now() - 25 * 3_600_000).toISOString(), k5] });
  await video.sweepVideoUploads();
  assert.equal(await video.videoToPost(crew, k5), null, "an upload nobody posted is cleared after a day");
  assert.ok((await video.videoToPost(other, k6)) !== null, "a fresh one is left alone");
  assert.equal(await partRows(), 2);
  ok("a video taken off before posting is deleted at once; one nobody posted, after a day");

  // ---- the shelf is not bottomless ----
  await client.execute({ sql: "INSERT INTO message_videos (key, posted_by, bytes, parts, created_at) VALUES (?, 'TAdmin', ?, 1, ?)", args: ["a".repeat(32), rules.VIDEO_STORE_MAX_BYTES - 1_000_000, new Date().toISOString()] });
  assert.deepEqual(await video.startVideoUpload(crew, { bytes: 900_000, seconds: 5 }), { ok: false, why: "full" });
  await client.execute("UPDATE message_videos SET deleted = 1 WHERE key = '" + "a".repeat(32) + "'");
  assert.ok((await video.startVideoUpload(crew, { bytes: 900_000, seconds: 5 })).ok);
  ok("past the set total the next upload is refused, so the database's plan is never outgrown");

  // ---- the backup ----
  const backup = await fullBackup();
  assert.ok(!("message_video_parts" in backup) && !("message_videos" in backup), "videos are not in the backup");
  assert.ok(Array.isArray(backup.messages) && backup.messages.length === 4, "removed ones included, as before");
  ok("the backup holds every message and none of the video bytes");

  client.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`# ${n} passed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
