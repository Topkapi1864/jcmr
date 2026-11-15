"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { fmtVideoLength, fmtVideoSize, type BoardVideo } from "@/lib/video-rules";
import { fetchVideo } from "@/lib/video-upload";

// A video posted with a message, on the public board and in Crew → Messages.
// Until it is tapped it is a still with a play mark, its length and its size,
// and nothing of the video itself has been fetched. A tap fetches its pieces
// (the bar along the bottom shows how far), puts them together and plays it in
// the same box, with the phone's own controls.

type Phase = { at: "still" } | { at: "loading"; got: number } | { at: "playing"; url: string } | { at: "failed" };

export function MessageVideo({ video }: { video: BoardVideo }) {
  const [phase, setPhase] = useState<Phase>({ at: "still" });
  const el = useRef<HTMLVideoElement>(null);
  const stop = useRef<AbortController | null>(null);
  const url = phase.at === "playing" ? phase.url : null;

  // Leaving the page stops a fetch that is under way and lets the video's memory go.
  const made = useRef<string | null>(null);
  useEffect(
    () => () => {
      stop.current?.abort();
      if (made.current) URL.revokeObjectURL(made.current);
    },
    [],
  );

  // Start it once it is together. A phone that wants one more tap has the controls to take it.
  useEffect(() => {
    if (url) el.current?.play().catch(() => {});
  }, [url]);

  async function start() {
    if (phase.at === "loading") return;
    // Inside the tap itself: an iPhone only lets a video start with its sound if a person asked this very player for it.
    el.current?.play().catch(() => {});
    const ctl = new AbortController();
    stop.current = ctl;
    setPhase({ at: "loading", got: 0 });
    let shown = 0;
    try {
      const blob = await fetchVideo(
        video,
        (got) => {
          // a new render for each whole percent, not for each packet that arrives
          const pct = video.bytes > 0 ? Math.floor((got / video.bytes) * 100) : 0;
          if (pct === shown) return;
          shown = pct;
          setPhase({ at: "loading", got });
        },
        ctl.signal,
      );
      if (ctl.signal.aborted) return;
      made.current = URL.createObjectURL(blob);
      setPhase({ at: "playing", url: made.current });
    } catch {
      if (!ctl.signal.aborted) setPhase({ at: "failed" });
    }
  }

  const ratio = video.width > 0 && video.height > 0 ? video.width / video.height : 16 / 9;
  const facts = [video.seconds > 0 ? fmtVideoLength(video.seconds) : "", fmtVideoSize(video.bytes)].filter(Boolean).join(" · ");
  const pct = phase.at === "loading" && video.bytes > 0 ? Math.min(100, Math.round((phase.got / video.bytes) * 100)) : 0;

  return (
    <div className="message-video" style={{ "--ar": String(ratio) } as CSSProperties} data-at={phase.at}>
      <video ref={el} src={url ?? undefined} controls={!!url} playsInline preload="auto" aria-label="A video posted with this message" />
      {!url && (
        <button type="button" className="message-video-still" onClick={start} aria-label={phase.at === "loading" ? `Loading the video, ${pct}%` : `Play the video (${facts})`}>
          {video.poster && <img src={video.poster} alt="" loading="lazy" decoding="async" />}
          {phase.at === "loading" ? (
            <span className="message-video-note" aria-hidden="true">
              Loading {pct}%
            </span>
          ) : phase.at === "failed" ? (
            <span className="message-video-note" aria-hidden="true">
              It didn&rsquo;t load. Tap to try again.
            </span>
          ) : (
            <span className="message-video-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="26" height="26">
                <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
              </svg>
            </span>
          )}
          <span className="message-video-facts" aria-hidden="true">
            {facts}
          </span>
          {phase.at === "loading" && (
            <span className="message-video-bar" aria-hidden="true">
              <span style={{ width: `${pct}%` }} />
            </span>
          )}
        </button>
      )}
    </div>
  );
}
