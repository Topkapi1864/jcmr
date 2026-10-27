"use client";

import { useEffect, useState } from "react";
import type { LivePayload } from "@/lib/live";
import { RouteMap } from "./route-map";
import { MessageBody } from "./message-body";

// The "Follow the Ride" live card from the design handoff: status line, big
// miles, where they are, next stop + ETA, progress bar with the overnight
// tick, and the map. Polls /api/live every 60 s; keeps the last good data.

const POLL_MS = 60_000;
const FRAME_RELOAD_MS = 5 * 60_000;

export function hhmm(iso: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

function ageMins(iso: string | null, now: number) {
  return iso ? Math.max(0, Math.round((now - Date.parse(iso)) / 60_000)) : null;
}

export function useLive(initial: LivePayload) {
  const [data, setData] = useState<LivePayload>(initial);
  const [offline, setOffline] = useState(false);
  const [now, setNow] = useState<number>(() => Date.parse(initial.now));
  const [frameKey, setFrameKey] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    const poll = async () => {
      try {
        const r = await fetch("/api/live", { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        setData(await r.json());
        setOffline(false);
      } catch {
        setOffline(true);
      }
    };
    const p = setInterval(poll, POLL_MS);
    const f = setInterval(() => setFrameKey((k) => k + 1), FRAME_RELOAD_MS);
    return () => {
      clearInterval(tick);
      clearInterval(p);
      clearInterval(f);
    };
  }, []);
  return { data, offline, now, frameKey };
}

export function FollowLive({ initial, showLinks }: { initial: LivePayload; showLinks?: boolean }) {
  const { data, offline, now, frameKey } = useLive(initial);
  const st = data.status;
  const mins = ageMins(st?.postedAt ?? null, now);
  const level = data.phase === "pre" || data.phase === "finished" ? "none" : mins === null ? "none" : mins >= 90 ? "red" : mins >= 45 ? "amber" : "live";
  const dayWord = data.day ? `Day ${data.day} · ${data.day === 1 ? "Sat 14 Nov" : "Sun 15 Nov"}` : "14–15 Nov 2026";
  const primary = data.links.find((l) => l.primary) ?? data.links[0] ?? null;
  const framed = data.mode === "single" ? (primary?.frameable ? primary : null) : (data.links.find((l) => l.frameable) ?? null);
  const pct = Math.min(100, (data.mile / data.totalMiles) * 100);
  const nightPct = (data.overnightMile / data.totalMiles) * 100;

  const headline =
    data.phase === "pre"
      ? `Before the start · ${data.daysToGo === 0 ? "today" : data.daysToGo === 1 ? "tomorrow" : `${data.daysToGo} days to go`}`
      : data.phase === "finished"
        ? "Finished · Yeadon Cemetery"
        : data.phase === "overnight"
          ? `Overnight · ${dayWord}`
          : `Live · ${dayWord}`;
  const posted = st ? ` · posted ${mins === null ? "" : mins < 1 ? "just now" : mins < 60 ? `${mins} min ago` : `${Math.floor(mins / 60)} h ${mins % 60} min ago`}` : "";
  const where = st
    ? `${st.place ? `${st.place} — ` : ""}${st.text}`
    : data.phase === "pre"
      ? `Leaving ${data.labels.start.replace(/, Sat 07:00$/, "")} at 07:00 on Saturday 14 November.`
      : "Waiting for the first update from the road.";

  return (
    <>
      <section className="live-card">
        <div className="live-card-head">
          <div style={{ minWidth: 0 }}>
            <div className="label">
              <span className="live-dot" data-level={level} />
              {headline}
              {posted}
              {offline ? " · offline" : ""}
            </div>
            <div className="live-miles">
              <span className="big">{data.mile.toFixed(1)}</span>
              <span className="of">of {data.totalMiles} miles</span>
            </div>
            <div className="live-where">{where}</div>
            {st && (
              <div className="small muted" style={{ marginTop: 4 }}>
                {hhmm(st.postedAt)} · {st.postedBy}, {st.who}
              </div>
            )}
          </div>
          <div className="live-next">
            <div className="label">{data.phase === "finished" ? "Finished at" : data.phase === "pre" ? "First stop" : "Next stop"}</div>
            <div className="name">{data.nextStop ? data.nextStop.name : data.phase === "finished" ? "Yeadon Cemetery" : data.phase === "pre" ? data.labels.start.replace(/, Sat 07:00$/, "") : "—"}</div>
            <div className="when">{data.nextStop?.plannedTime ? `about ${data.nextStop.plannedTime}` : data.phase === "pre" ? "07:00 Sat" : ""}</div>
          </div>
        </div>
        <div className="live-progress">
          <div className="bar">
            <div className="fill" style={{ width: `${pct}%` }} />
            <div className="tick" style={{ left: `${nightPct}%` }} />
          </div>
          <div className="marks">
            <span>{data.labels.start}</span>
            <span>{data.labels.overnight}</span>
            <span>{data.labels.finish}</span>
          </div>
        </div>
        {framed ? (
          <iframe key={frameKey} className="live-frame" src={framed.url} title={`Live map — ${framed.label}`} />
        ) : data.hasRoute ? (
          <div className="live-frame live-map">
            <RouteMap />
          </div>
        ) : (
          <div className="live-frame live-map-empty">
            <div>
              <div className="label">Route map</div>
              <div>Barnes → Loughborough → Yeadon. The map appears here once the route is final; live positions on the day.</div>
            </div>
          </div>
        )}
        {showLinks && data.links.length > 0 && (
          <div className="live-actions">
            {data.links
              .filter((l) => l !== framed)
              .map((l) => (
                <a key={l.id} className="btn" href={l.url} target="_blank" rel="noopener">
                  {l.label} · {l.provider} ↗
                </a>
              ))}
          </div>
        )}
      </section>
      <p className="xs muted" style={{ marginTop: 10 }}>
        {data.links.length ? "Positions come from the riders’ own live-tracking links. " : ""}
        The crew post a line and the miles at every stop.
      </p>
    </>
  );
}

function dayShort(iso: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short" }).format(new Date(iso));
}

// The board: the crew's messages and, on the day, the road's status lines,
// pinned first then newest first. Longer boards fold after `fold` entries.
export function Updates({ initial, fold = 6 }: { initial: LivePayload; fold?: number }) {
  const { data } = useLive(initial);
  const [open, setOpen] = useState(false);
  const list = data.updates;
  const shown = open || list.length <= fold + 1 ? list : list.slice(0, fold);
  const hidden = list.length - shown.length;
  return (
    <div>
      <div className="small muted" style={{ marginBottom: 10 }}>
        {list.length ? `${list.length} message${list.length === 1 ? "" : "s"} so far` : "Nothing posted yet. The crew write here before the ride, and from the road on the day."}
      </div>
      {shown.map((m) => (
        <div key={m.id} className="update" data-kind={m.kind} data-pinned={m.pinned ? "" : undefined}>
          <div>
            <div className="mono time">{hhmm(m.postedAt)}</div>
            <div className="mono xs muted">{m.mile != null ? `${m.mile} mi` : dayShort(m.postedAt)}</div>
          </div>
          <div>
            {m.kind === "message" ? (
              <MessageBody text={m.text} className="text" />
            ) : (
              <div className="text">
                {m.place && <b>{m.place} — </b>}
                {m.text}
              </div>
            )}
            <div className="xs muted">
              {m.postedBy}, {m.who}
              {m.pinned ? " · pinned" : ""}
              {m.edited ? " · edited" : ""}
            </div>
          </div>
        </div>
      ))}
      {hidden > 0 && (
        <button type="button" className="btn btn-sm" style={{ marginTop: 12 }} onClick={() => setOpen(true)}>
          Show {hidden} earlier
        </button>
      )}
    </div>
  );
}
