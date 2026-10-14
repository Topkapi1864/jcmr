"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { RouteProfile } from "@/lib/route";
import { fmtHm, pointAtMile, type DayResult } from "@/lib/plan";
import { Elevation } from "./elevation";
import type { MapProbe } from "./route-plan-map";

const PlanMap = dynamic(() => import("./route-plan-map"), { ssr: false, loading: () => <div className="map" /> });

type Props = {
  profiles: RouteProfile[];
  /** Start, rendezvous and finish only — the crew's routine stops stay on the crew side. */
  results: DayResult[];
  /** Whether the crew has saved a plan; without one no times are shown. */
  hasPlan: boolean;
  dayLabels: Record<number, { label: string; start: string; end: string; stravaUrl: string | null }>;
};

export function PublicRoute({ profiles, results, hasPlan, dayLabels }: Props) {
  const [probe, setProbe] = useState<MapProbe>(null);
  const [hover, setHover] = useState<MapProbe>(null);
  const [focusDay, setFocusDay] = useState<number | null>(null);

  const setProbeAt = (day: number, mile: number) => {
    const p = profiles.find((x) => x.day === day);
    if (!p) return;
    const pt = pointAtMile(p.points, mile);
    setProbe({ day, mile, lat: pt[1], lon: pt[0] });
  };
  const hoverAt = (day: number) => (mile: number | null) => {
    if (mile == null) return setHover(null);
    const p = profiles.find((x) => x.day === day);
    if (!p) return;
    const pt = pointAtMile(p.points, mile);
    setHover({ day, mile, lat: pt[1], lon: pt[0] });
  };

  const total = profiles.reduce((a, p) => a + p.miles, 0);
  const climb = profiles.reduce((a, p) => a + p.climbFt, 0);

  return (
    <div className="stack pub-route">
      <div className="day-stats">
        <span>
          <b>{Math.round(total)}</b> miles
        </span>
        <span>
          <b>{climb.toLocaleString("en-GB")}</b> ft of climbing
        </span>
      </div>
      <div className="map pub-map">
        <PlanMap profiles={profiles} results={results} probe={probe} hover={hover} onPick={({ day, mile }) => setProbeAt(day, mile)} focusDay={focusDay} />
      </div>
      <p className="xs muted" style={{ margin: 0 }}>
        Day 1 in navy, Day 2 in amber. Tap a pin for the plan at that point, or anywhere on the line to see the mile{hasPlan ? " and when the riders expect to be there" : ""}. The layers button has a cycling map.
      </p>

      {results.map((r) => {
        const p = profiles.find((x) => x.day === r.day)!;
        const d = dayLabels[r.day];
        return (
          <section key={r.day} className="card card-lg day-block" id={`day-${r.day}`}>
            <div className="row-between" style={{ alignItems: "baseline", flexWrap: "wrap", gap: "var(--space-2)" }}>
              <h2 style={{ margin: 0 }}>{d?.label ?? `Day ${r.day}`}</h2>
              <button className="btn btn-sm" onClick={() => setFocusDay(focusDay === r.day ? null : r.day)}>
                {focusDay === r.day ? "Show both days" : "Zoom the map to this day"}
              </button>
            </div>
            <p className="muted" style={{ margin: 0 }}>
              {d?.start} → {d?.end}
            </p>
            <div className="day-stats">
              <span>
                <b>{Math.round(p.miles)}</b> miles
              </span>
              <span>
                <b>{p.climbFt.toLocaleString("en-GB")}</b> ft of climbing
              </span>
              {hasPlan && (
                <span>
                  <b>{fmtHm(r.start)}</b> off · <b>~{fmtHm(r.finish)}</b> in
                </span>
              )}
            </div>
            <p className="row small" style={{ margin: 0 }}>
              {d?.stravaUrl && (
                <a href={d.stravaUrl} target="_blank" rel="noopener">
                  Route on Strava →
                </a>
              )}
              <a href={`/api/route-geo?day=${r.day}&format=gpx`}>Download the GPX</a>
            </p>
            {p.present && <Elevation profile={p} result={r} onHover={hoverAt(r.day)} onPick={(mile) => setProbeAt(r.day, mile)} />}
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Where</th>
                    <th>Mile</th>
                    {hasPlan && <th>Planned</th>}
                  </tr>
                </thead>
                <tbody>
                  {r.events.map((e, i) => (
                    <tr key={i} style={{ cursor: "pointer" }} onClick={() => setProbeAt(r.day, e.mile)}>
                      <td>
                        {e.name}
                        {e.kind === "named" && <span className="xs muted"> · support stop</span>}
                      </td>
                      <td className="mono">{e.mile.toFixed(0)}</td>
                      {hasPlan && (
                        <td className="mono">
                          {fmtHm(e.arrive)}
                          {e.durMin ? ` – ${fmtHm(e.depart)}` : ""}
                          {e.dark && e.kind !== "start" ? " ☾" : ""}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {r.towns.length > 0 && (
              <details className="towns">
                <summary className="small">Passing through — {r.towns.length} places{hasPlan ? ", with the time they hope to be there" : ""}</summary>
                <div className="towns-grid">
                  {r.towns.map((t) => (
                    <button key={t.name} className="town" onClick={() => setProbeAt(r.day, t.mile)} data-dark={(hasPlan && t.dark) || undefined}>
                      <span className="mono">{hasPlan ? fmtHm(t.eta) : ""}</span>
                      <span>
                        {t.name}
                        {t.offMi > 0.6 && <em className="xs muted"> ({t.offMi} mi off)</em>}
                      </span>
                      <span className="xs muted mono">mi {t.mile}</span>
                    </button>
                  ))}
                </div>
              </details>
            )}
          </section>
        );
      })}
      {hasPlan && (
        <p className="xs muted">
          Times are the crew&rsquo;s plan and will move on the day — weather, punctures and legs. ☾ means after sunset. Follow the live page on the weekend for where they actually are.
        </p>
      )}
    </div>
  );
}
