"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { RouteProfile } from "@/lib/route";
import { RIDE_DATES, fmtHm, mileAtTime, nearestTown, parseHm, pointAtMile, publicEvents, timeAtMile, type DayResult, type PlanEvent } from "@/lib/plan";
import { Elevation } from "./elevation";
import { RideStrip } from "./ride-strip";
import type { MapProbe } from "./route-plan-map";

const PlanMap = dynamic(() => import("./route-plan-map"), { ssr: false, loading: () => <div className="map" /> });

type Props = {
  profiles: RouteProfile[];
  /** The public timetable at the fixed pace, every stop in. The page lists start, rendezvous and finish; the rest only shape the times. */
  results: DayResult[];
  dayLabels: Record<number, { label: string; start: string; end: string; stravaUrl: string | null }>;
};

export function PublicRoute({ profiles, results, dayLabels }: Props) {
  const [probeDay, setProbeDay] = useState(1);
  const [probeTime, setProbeTime] = useState("12:00");
  const [hover, setHover] = useState<MapProbe>(null);
  const [focusDay, setFocusDay] = useState<number | null>(null);
  const [reachKey, setReachKey] = useState("");

  // On the weekend itself, open at the current moment.
  useEffect(() => {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
    const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const ymd = `${g("year")}-${g("month")}-${g("day")}`;
    const day = Number(Object.keys(RIDE_DATES).find((d) => RIDE_DATES[Number(d)] === ymd));
    if (day) {
      setProbeDay(day);
      setProbeTime(`${g("hour") === "24" ? "00" : g("hour")}:${g("minute")}`);
    }
  }, []);

  const total = profiles.reduce((a, p) => a + p.miles, 0);
  const climb = profiles.reduce((a, p) => a + p.climbFt, 0);

  // ---- the probe: where are they at a time ---------------------------------
  const probeRes = results.find((r) => r.day === probeDay);
  const probeProfile = profiles.find((p) => p.day === probeDay);
  const probeWhere = probeRes ? mileAtTime(probeRes.events, parseHm(probeTime), 60 / probeRes.speedMph) : null;
  const probe: MapProbe = useMemo(() => {
    if (!probeRes || !probeProfile || !probeWhere) return null;
    const p = pointAtMile(probeProfile.points, probeWhere.mile);
    return { day: probeDay, mile: probeWhere.mile, lat: p[1], lon: p[0] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [probeRes, probeProfile, probeTime, probeDay]);
  const probeTown = probeProfile && probe ? nearestTown(probeProfile, probe.mile) : null;
  const stoppedTown = probeProfile && probeWhere?.stopped ? nearestTown(probeProfile, probeWhere.stopped.mile) : null;

  const hoverAt = (day: number) => (mile: number | null) => {
    if (mile == null) return setHover(null);
    const p = profiles.find((x) => x.day === day);
    if (!p) return;
    const pt = pointAtMile(p.points, mile);
    setHover({ day, mile, lat: pt[1], lon: pt[0] });
  };
  const pickOnMap = ({ day, mile }: { day: number; mile: number }) => {
    const r = results.find((x) => x.day === day);
    if (!r) return;
    setProbeDay(day);
    setProbeTime(fmtHm(timeAtMile(r.events, mile, 60 / r.speedMph)));
  };

  // ---- "when do they reach…" -------------------------------------------------
  const reachOptions = useMemo(
    () =>
      results.flatMap((r) => {
        const p = profiles.find((x) => x.day === r.day);
        return [
          ...publicEvents(r.events)
            .filter((e) => e.kind === "named")
            .map((e) => ({ key: `s:${r.day}:${e.mile}`, day: r.day, mile: e.mile, label: `Day ${r.day} · ${e.name} (mile ${e.mile.toFixed(0)})` })),
          ...(p?.towns ?? []).map((t) => ({ key: `t:${r.day}:${t.name}`, day: r.day, mile: t.mile, label: `Day ${r.day} · ${t.name} (mile ${t.mile.toFixed(0)})` })),
        ].sort((a, b) => a.mile - b.mile);
      }),
    [results, profiles],
  );
  const reach = reachOptions.find((o) => o.key === reachKey);
  const reachRes = reach ? results.find((r) => r.day === reach.day) : null;
  const reachTime = reach && reachRes ? timeAtMile(reachRes.events, reach.mile, 60 / reachRes.speedMph) : null;

  return (
    <div className="stack pub-route">
      <section className="card card-lg" aria-label="The ride as a cross-section">
        <RideStrip profiles={profiles} results={results} dayLabels={dayLabels} />
      </section>

      <div className="day-stats">
        <span>
          <b>{Math.round(total)}</b> miles
        </span>
        <span>
          <b>{climb.toLocaleString("en-GB")}</b> ft of climbing
        </span>
      </div>

      <section className="card card-lg pub-probe stack-sm">
        <h2>Where will they be?</h2>
        <div className="form-inline" style={{ alignItems: "end" }}>
          <label className="field" style={{ flex: "0 0 8rem" }}>
            <span>Day</span>
            <select value={probeDay} onChange={(e) => setProbeDay(Number(e.target.value))}>
              <option value={1}>Day 1 · Sat</option>
              <option value={2}>Day 2 · Sun</option>
            </select>
          </label>
          <label className="field" style={{ flex: "0 0 8rem" }}>
            <span>At</span>
            <input type="time" value={probeTime} onChange={(e) => setProbeTime(e.target.value || "12:00")} />
          </label>
          <label className="field" style={{ flex: "1 1 12rem" }}>
            <span>Scrub the day</span>
            <input
              type="range"
              min={probeRes?.start ?? 360}
              max={Math.ceil((probeRes?.finish ?? 1200) / 5) * 5}
              step={5}
              value={parseHm(probeTime)}
              onChange={(e) => setProbeTime(fmtHm(Number(e.target.value)))}
            />
          </label>
        </div>
        {probeWhere && probe && probeRes && (
          <p className="probe-answer">
            {probeWhere.before ? (
              <>
                Not started yet. Day {probeDay} rolls at {fmtHm(probeRes.start)}.
              </>
            ) : probeWhere.after ? (
              <>
                Finished for the day: {probeRes.events[probeRes.events.length - 1]?.name} at about {fmtHm(probeRes.finish)}.
              </>
            ) : probeWhere.stopped ? (
              probeWhere.stopped.kind === "named" ? (
                <>
                  Stopped at <b>{probeWhere.stopped.name}</b>, mile {probeWhere.stopped.mile.toFixed(0)}, away again at {fmtHm(probeWhere.stopped.depart)}.
                </>
              ) : (
                <>
                  A quick stop around <b>mile {probeWhere.stopped.mile.toFixed(0)}</b>
                  {stoppedTown && <> near {stoppedTown.name}</>}, away again at {fmtHm(probeWhere.stopped.depart)}.
                </>
              )
            ) : (
              <>
                Riding, around <b>mile {probe.mile.toFixed(1)}</b>
                {probeTown && (
                  <>
                    , {probeTown.offMi < 0.6 ? "at" : "near"} <b>{probeTown.name}</b>
                  </>
                )}
                . Next: {nextEvent(probeRes.events, probe.mile)}
              </>
            )}
            {parseHm(probeTime) > probeRes.sunset && !probeWhere.before && " · after dark"}{" "}
            <a className="xs" target="_blank" rel="noopener" href={`https://www.google.com/maps/search/?api=1&query=${probe.lat.toFixed(5)},${probe.lon.toFixed(5)}`}>
              Google Maps ↗
            </a>
          </p>
        )}
        <div className="form-inline" style={{ alignItems: "end" }}>
          <label className="field" style={{ flex: "1 1 16rem" }}>
            <span>When do they reach…</span>
            <select value={reachKey} onChange={(e) => setReachKey(e.target.value)}>
              <option value="">a town or a stop</option>
              {reachOptions.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {reach && reachTime != null && reachRes && (
            <p className="probe-answer" style={{ flex: "1 1 12rem" }}>
              <b>{fmtHm(reachTime)}</b> on Day {reach.day}
              {reachTime > reachRes.sunset ? " · after dark" : ""}{" "}
              <button
                className="btn btn-sm btn-quiet"
                onClick={() => {
                  setProbeDay(reach.day);
                  setProbeTime(fmtHm(reachTime));
                }}
              >
                Show on the map
              </button>
            </p>
          )}
        </div>
        <p className="xs muted" style={{ margin: 0 }}>
          A steady 12 mph with the planned stops. Tap anywhere on the route line, or on a day&rsquo;s profile below, to set the moment there.
        </p>
      </section>

      <div className="map pub-map">
        <PlanMap profiles={profiles} results={results} probe={probe} hover={hover} onPick={pickOnMap} focusDay={focusDay} showRoutine={false} />
      </div>
      <p className="xs muted" style={{ margin: 0 }}>
        Day 1 in navy, Day 2 in amber. The green ring is where they expect to be at the time above. Tap a pin for the plan at that point, or anywhere on the line for the mile and the time. The layers button has a cycling map.
      </p>

      {results.map((r) => {
        const p = profiles.find((x) => x.day === r.day)!;
        const d = dayLabels[r.day];
        const listed = publicEvents(r.events);
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
              <span>
                <b>{fmtHm(r.start)}</b> off · <b>~{fmtHm(r.finish)}</b> in
              </span>
            </div>
            <p className="row small" style={{ margin: 0 }}>
              {d?.stravaUrl && (
                <a href={d.stravaUrl} target="_blank" rel="noopener">
                  Route on Strava →
                </a>
              )}
              <a href={`/api/route-geo?day=${r.day}&format=gpx`}>Download the GPX</a>
            </p>
            {p.present && <Elevation profile={p} result={r} onHover={hoverAt(r.day)} onPick={(mile) => pickOnMap({ day: r.day, mile })} showRoutine={false} probeMile={probe?.day === r.day ? probe.mile : null} />}
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Where</th>
                    <th>Mile</th>
                    <th>Planned</th>
                  </tr>
                </thead>
                <tbody>
                  {listed.map((e, i) => (
                    <tr key={i} style={{ cursor: "pointer" }} onClick={() => pickOnMap({ day: r.day, mile: e.mile })}>
                      <td>
                        {e.name}
                        {e.kind === "named" && <span className="xs muted"> · support stop</span>}
                      </td>
                      <td className="mono">{e.mile.toFixed(0)}</td>
                      <td className="mono">
                        {fmtHm(e.arrive)}
                        {e.durMin ? ` – ${fmtHm(e.depart)}` : ""}
                        {e.dark && e.kind !== "start" ? " ☾" : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {r.towns.length > 0 && (
              <details className="towns">
                <summary className="small">Passing through — {r.towns.length} places, with the time they hope to be there</summary>
                <div className="towns-grid">
                  {r.towns.map((t) => (
                    <button key={t.name} className="town" onClick={() => pickOnMap({ day: r.day, mile: t.mile })} data-dark={t.dark || undefined}>
                      <span className="mono">{fmtHm(t.eta)}</span>
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
      <p className="xs muted">
        Times assume a steady 12 mph and the planned stops, and will move on the day: weather, punctures and legs. ☾ means after sunset. Follow the live page on the weekend for where they actually are.
      </p>
    </div>
  );
}

/** What comes next for the public: the next rendezvous or the finish, not the crew's routine stops. */
function nextEvent(events: PlanEvent[], mile: number): string {
  const n = publicEvents(events).find((e) => e.mile > mile + 0.05);
  return n ? `${n.name} at ${fmtHm(n.arrive)} (mile ${n.mile.toFixed(0)})` : "the finish";
}
