"use client";

import { useEffect, useRef, useState } from "react";
import { fmtVideoLength, fmtVideoSize, VIDEO_MAX_BYTES, VIDEO_MAX_SECONDS, type BoardVideo } from "@/lib/video-rules";
import { dropVideo, sendVideo, UploadProblem } from "@/lib/video-upload";
import { MessageVideo } from "./message-video";

// Pick a video from the phone (or film one). It is made smaller on the phone
// itself (shrink-video.ts), then sent to the site in pieces (video-upload.ts)
// while the message is still being written; the form only carries the key of
// the finished upload. `onBusy` tells the form when not to post yet.

type State =
  | { at: "empty" }
  | { at: "working"; step: string; fraction: number | null }
  | { at: "ready"; key: string; url: string; seconds: number; bytes: number; from: number; asIs: boolean }
  | { at: "problem"; text: string };

const MINUTES = Math.round(VIDEO_MAX_SECONDS / 60);

const PROBLEMS: Record<string, string> = {
  "not-video": "That doesn't look like a video this site can use. Try one straight from the phone's own photos.",
  "no-picture": "That file has sound but no pictures.",
  "too-big": `This phone couldn't make that video small enough to send (it has to end up under ${fmtVideoSize(VIDEO_MAX_BYTES)}). Try a shorter clip.`,
  "signed-out": "You have been signed out. Sign in again, then pick the video once more.",
  full: "The board has no room for more video. Tell Gary.",
  network: "It didn't get through. Check the signal and pick the video again.",
  refused: "The site wouldn't take that video. Try again, or try a different one.",
};

export function MessageVideoInput({ current, onBusy }: { current?: BoardVideo | null; onBusy?: (busy: boolean) => void }) {
  const [state, setState] = useState<State>({ at: "empty" });
  const fileRef = useRef<HTMLInputElement>(null);
  const stop = useRef<AbortController | null>(null);
  const preview = useRef<string | null>(null);

  const busy = state.at === "working";
  useEffect(() => {
    onBusy?.(busy);
  }, [busy, onBusy]);

  // Leaving the page stops whatever is under way and lets the preview's memory go.
  useEffect(
    () => () => {
      stop.current?.abort();
      if (preview.current) URL.revokeObjectURL(preview.current);
    },
    [],
  );

  // The picker keeps hold of the picked file until the video is posted or taken off: on an iPhone the
  // file can be a temporary copy that goes when the picker is cleared, and it may still be needed
  // (a clip that goes up as it is is read from it piece by piece). `again` clears it so the same
  // file can be picked once more.
  function forget(again: boolean) {
    if (preview.current) URL.revokeObjectURL(preview.current);
    preview.current = null;
    if (again && fileRef.current) fileRef.current.value = "";
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    if (state.at === "ready") dropVideo(state.key);
    forget(false);
    const ctl = new AbortController();
    stop.current = ctl;
    setState({ at: "working", step: "Reading the video…", fraction: null });
    try {
      const { readyVideo } = await import("@/lib/shrink-video");
      let shown = "";
      const v = await readyVideo(
        f,
        (stage, fraction) => {
          // a new render for each whole percent, not for each frame the encoder finishes
          const now = `${stage} ${Math.round(fraction * 100)}`;
          if (now === shown || ctl.signal.aborted) return;
          shown = now;
          setState({ at: "working", step: stage === "reading" ? "Reading the video…" : "Making it smaller…", fraction: stage === "reading" ? null : fraction });
        },
        ctl.signal,
      );
      if (ctl.signal.aborted) return;
      setState({ at: "working", step: "Sending…", fraction: 0 });
      const key = await sendVideo(
        v,
        (sent) => {
          if (!ctl.signal.aborted) setState({ at: "working", step: `Sending… ${fmtVideoSize(sent)} of ${fmtVideoSize(v.blob.size)}`, fraction: v.blob.size ? sent / v.blob.size : null });
        },
        ctl.signal,
      );
      if (ctl.signal.aborted) return dropVideo(key);
      preview.current = URL.createObjectURL(v.blob);
      setState({ at: "ready", key, url: preview.current, seconds: v.seconds, bytes: v.blob.size, from: v.from, asIs: v.how === "as-is" });
    } catch (e) {
      if (ctl.signal.aborted) return;
      forget(true);
      const kind = e instanceof UploadProblem ? e.kind : ((e as { kind?: string })?.kind ?? "");
      const seconds = (e as { seconds?: number })?.seconds ?? 0;
      const text = kind === "too-long" ? `That video is ${fmtVideoLength(seconds)} long. The board takes videos of up to ${MINUTES} minutes: trim it in the phone's photos and pick it again.` : (PROBLEMS[kind] ?? "That video couldn't be made ready on this phone. Try again, or try a different one.");
      setState({ at: "problem", text });
    }
  }

  function cancel() {
    stop.current?.abort();
    forget(true);
    setState({ at: "empty" });
  }

  function takeOff() {
    if (state.at === "ready") dropVideo(state.key);
    forget(true);
    setState({ at: "empty" });
  }

  return (
    <div className="stack-sm">
      {state.at === "ready" && (
        <>
          <video className="message-video-preview" src={state.url} controls playsInline preload="metadata" />
          <p className="xs muted" style={{ margin: 0 }}>
            {state.seconds > 0 ? `${fmtVideoLength(state.seconds)} · ` : ""}
            {fmtVideoSize(state.bytes)}
            {state.from > state.bytes * 1.1 ? ` (${fmtVideoSize(state.from)} before it was made smaller)` : ""}. Ready to post.
            {state.asIs ? " This phone couldn't make it smaller, so it goes up as it is, and it may not play on every phone." : ""}
          </p>
        </>
      )}
      {state.at === "empty" && current && <MessageVideo video={current} />}
      {state.at === "working" && (
        <div className="video-working" role="status">
          <div className="small">{state.step}</div>
          <div className="video-working-bar" data-unknown={state.fraction === null ? "" : undefined}>
            <span style={state.fraction === null ? undefined : { width: `${Math.round(state.fraction * 100)}%` }} />
          </div>
          <div className="xs muted">Keep this page open until the video has been sent. You can write the message meanwhile.</div>
          <div>
            <button type="button" className="btn btn-sm" onClick={cancel}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {/* Always there, only out of sight while a video is being made ready: see forget() */}
      <label className="field" hidden={state.at === "working"}>
        <span>{state.at === "ready" ? "The video" : current ? "Change the video" : "Add a video (optional)"}</span>
        <input ref={fileRef} type="file" accept="video/*" onChange={(e) => onFile(e.target.files?.[0])} />
      </label>
      <input type="hidden" name="video" value={state.at === "ready" ? state.key : ""} />
      {state.at === "problem" && (
        <p className="error" style={{ margin: 0 }}>
          {state.text}
        </p>
      )}
      {state.at === "ready" && (
        <div>
          <button type="button" className="btn btn-sm" onClick={takeOff}>
            {current ? "Keep the old video" : "Take the video off"}
          </button>
        </div>
      )}
      {current && state.at !== "ready" && state.at !== "working" && (
        <label className="check-row small">
          <input type="checkbox" name="removeVideo" /> Remove the video
        </label>
      )}
    </div>
  );
}
