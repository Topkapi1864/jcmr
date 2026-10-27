"use client";

import { useEffect, useRef, useState } from "react";
import type { LivePayload } from "@/lib/live";
import { JUSTGIVING_URL } from "@/lib/constants";

// §4.6. One component, two forms: the phone page and the TV page. It polls
// /api/live every 60 s, keeps the last good data if the network drops, shows
// how old the status line is (amber at 45 min, red at 90), reloads any framed
// map every 5 min, and on the TV asks for a screen wake lock.

const POLL_MS = 60_000;
const FRAME_RELOAD_MS = 5 * 60_000;

function ageOf(iso: string | null, now: number) {
  if (!iso) return { mins: null as number | null, level: "none" as const, text: "" };
  const mins = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  const level = mins >= 90 ? "red" : mins >= 45 ? "amber" : "none";
  const text = mins < 1 ? "just now" : mins < 60 ? `${mins} min ago` : `${Math.floor(mins / 60)} h ${mins % 60} min ago`;
  return { mins, level, text } as const;
}

function hhmm(iso: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export function LiveView({ initial, tv }: { initial: LivePayload; tv: boolean }) {
  const [data, setData] = useState<LivePayload>(initial);
  const [lastUpdated, setLastUpdated] = useState<number>(() => Date.parse(initial.now));
  const [offline, setOffline] = useState(false);
  const [now, setNow] = useState<number>(() => Date.now());
  const [frameKey, setFrameKey] = useState(0);
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    const poll = async () => {
      try {
        const r = await fetch("/api/live", { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        setData(await r.json());
        setLastUpdated(Date.now());
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

  useEffect(() => {
    if (!tv) return;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    const ask = async () => {
      try {
        wakeLock.current = (await nav.wakeLock?.request("screen")) ?? null;
      } catch {
        /* not granted; nothing to do */
      }
    };
    ask();
    const onVis = () => document.visibilityState === "visible" && ask();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      wakeLock.current?.release().catch(() => {});
    };
  }, [tv]);

  const age = ageOf(data.status?.postedAt ?? null, now);
  const primary = data.links.find((l) => l.primary) ?? data.links[0] ?? null;
  const framed = data.mode === "single" ? (primary?.frameable ? primary : null) : (data.links.find((l) => l.frameable) ?? null);
  const dayLabel = data.day ? `Day ${data.day}` : "The ride";
  const pounds = (n: number | null) => (n === null ? "—" : "£" + n.toLocaleString("en-GB"));

  if (tv) {
    return (
      <div className="tv">
        <div className="tv-head">
          <span>
            {dayLabel} · The Janet Channon Memorial Ride
          </span>
          <span className="tv-age" data-level={age.level}>
            {data.status ? `posted ${age.text}` : ""}
            {offline ? ` · last updated ${hhmm(new Date(lastUpdated).toISOString())}` : ""}
          </span>
        </div>
        <div className="stack">
          <div className="tv-status">{data.status ? data.status.text : "Waiting for the first update from the road."}</div>
          {data.status && (
            <div className="tv-sub">
              {data.status.place && `${data.status.place} · `}
              {hhmm(data.status.postedAt)} · {data.status.postedBy}
            </div>
          )}
          {framed && <iframe key={frameKey} className="tv-frame" src={framed.url} title={`Live map — ${framed.label}`} />}
          {!framed && primary && (
            <div className="tv-sub">
              Live map (won&rsquo;t frame — open in another tab): <a href={primary.url}>{primary.label}</a>
            </div>
          )}
        </div>
        <div className="tv-foot">
          <span>
            Raised so far <span className="total">{pounds(data.total.amount)}</span>
          </span>
          <span>{data.nextStop ? `Next: ${data.nextStop.name}${data.nextStop.plannedTime ? ` ~${data.nextStop.plannedTime}` : ""}` : "justgiving.com"}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="stack section">
      <section className="live-card">
        <div className="live-card-head">
          <div>
            <div className="label">
              <span className="live-dot" data-level={data.status ? (age.level === "none" ? "live" : age.level) : "none"} />
              {dayLabel}
              {data.status ? ` · posted ${age.text}` : ""}
              {offline ? ` · offline, last updated ${hhmm(new Date(lastUpdated).toISOString())}` : ""}
            </div>
            <div className="live-status">{data.status ? data.status.text : "Waiting for the first update from the road."}</div>
            {data.status && (
              <div className="small muted">
                {data.status.place && `${data.status.place} · `}
                {hhmm(data.status.postedAt)} · {data.status.postedBy}, {data.status.who}
              </div>
            )}
          </div>
          {data.nextStop && (
            <div className="live-next">
              <div className="label">Next planned stop</div>
              <div className="name">{data.nextStop.name}</div>
              {data.nextStop.plannedTime && <div className="when">about {data.nextStop.plannedTime}</div>}
            </div>
          )}
        </div>
        {framed && <iframe key={frameKey} className="live-frame" src={framed.url} title={`Live map — ${framed.label}`} />}
        <div className="live-actions">
          {data.links.length === 0 && <p className="muted small" style={{ margin: 0 }}>No live map link yet. It appears here once the riders set off.</p>}
          {data.mode === "single" && primary && !framed && (
            <a className="btn btn-primary" href={primary.url} target="_blank" rel="noopener">
              Open the live map{primary.rider ? ` — ${primary.rider}` : ""}
            </a>
          )}
          {data.links
            .filter((l) => data.mode === "all" || (!l.primary && l !== framed))
            .map((l) => (
              <a key={l.id} className="btn" href={l.url} target="_blank" rel="noopener">
                {l.label} · {l.provider}
              </a>
            ))}
        </div>
      </section>
      <p className="small muted">Positions come from the riders&rsquo; own live-tracking links and open in the provider&rsquo;s page. The crew post a line at every stop.</p>

      <section className="donate-card" style={{ maxWidth: "32rem" }}>
        <div className="label">Raised so far</div>
        <div className="total" style={{ color: "var(--duck-egg)", margin: "8px 0 14px" }}>{pounds(data.total.amount)}</div>
        <a className="btn-donate btn-donate-big" href={JUSTGIVING_URL} target="_blank" rel="noopener">
          Give on JustGiving
        </a>
      </section>
    </div>
  );
}
