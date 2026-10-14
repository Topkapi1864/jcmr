"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import type { RouteProfile } from "@/lib/route";
import {
  DEFAULT_PLAN,
  decodePlan,
  encodePlan,
  fmtDur,
  fmtHm,
  mileAtTime,
  normalisePlan,
  parseHm,
  planAll,
  pointAtMile,
  timeAtMile,
  timetableText,
  type DayResult,
  type Plan,
  type PlanEvent,
  type SavedPlan,
} from "@/lib/plan";
import { savePlanAction } from "@/app/crew/actions";
import { Elevation } from "./elevation";
import type { MapProbe } from "./route-plan-map";

const PlanMap = dynamic(() => import("./route-plan-map"), { ssr: false, loading: () => <div className="map" /> });

const DRAFT_KEY = "jcmr.route.plan.draft";

type Props = { profiles: RouteProfile[]; initial: Plan; saved: SavedPlan; me: string; isAdmin: boolean };

const KIND_LABEL: Record<PlanEvent["kind"], string> = { start: "Start", short: "Short stop", long: "Long stop", halfway: "Halfway", named: "Rendezvous", finish: "Finish" };

export function RoutePlanner({ profiles, initial, saved: savedIn, me }: Props) {
  const [plan, setPlan] = useState<Plan>(initial);
  const [saved, setSaved] = useState<SavedPlan>(savedIn);
  const [dirty, setDirty] = useState(false);
  const [loadedFrom, setLoadedFrom] = useState<"saved" | "draft" | "link" | "defaults">(savedIn ? "saved" : "defaults");
  const [probeDay, setProbeDay] = useState(1);
  const [probeTime, setProbeTime] = useState("12:00");
  const [hover, setHover] = useState<MapProbe>(null);
  const [focusDay, setFocusDay] = useState<number | null>(null);
  const [reachKey, setReachKey] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const first = useRef(true);

  const results = useMemo(() => planAll(plan, profiles), [plan, profiles]);

  // A shared link (#p=…) or a local draft wins over the saved plan on first paint.
  useEffect(() => {
    if (!first.current) return;
    first.current = false;
    const hash = typeof location !== "undefined" ? location.hash : "";
    const m = /#p=([A-Za-z0-9_-]+)/.exec(hash);
    if (m) {
      const p = decodePlan(m[1]);
      if (p) {
        setPlan(withCandidates(p, initial));
        setDirty(true);
        setLoadedFrom("link");
        history.replaceState(null, "", location.pathname);
        return;
      }
    }
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const j = JSON.parse(raw) as { plan: unknown; at: string; savedAt?: string };
        // Only keep a draft newer than the saved plan.
        if (!savedIn || j.at > savedIn.savedAt) {
          setPlan(withCandidates(normalisePlan(j.plan), initial));
          setDirty(true);
          setLoadedFrom("draft");
        }
      }
    } catch {
      /* no draft */
    }
  }, [initial, savedIn]);

  const update = (fn: (p: Plan) => Plan) => {
    setPlan((p) => {
      const n = fn(p);
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ plan: n, at: new Date().toISOString() }));
      } catch {
        /* private mode */
      }
      return n;
    });
    setDirty(true);
  };

  const say = (s: string) => {
    setFlash(s);
    setTimeout(() => setFlash(null), 2500);
  };

  const save = () =>
    startTransition(async () => {
      const times = results.flatMap((r) => r.events.filter((e) => e.kind === "named" && e.key).map((e) => ({ key: e.key!, time: fmtHm(e.arrive) })));
      for (const r of results) times.push({ key: `start:${r.day}`, time: fmtHm(r.start) }, { key: `end:${r.day}`, time: fmtHm(r.finish) });
      // Stops switched off lose their planned time.
      for (const s of plan.namedStops) if (!s.enabled && s.key.startsWith("db:")) times.push({ key: s.key, time: "" });
      const r = await savePlanAction(JSON.stringify(plan), times);
      setSaved({ plan, savedBy: r.savedBy, savedAt: r.savedAt });
      setDirty(false);
      setLoadedFrom("saved");
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ignore */
      }
      say("Saved — the public route page now shows these times.");
    });

  const share = async () => {
    const url = `${location.origin}${location.pathname}#p=${encodePlan(plan)}`;
    try {
      await navigator.clipboard.writeText(url);
      say("Link to this scenario copied.");
    } catch {
      prompt("Copy this link", url);
    }
  };
  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(timetableText(results));
      say("Timetable copied — paste it into WhatsApp.");
    } catch {
      prompt("Copy the timetable", timetableText(results));
    }
  };
  const revert = () => {
    setPlan(saved ? withCandidates(saved.plan, initial) : withCandidates({ ...DEFAULT_PLAN, namedStops: [] }, initial));
    setDirty(false);
    setLoadedFrom(saved ? "saved" : "defaults");
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
  };

  // ---- the probe: where are we at a time -----------------------------------
  const probeRes = results.find((r) => r.day === probeDay);
  const probeProfile = profiles.find((p) => p.day === probeDay);
  const probe: MapProbe = useMemo(() => {
    if (!probeRes || !probeProfile) return null;
    const t = parseHm(probeTime);
    const w = mileAtTime(probeRes.events, t, 60 / probeRes.speedMph);
    const p = pointAtMile(probeProfile.points, w.mile);
    return { day: probeDay, mile: w.mile, lat: p[1], lon: p[0] };
  }, [probeRes, probeProfile, probeTime, probeDay]);
  const probeWhere = probeRes ? mileAtTime(probeRes.events, parseHm(probeTime), 60 / probeRes.speedMph) : null;
  const probeTown = probeProfile && probe ? nearestTown(probeProfile, probe.mile) : null;

  const hoverProbe = (day: number) => (mile: number | null) => {
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

  // ---- "when do we reach…" -------------------------------------------------
  const reachOptions = useMemo(
    () =>
      profiles.flatMap((p) => [
        ...p.waypoints.map((w) => ({ key: `w:${p.day}:${w.mile}`, day: p.day, mile: w.mile, label: `Day ${p.day} · ${w.name} (mile ${w.mile})` })),
        ...p.towns.map((t) => ({ key: `t:${p.day}:${t.name}`, day: p.day, mile: t.mile, label: `Day ${p.day} · ${t.name} (mile ${t.mile})` })),
      ]),
    [profiles],
  );
  const reach = reachOptions.find((o) => o.key === reachKey);
  const reachRes = reach ? results.find((r) => r.day === reach.day) : null;
  const reachTime = reach && reachRes ? timeAtMile(reachRes.events, reach.mile, 60 / reachRes.speedMph) : null;

  const totalMiles = results.reduce((a, r) => a + r.miles, 0);

  return (
    <div className="planner">
      <header className="planner-head">
        <div>
          <h1>Route &amp; timeline</h1>
          <p className="small muted" style={{ margin: 0 }}>
            {Math.round(totalMiles)} miles over two days. Move the sliders and every time on the page moves with them.
            {saved ? (
              <>
                {" "}
                Crew plan saved by <b>{saved.savedBy}</b>, {fmtWhen(saved.savedAt)}.
              </>
            ) : (
              <> No plan saved yet — this is Simon&rsquo;s roadbook as a starting point.</>
            )}
            {loadedFrom === "draft" && <> You&rsquo;re looking at your own unsaved draft.</>}
            {loadedFrom === "link" && <> You&rsquo;re looking at a shared scenario.</>}
          </p>
        </div>
        <div className="planner-actions">
          <button className="btn btn-primary" onClick={save} disabled={pending || (!dirty && !!saved)} title="Everyone sees this plan; the public route page shows the times">
            {pending ? "Saving…" : dirty || !saved ? "Save as the crew plan" : "Saved"}
          </button>
          <button className="btn" onClick={share}>
            Share scenario
          </button>
          <button className="btn" onClick={copyText}>
            Copy timetable
          </button>
          <button className="btn" onClick={() => window.print()}>
            Print
          </button>
          {dirty && (
            <button className="btn btn-quiet" onClick={revert}>
              Back to {saved ? "the saved plan" : "defaults"}
            </button>
          )}
        </div>
      </header>
      {flash && <p className="notice planner-flash">{flash}</p>}
      {!profiles.every((p) => p.present) && (
        <p className="notice planner-warn small">
          {profiles
            .filter((p) => !p.present)
            .map((p) => `Day ${p.day}`)
            .join(" and ")}{" "}
          GPX not in yet — the dashed line and its miles are a schematic from Simon&rsquo;s roadbook. Timings still work; the map and elevation fill in when the file lands in <code>content/route/</code>.
        </p>
      )}

      <div className="planner-tiles">
        {results.map((r) => (
          <DayTile key={r.day} r={r} onFocus={() => setFocusDay(focusDay === r.day ? null : r.day)} focused={focusDay === r.day} />
        ))}
      </div>

      <div className="planner-grid">
        <aside className="planner-controls stack">
          <section className="card stack-sm">
            <h2>Pace</h2>
            <label className="field">
              <span>
                Moving average · <b className="mono">{plan.speedMph.toFixed(1)} mph</b>
              </span>
              <input type="range" min={8} max={18} step={0.5} value={plan.speedMph} onChange={(e) => update((p) => ({ ...p, speedMph: Number(e.target.value) }))} />
            </label>
            <p className="xs muted" style={{ margin: 0 }}>
              Moving speed, not the day&rsquo;s average — stops are added on top. Simon&rsquo;s roadbook assumed 12.
            </p>
            {[1, 2].map((d) => (
              <div key={d} className="form-inline" style={{ alignItems: "end" }}>
                <label className="field" style={{ flex: "0 0 8rem" }}>
                  <span>Day {d} start</span>
                  <input type="time" value={plan.days[d]?.start ?? "07:00"} onChange={(e) => update((p) => ({ ...p, days: { ...p.days, [d]: { ...p.days[d], start: e.target.value || "07:00" } } }))} />
                </label>
                <label className="field" style={{ flex: "1 1 8rem" }}>
                  <span>Day {d} speed</span>
                  <select value={plan.days[d]?.speedMph ?? ""} onChange={(e) => update((p) => ({ ...p, days: { ...p.days, [d]: { ...p.days[d], speedMph: e.target.value ? Number(e.target.value) : null } } }))}>
                    <option value="">same ({plan.speedMph.toFixed(1)})</option>
                    {range(8, 18, 0.5).map((v) => (
                      <option key={v} value={v}>
                        {v.toFixed(1)} mph
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ))}
          </section>

          <section className="card stack-sm">
            <h2>Routine stops</h2>
            <RuleRow
              label="Short stop"
              hint="bottles, a wee, a gel"
              rule={plan.shortStop}
              onChange={(r) => update((p) => ({ ...p, shortStop: r }))}
            />
            <RuleRow label="Long stop" hint="food, dry gloves, lights" rule={plan.longStop} onChange={(r) => update((p) => ({ ...p, longStop: r }))} />
            <div className="rule">
              <label className="check">
                <input type="checkbox" checked={plan.halfway.enabled} onChange={(e) => update((p) => ({ ...p, halfway: { ...p.halfway, enabled: e.target.checked } }))} />
                <span>Halfway break</span>
              </label>
              <span className="rule-fields">
                <input type="number" min={1} max={180} value={plan.halfway.durMin} onChange={(e) => update((p) => ({ ...p, halfway: { ...p.halfway, durMin: Number(e.target.value) || 1 } }))} /> min
              </span>
            </div>
            <label className="check">
              <input type="checkbox" checked={plan.namedResetsClock} onChange={(e) => update((p) => ({ ...p, namedResetsClock: e.target.checked }))} />
              <span>A rendezvous resets the stop clocks</span>
            </label>
            <label className="field">
              <span>Skip a routine stop if a rendezvous is within</span>
              <span className="rule-fields">
                <input type="number" min={0} max={90} value={plan.mergeWithinMin} onChange={(e) => update((p) => ({ ...p, mergeWithinMin: Number(e.target.value) || 0 }))} /> min of riding
              </span>
            </label>
          </section>

          <section className="card stack-sm">
            <h2>Rendezvous with the motorhome</h2>
            {[1, 2].map((d) => (
              <div key={d} className="stack-sm">
                <div className="label">Day {d}</div>
                {plan.namedStops.filter((s) => s.day === d).length === 0 && <p className="xs muted">No stops with a mile yet — Admin → Route → Import.</p>}
                {plan.namedStops
                  .filter((s) => s.day === d)
                  .map((s) => (
                    <div key={s.key} className="named">
                      <label className="check">
                        <input type="checkbox" checked={s.enabled} onChange={(e) => update((p) => ({ ...p, namedStops: p.namedStops.map((x) => (x.key === s.key ? { ...x, enabled: e.target.checked } : x)) }))} />
                        <span>
                          {s.name}
                          {s.optional && <em className="xs muted"> optional</em>}
                        </span>
                      </label>
                      <span className="rule-fields">
                        <span className="mono xs muted">mi {s.mile}</span>
                        <input type="number" min={0} max={600} value={s.durMin} disabled={!s.enabled} onChange={(e) => update((p) => ({ ...p, namedStops: p.namedStops.map((x) => (x.key === s.key ? { ...x, durMin: Number(e.target.value) || 0 } : x)) }))} /> min
                      </span>
                    </div>
                  ))}
              </div>
            ))}
            <p className="xs muted" style={{ margin: 0 }}>
              Add or move a rendezvous in Admin → Route; the miles come from Simon&rsquo;s pins.
            </p>
          </section>

          <section className="card stack-sm">
            <h2>Presets</h2>
            <div className="row" style={{ flexWrap: "wrap", gap: "var(--space-2)" }}>
              <button className="btn btn-sm" onClick={() => update((p) => ({ ...p, speedMph: 12, shortStop: { ...p.shortStop, enabled: false }, longStop: { ...p.longStop, enabled: false }, halfway: { ...p.halfway, enabled: false }, namedStops: p.namedStops.map((s) => ({ ...s, durMin: s.optional ? 10 : 25 })) }))}>
                Simon&rsquo;s roadbook
              </button>
              <button className="btn btn-sm" onClick={() => update((p) => ({ ...p, shortStop: { enabled: true, everyMin: 60, durMin: 5 }, longStop: { enabled: true, everyMin: 180, durMin: 15 } }))}>
                5 every hour, 15 every 3
              </button>
              <button className="btn btn-sm" onClick={() => update((p) => ({ ...p, speedMph: 11 }))}>
                Steady 11
              </button>
              <button className="btn btn-sm" onClick={() => update((p) => ({ ...p, speedMph: 13.5 }))}>
                Brisk 13.5
              </button>
              <button className="btn btn-sm" onClick={() => update((p) => ({ ...p, days: { 1: { ...p.days[1], start: "06:30" }, 2: { ...p.days[2], start: "07:00" } } }))}>
                Day 1 at 06:30
              </button>
            </div>
          </section>
        </aside>

        <div className="planner-main stack">
          <section className="card stack-sm">
            <h2>Where will we be?</h2>
            <div className="form-inline" style={{ alignItems: "end" }}>
              <label className="field" style={{ flex: "0 0 7rem" }}>
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
                  <>Not started yet — Day {probeDay} rolls at {fmtHm(probeRes.start)}.</>
                ) : probeWhere.after ? (
                  <>Finished — in at about {fmtHm(probeRes.finish)}.</>
                ) : probeWhere.stopped ? (
                  <>
                    Stopped at <b>{probeWhere.stopped.name}</b>, mile {probeWhere.stopped.mile} — away again at {fmtHm(probeWhere.stopped.depart)}.
                  </>
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
                {probeRes && parseHm(probeTime) > probeRes.sunset && !probeWhere.before && " · after dark"}
                {probe && (
                  <>
                    {" "}
                    <a className="xs" target="_blank" rel="noopener" href={`https://www.google.com/maps/search/?api=1&query=${probe.lat.toFixed(5)},${probe.lon.toFixed(5)}`}>
                      Google Maps ↗
                    </a>
                  </>
                )}
              </p>
            )}
            <div className="form-inline" style={{ alignItems: "end" }}>
              <label className="field" style={{ flex: "1 1 16rem" }}>
                <span>When do we reach…</span>
                <select value={reachKey} onChange={(e) => setReachKey(e.target.value)}>
                  <option value="">— a town or a stop —</option>
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
                    Show on map
                  </button>
                </p>
              )}
            </div>
            <p className="xs muted" style={{ margin: 0 }}>
              Or click anywhere on the route line to set the probe there.
            </p>
          </section>

          <div className="map planner-map">
            <PlanMap profiles={profiles} results={results} probe={probe} hover={hover} onPick={pickOnMap} focusDay={focusDay} />
          </div>

          {results.map((r) => {
            const p = profiles.find((x) => x.day === r.day)!;
            return (
              <section key={r.day} className="card stack-sm day-plan" id={`day-${r.day}`}>
                <div className="row-between" style={{ alignItems: "baseline" }}>
                  <h2>
                    Day {r.day} — {r.day === 1 ? "Saturday 14" : "Sunday 15"} November
                  </h2>
                  <span className="small muted">
                    {r.miles} mi · {fmtHm(r.start)} → ~{fmtHm(r.finish)} · sunset {fmtHm(r.sunset)}
                  </span>
                </div>
                <Elevation profile={p} result={r} onHover={hoverProbe(r.day)} onPick={(mile) => pickOnMap({ day: r.day, mile })} />
                <div className="table-wrap">
                  <table className="table timetable">
                    <thead>
                      <tr>
                        <th>Arrive</th>
                        <th>Mile</th>
                        <th>Where</th>
                        <th>What</th>
                        <th>Stop</th>
                        <th>Away</th>
                        <th>Leg</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.events.map((e, i) => (
                        <tr key={i} data-kind={e.kind} data-dark={e.dark || undefined} onClick={() => pickOnMap({ day: r.day, mile: e.mile })}>
                          <td className="mono">
                            {fmtHm(e.arrive)}
                            {e.dark && e.kind !== "start" && (
                              <span className="moon" title="after sunset">
                                {" "}
                                ☾
                              </span>
                            )}
                          </td>
                          <td className="mono">{e.mile.toFixed(e.kind === "start" ? 0 : 1)}</td>
                          <td>
                            {e.name}
                            {e.kind !== "start" && e.kind !== "finish" && e.kind !== "named" && (
                              <span className="xs muted"> · {nearestTown(p, e.mile)?.name ?? ""}</span>
                            )}
                            {e.notes && <div className="xs muted">{e.notes}</div>}
                          </td>
                          <td>
                            <span className="badge badge-kind" data-kind={e.kind}>
                              {KIND_LABEL[e.kind]}
                            </span>
                          </td>
                          <td className="mono">{e.durMin ? `${e.durMin} min` : ""}</td>
                          <td className="mono">{e.durMin ? fmtHm(e.depart) : ""}</td>
                          <td className="xs muted">{i > 0 ? `${e.milesFromPrev} mi · ${fmtDur(e.ridingMinFromPrev)}` : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {r.towns.length > 0 && (
                  <details className="towns">
                    <summary className="small">Passing through — {r.towns.length} places with an ETA</summary>
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
            Sunrise and sunset are computed for the route&rsquo;s midpoint on the day (UK is on GMT by then). Elevation is the GPX&rsquo;s, lightly smoothed, so the climbing total reads lower than Strava&rsquo;s. The riders&rsquo; files:{" "}
            {profiles.filter((p) => p.present).map((p) => (
              <a key={p.day} href={`/api/route-geo?day=${p.day}&format=gpx`} style={{ marginRight: "var(--space-2)" }}>
                Day {p.day} GPX
              </a>
            ))}
          </p>
        </div>
      </div>
    </div>
  );
}

function DayTile({ r, onFocus, focused }: { r: DayResult; onFocus: () => void; focused: boolean }) {
  const darkH = r.darkRidingMin;
  return (
    <button className="tile day-tile" data-focused={focused || undefined} onClick={onFocus} title="Zoom the map to this day">
      <span className="eyebrow">Day {r.day}</span>
      <span className="tile-row">
        <b>{fmtHm(r.start)}</b>
        <span className="arrow">→</span>
        <b>~{fmtHm(r.finish)}</b>
      </span>
      <span className="xs muted">
        {r.miles} mi · {fmtDur(r.ridingMin)} riding · {fmtDur(r.stoppedMin)} stopped
        {darkH > 2 && (
          <>
            {" "}
            · <span className="dark-note">{fmtDur(darkH)} after dark</span>
          </>
        )}
      </span>
    </button>
  );
}

function RuleRow({ label, hint, rule, onChange }: { label: string; hint: string; rule: Plan["shortStop"]; onChange: (r: Plan["shortStop"]) => void }) {
  return (
    <div className="rule">
      <label className="check">
        <input type="checkbox" checked={rule.enabled} onChange={(e) => onChange({ ...rule, enabled: e.target.checked })} />
        <span>
          {label} <em className="xs muted">{hint}</em>
        </span>
      </label>
      <span className="rule-fields">
        <input type="number" min={1} max={180} value={rule.durMin} disabled={!rule.enabled} onChange={(e) => onChange({ ...rule, durMin: Number(e.target.value) || 1 })} /> min every{" "}
        <input type="number" min={15} max={600} step={5} value={rule.everyMin} disabled={!rule.enabled} onChange={(e) => onChange({ ...rule, everyMin: Number(e.target.value) || 15 })} /> min
      </span>
    </div>
  );
}

function nearestTown(p: RouteProfile, mile: number): { name: string; offMi: number } | null {
  let best: { name: string; offMi: number; d: number } | null = null;
  for (const t of p.towns) {
    const d = Math.abs(t.mile - mile);
    if (!best || d < best.d) best = { name: t.name, offMi: t.offMi, d };
  }
  return best && best.d <= 4 ? best : null;
}

function nextEvent(events: PlanEvent[], mile: number): string {
  const n = events.find((e) => e.mile > mile + 0.05);
  return n ? `${n.name} at ${fmtHm(n.arrive)} (mile ${n.mile})` : "the finish";
}

/** A plan from a link or a draft, but with today's stop candidates (names, miles) kept. */
function withCandidates(p: Plan, current: Plan): Plan {
  return {
    ...p,
    namedStops: current.namedStops.map((c) => {
      const prev = p.namedStops.find((x) => x.key === c.key);
      return prev ? { ...c, durMin: prev.durMin, enabled: prev.enabled } : c;
    }),
  };
}

function range(a: number, b: number, step: number): number[] {
  const out = [];
  for (let v = a; v <= b + 1e-9; v += step) out.push(Math.round(v * 10) / 10);
  return out;
}

/** Built by hand: Intl's punctuation differs between Node and browsers, which trips hydration. */
function fmtWhen(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${g("weekday")} ${g("day")} ${g("month")}, ${g("hour")}:${g("minute")}`;
}
