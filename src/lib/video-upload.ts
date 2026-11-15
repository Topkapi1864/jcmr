// In the browser: send a video that is ready (shrink-video.ts) to the board,
// and fetch one back to play it. Both go piece by piece: no single request is
// bigger than VIDEO_PART_BYTES, so a phone on a poor signal only ever has to
// repeat the piece that failed. The routes are under /api/messages/video.
import type { BoardVideo } from "./video-rules";

export type UploadProblemKind = "signed-out" | "full" | "too-big" | "too-long" | "not-video" | "network" | "cancelled" | "refused";

export class UploadProblem extends Error {
  constructor(public kind: UploadProblemKind) {
    super(kind);
  }
}

const SEND_AT_ONCE = 3;
const FETCH_AT_ONCE = 6;
const TRIES = 4;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A request that is tried again when the network drops or the server stumbles, but not when the server says no. */
async function steady(url: string, init: RequestInit, signal: AbortSignal): Promise<Response> {
  let last: unknown = null;
  for (let i = 0; i < TRIES; i++) {
    if (signal.aborted) throw new UploadProblem("cancelled");
    try {
      const r = await fetch(url, { ...init, signal });
      if (r.status < 500 && r.status !== 408 && r.status !== 429) return r;
      last = new Error(String(r.status));
    } catch (e) {
      if (signal.aborted) throw new UploadProblem("cancelled");
      last = e;
    }
    if (i < TRIES - 1) await wait(600 * 2 ** i);
  }
  throw last instanceof UploadProblem ? last : new UploadProblem("network");
}

async function refusal(r: Response): Promise<UploadProblem> {
  const why = await r
    .json()
    .then((j: { error?: string }) => j.error ?? "")
    .catch(() => "");
  return new UploadProblem(why === "signed-out" || why === "full" || why === "too-big" || why === "too-long" || why === "not-video" ? why : "refused");
}

/** Runs `job` over 0…count-1, a few at a time. The first failure stops the rest. */
async function inTurn(count: number, atOnce: number, job: (n: number) => Promise<void>): Promise<void> {
  let next = 0;
  let failed: unknown = null;
  await Promise.all(
    Array.from({ length: Math.min(atOnce, count) }, async () => {
      while (next < count && !failed) {
        const n = next++;
        try {
          await job(n);
        } catch (e) {
          failed ??= e;
        }
      }
    }),
  );
  if (failed) throw failed;
}

/** Sends a ready video. Resolves to the key the message form posts; `onProgress` is called with the bytes safely there. */
export async function sendVideo(v: { blob: Blob; seconds: number; width: number; height: number; poster: string | null }, onProgress: (sent: number) => void, signal: AbortSignal): Promise<string> {
  const start = await steady("/api/messages/video", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ bytes: v.blob.size, seconds: v.seconds, width: v.width, height: v.height, poster: v.poster ?? "" }) }, signal);
  if (!start.ok) throw await refusal(start);
  const { key, parts, partBytes } = (await start.json()) as { key: string; parts: number; partBytes: number };
  const at = `/api/messages/video/${key}`;
  try {
    let sent = 0;
    onProgress(0);
    await inTurn(parts, SEND_AT_ONCE, async (n) => {
      const piece = v.blob.slice(n * partBytes, (n + 1) * partBytes);
      const r = await steady(`${at}/${n}`, { method: "PUT", headers: { "content-type": "application/octet-stream" }, body: piece }, signal);
      if (!r.ok) throw await refusal(r);
      sent += piece.size;
      onProgress(sent);
    });
    const done = await steady(at, { method: "POST" }, signal);
    if (!done.ok) throw await refusal(done);
    return key;
  } catch (e) {
    dropVideo(key);
    throw e instanceof UploadProblem ? e : new UploadProblem("network");
  }
}

/** Takes an unposted upload off again. Best effort: anything left behind is cleared by the site after a day. */
export function dropVideo(key: string): void {
  void fetch(`/api/messages/video/${key}`, { method: "DELETE", keepalive: true }).catch(() => {});
}

/** Fetches a board video's pieces and puts them back together. `onProgress` is called with the bytes received so far. */
export async function fetchVideo(v: BoardVideo, onProgress: (got: number) => void, signal: AbortSignal): Promise<Blob> {
  const pieces: ArrayBuffer[] = new Array(v.parts);
  const sizes: number[] = new Array(v.parts).fill(0);
  const report = () => onProgress(sizes.reduce((a, b) => a + b, 0));
  const piece = async (n: number): Promise<ArrayBuffer> => {
    const r = await steady(`${v.src}/${n}`, {}, signal);
    if (!r.ok) throw new UploadProblem("refused");
    const body = r.body?.getReader();
    if (!body) return r.arrayBuffer();
    // Read as it arrives, so the progress moves within a piece and not only between them.
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await body.read();
      if (done) break;
      chunks.push(value);
      sizes[n] += value.byteLength;
      report();
    }
    return new Blob(chunks as BlobPart[]).arrayBuffer();
  };
  await inTurn(v.parts, FETCH_AT_ONCE, async (n) => {
    for (let attempt = 0; ; attempt++) {
      sizes[n] = 0;
      try {
        pieces[n] = await piece(n);
        sizes[n] = pieces[n].byteLength;
        report();
        return;
      } catch (e) {
        // A piece that broke off half way is asked for once more; a piece the site refuses is not.
        if (signal.aborted) throw new UploadProblem("cancelled");
        if (attempt >= 1 || (e instanceof UploadProblem && e.kind === "refused")) throw e;
      }
    }
  });
  const blob = new Blob(pieces, { type: v.type || "video/mp4" });
  if (v.bytes && blob.size !== v.bytes) throw new UploadProblem("network");
  return blob;
}
