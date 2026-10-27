"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RouteProfile } from "@/lib/route";
import type { DayResult } from "@/lib/plan";
import { RIDE_DATES, fmtHm, pointAtMile, publicEvents, timeAtMile } from "@/lib/plan";
import { londonDate } from "@/lib/time";
import {
  SEGMENT_MI,
  WIND_LABEL,
  compass,
  compass8,
  describeCode,
  hourIndex,
  liveMileFrom,
  londonMinutes,
  progressFor,
  rainGlyph,
  segmentAt,
  shiftDay,
  tempBin,
  windRelative,
  type Hour,
  type LiveMile,
  type Progress,
  type RideWeather,
  type SegmentWx,
} from "@/lib/weather";
import { CrossSection, DAY_NAMES, DAY_SHORT, DayTile, Glyph, Key, SegmentTable, SourceLine, fmtDayLong, fmtWhen, rainWords, type Mode } from "./weather-parts";

// The public Weather page. The crew's cross-section and table at the public pace
// (a steady 12 mph with the planned stops), plus "Where will you be?": pick the
// place you'll watch from, or the stretch you'll ride with them, and see the
// weather there at the time the riders pass, with the hours either side.
//
// It keeps itself current: a new forecast every ten minutes (the server fetches
// one every half hour), and on the weekend the riders' own updates from the road
// move the pass times along — a stretch they reach forty minutes late is read at
// the later hour.

type Props = { weather: RideWeather; profiles: RouteProfile[]; results: DayResult[]; live: LiveMile };

const WEATHER_POLL_MS = 10 * 60_000;
const LIVE_POLL_MS = 60_000;
const STALE_AFTER_MS = 5 * 60_000;

type Place = { key: string; day: number; mile: number; name: string; lat: number; lon: number; kind: "start" | "stop" | "finish" | "town" | "stretch"; offMi: number; toMi?: number };

/** Everywhere a spectator might pick: the start, the support stops, the finish and the towns the line passes, by day and mile. */
function placesFor(results: DayResult[], profiles: RouteProfile[]): Place[] {
  const out: Place[] = [];
  for (const r of results) {
    const p = profiles.find((x) => x.day === r.day);
    for (const e of publicEvents(r.events)) {
      out.push({ key: `e:${r.day}:${e.mile}`, day: r.day, mile: e.mile, name: e.name, lat: e.lat, lon: e.lon, kind: e.kind === "start" ? "start" : e.kind === "finish" ? "finish" : "stop", offMi: 0 });
    }
    for (const t of p?.towns ?? []) {
      // A town the start, a stop or the finish already names ("Castelnau, Barnes" at mile 0) would be the same place twice.
      if (out.some((o) => o.day === r.day && o.kind !== "town" && Math.abs(o.mile - t.mile) < 1.5 && o.name.toLowerCase().includes(t.name.toLowerCase()))) continue;
      out.push({ key: `t:${r.day}:${t.name}`, day: r.day, mile: t.mile, name: t.name, lat: t.lat, lon: t.lon, kind: "town", offMi: t.offMi });
    }
  }
  return out.sort((a, b) => a.day - b.day || a.mile - b.mile);
}

function placeLabel(p: Place): string {
  const what = p.kind === "start" ? "the start" : p.kind === "finish" ? "the finish" : p.kind === "stop" ? "support stop" : p.offMi > 0.6 ? `${p.offMi} mi off the route` : "";
  return `${p.name} · mile ${Math.round(p.mile)}${what ? ` · ${what}` : ""}`;
}

export function PublicWeather({ weather: initialWeather, profiles, results: initialResults, live: initialLive }: Props) {
  const [weather, setWeather] = useState(initialWeather);
  const [results, setResults] = useState(initialResults);
  const [live, setLive] = useState(initialLive);
  const [mode, setMode] = useState<Mode>("air");
  const [fromKey, setFromKey] = useState("");
  const [toKey, setToKey] = useState("");
  const [stretch, setStretch] = useState<{ day: number; i: number } | null>(null);
  const [offline, setOffline] = useState(false);
  const [now, setNow] = useState(() => Date.parse(initialWeather.generatedAt));
  const lastLoad = useRef(Date.parse(initialWeather.generatedAt));

  // ---- keeping current ------------------------------------------------------------
  useEffect(() => {
    let gone = false;
    const load = async () => {
      try {
        const r = await fetch("/api/weather?pace=public&full=1", { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        const j = (await r.json()) as { weather: RideWeather; results: DayResult[] };
        if (gone) return;
        setWeather(j.weather);
        setResults(j.results);
        setOffline(false);
        lastLoad.current = Date.now();
      } catch {
        if (!gone) setOffline(true);
      }
    };
    const poll = setInterval(load, WEATHER_POLL_MS);
    // Phones come back from a pocket: fetch again if the page has been asleep a while.
    const woke = () => {
      if (document.visibilityState === "visible" && Date.now() - lastLoad.current > STALE_AFTER_MS) load();
    };
    document.addEventListener("visibilitychange", woke);
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    setNow(Date.now());
    return () => {
      gone = true;
      clearInterval(poll);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", woke);
    };
  }, []);

  // On the weekend, follow the riders' own updates from the road.
  const weekend = live.phase === "riding" || live.phase === "overnight" || Object.values(RIDE_DATES).includes(londonDate(new Date(now)));
  useEffect(() => {
    if (!weekend) return;
    let gone = false;
    const load = async () => {
      try {
        const r = await fetch("/api/live", { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        const j = await r.json();
        if (!gone) setLive(liveMileFrom(j));
      } catch {
        /* keep the last good one */
      }
    };
    const id = setInterval(load, LIVE_POLL_MS);
    return () => {
      gone = true;
      clearInterval(id);
    };
  }, [weekend]);

  // ---- the days, moved along by the riders' progress where that's known -------------
  const progress = useMemo(() => {
    const out: Record<number, Progress | null> = {};
    for (const r of results) out[r.day] = progressFor(live, r.day, r, now);
    return out;
  }, [live, results, now]);
  const days = useMemo(() => weather.days.map((d) => (progress[d.day]?.applied ? shiftDay(d, progress[d.day]!.offsetMin, progress[d.day]!.mile) : d)), [weather, progress]);
  const shiftFor = (day: number) => {
    const p = progress[day];
    return p?.applied ? { fromMile: p.mile, min: p.offsetMin } : null;
  };
  const tAt = (day: number, mile: number) => {
    const r = results.find((x) => x.day === day);
    if (!r) return 0;
    const s = shiftFor(day);
    return timeAtMile(r.events, mile, 60 / r.speedMph) + (s && mile > s.fromMile ? s.min : 0);
  };

  // ---- the pick -------------------------------------------------------------------
  const places = useMemo(() => placesFor(results, profiles), [results, profiles]);
  const stretchPlace: Place | null = useMemo(() => {
    if (!stretch) return null;
    const d = days.find((x) => x.day === stretch.day);
    const s = d?.segments[stretch.i];
    const p = profiles.find((x) => x.day === stretch.day);
    if (!d || !s || !p) return null;
    const near = p.towns.filter((t) => t.mile >= s.fromMi && t.mile < s.toMi).map((t) => t.name);
    return {
      key: `s:${s.day}:${s.i}`,
      day: s.day,
      mile: s.fromMi,
      toMi: s.toMi,
      name: `Miles ${s.fromMi}–${Math.round(s.toMi)}${near.length ? ` (${near.slice(0, 2).join(", ")})` : ""}`,
      lat: s.lat,
      lon: s.lon,
      kind: "stretch",
      offMi: 0,
    };
  }, [stretch, days, profiles]);
  const from = stretchPlace ?? places.find((p) => p.key === fromKey) ?? null;
  const toOptions = from ? places.filter((p) => p.day === from.day && p.mile > (from.toMi ?? from.mile) + 0.5 && p.kind !== "start") : [];
  const to = from ? (toOptions.find((p) => p.key === toKey) ?? null) : null;

  const pickFrom = (key: string) => {
    setStretch(null);
    setFromKey(key);
    setToKey("");
  };
  const pickStretch = (s: SegmentWx) => {
    setStretch({ day: s.day, i: s.i });
    setFromKey("");
    setToKey("");
  };

  const fromDay = from ? (days.find((d) => d.day === from.day) ?? null) : null;
  const fromRes = from ? (results.find((r) => r.day === from.day) ?? null) : null;
  const fromProfile = from ? (profiles.find((p) => p.day === from.day) ?? null) : null;
  const seg = fromDay && from ? segmentAt(fromDay, from.kind === "stretch" ? from.mile + 0.5 : from.mile) : null;
  const eta = from ? tAt(from.day, from.kind === "stretch" ? (seg?.midMi ?? from.mile) : from.mile) : 0;
  const etaIdx = hourIndex(eta);
  const hourAt = seg?.hours[etaIdx] ?? null;
  const windAt = seg && hourAt ? windRelative(hourAt.wd, seg.heading, hourAt.ws) : null;
  // A support stop at (or within half a mile of) the place: they arrive, they stop, they leave.
  const stopHere = from && fromRes && from.kind !== "stretch" && from.kind !== "start" ? (fromRes.events.find((e) => e.kind === "named" && Math.abs(e.mile - from.mile) <= 0.6) ?? null) : null;
  const range = from ? (to ? { from: from.mile, to: to.mile } : from.kind === "stretch" ? { from: from.mile, to: from.toMi ?? from.mile } : { from: from.mile - 0.35, to: from.mile + 0.35 }) : null;
  // The map link goes to the road itself, not the town centre: a town can sit a mile or two off the line.
  const spot =
    from && fromProfile?.points.length
      ? (() => {
          const pt = pointAtMile(fromProfile.points, from.kind === "stretch" ? from.mile + 0.5 : from.mile);
          return { lat: pt[1], lon: pt[0] };
        })()
      : from
        ? { lat: from.lat, lon: from.lon }
        : null;

  // The stretch, when there is one: the 10-mile pieces it crosses, clipped to it.
  const legs = useMemo(() => {
    if (!from || !to || !fromDay) return null;
    const a0 = from.mile;
    const b0 = to.mile;
    const rows = fromDay.segments.filter((s) => s.toMi > a0 && s.fromMi < b0).map((s) => ({ s, a: Math.max(s.fromMi, a0), b: Math.min(s.toMi, b0) }));
    const len = (r: (typeof rows)[number]) => r.b - r.a;
    const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((acc, r) => acc + f(r), 0);
    const miles = b0 - a0;
    const temps = rows.map((r) => (mode === "air" ? r.s.hour.t : r.s.hour.feels));
    const pps = rows.map((r) => r.s.hour.pp).filter((p): p is number => p != null);
    return {
      rows,
      miles,
      start: tAt(from.day, a0),
      end: tAt(from.day, b0),
      tMin: Math.min(...temps),
      tMax: Math.max(...temps),
      rain: pps.length ? Math.max(...pps) : null,
      mm: sum((r) => r.s.hour.mm * (len(r) / SEGMENT_MI)),
      wind: Math.round(sum((r) => r.s.hour.ws * len(r)) / Math.max(0.1, miles)),
      head: sum((r) => (r.s.wind.kind === "head" ? len(r) : 0)),
      tail: sum((r) => (r.s.wind.kind === "tail" ? len(r) : 0)),
      cross: sum((r) => (r.s.wind.kind === "cross" ? len(r) : 0)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, fromDay, mode, progress]);

  const anyForecast = days.some((d) => d.source === "forecast");
  const fc = weather.forecast;
  const firstTypical = days.find((d) => d.source === "typical");

  return (
    <div className="stack pub-wx">
      {/* ---- where things stand ---- */}
      <p className="wx-source small pub-wx-status" data-level={anyForecast ? days[0]?.confidence.level : 0}>
        {anyForecast ? (
          <>
            <b>Forecast</b> fetched {fmtWhen(fc.fetchedAt ?? weather.generatedAt)}
            {fc.stale ? " (the forecast service couldn't be reached since; this is the last one)" : ""}. This page checks for a new one every few minutes and updates itself; the forecast sharpens as
            the weekend gets closer.
            {firstTypical && (
              <>
                {" "}
                Day {firstTypical.day} is still beyond the 16-day range and shows a typical day until {fmtDayLong(firstTypical.forecastFrom)}.
              </>
            )}
          </>
        ) : (
          <>
            <b>Typical for mid-November</b> for now: the ride is still beyond the 16-day forecast range, so each stretch shows what the date is usually like there ({weather.climatology.note}). The
            real forecast for Saturday reaches this page on <b>{fmtDayLong(days[0]?.forecastFrom ?? "")}</b> and for Sunday the day after, and switches in by itself.
          </>
        )}
        {offline && <> Can&rsquo;t reach the site at the moment; showing the last update.</>}
      </p>

      <div className="planner-tiles">
        {days.map((d) => (
          <DayTile key={d.day} d={d} />
        ))}
      </div>

      {/* ---- where will you be? ---- */}
      <section className="card card-lg pub-probe stack-sm" aria-label="Where will you be?">
        <h2>Where will you be?</h2>
        <p className="muted" style={{ margin: 0 }}>
          Pick the place you&rsquo;ll watch from, or tap a stretch on a chart below. Riding with them for a bit? Add where you&rsquo;ll peel off.
        </p>
        <div className="form-inline" style={{ alignItems: "end" }}>
          <label className="field" style={{ flex: "2 1 16rem" }}>
            <span>Watching from</span>
            <select value={stretchPlace ? stretchPlace.key : fromKey} onChange={(e) => pickFrom(e.target.value)}>
              <option value="">a town, a stop, the start or the finish</option>
              {stretchPlace && (
                <option value={stretchPlace.key}>
                  Day {stretchPlace.day} · {stretchPlace.name} (from the chart)
                </option>
              )}
              {[1, 2].map((day) => (
                <optgroup key={day} label={`Day ${day} · ${DAY_NAMES[day]}`}>
                  {places
                    .filter((p) => p.day === day)
                    .map((p) => (
                      <option key={p.key} value={p.key}>
                        {placeLabel(p)}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="field" style={{ flex: "1 1 14rem" }}>
            <span>Riding along as far as</span>
            <select value={toKey} onChange={(e) => setToKey(e.target.value)} disabled={!from}>
              <option value="">{from ? "just watching" : "pick a place first"}</option>
              {toOptions.map((p) => (
                <option key={p.key} value={p.key}>
                  {placeLabel(p)}
                </option>
              ))}
            </select>
          </label>
          {from && (
            <button type="button" className="btn btn-sm btn-quiet" onClick={() => pickFrom("")}>
              Clear
            </button>
          )}
        </div>

        {from && fromDay && fromRes && seg && hourAt && windAt && spot && (
          <div className="stack-sm">
            <p className="probe-answer">
              <b>{from.name}</b>, Day {from.day} ({DAY_SHORT[from.day]}):{" "}
              {stopHere ? (
                <>
                  the riders stop here{from.kind !== "stop" && stopHere.name.toLowerCase() !== from.name.toLowerCase() ? ` (${stopHere.name})` : ""}, arriving about{" "}
                  <b>{fmtHm(tAt(from.day, stopHere.mile))}</b> and away again about {fmtHm(tAt(from.day, stopHere.mile) + stopHere.durMin)}
                </>
              ) : from.kind === "start" ? (
                <>
                  they roll at <b>{fmtHm(fromRes.start)}</b>
                </>
              ) : (
                <>
                  the riders should pass about <b>{fmtHm(eta)}</b>
                </>
              )}
              {eta > fromDay.sunset || eta < fromDay.sunrise ? " · after dark" : ""}. Expect <b>{Math.round(hourAt.t)}°</b>
              {Math.round(hourAt.feels) !== Math.round(hourAt.t) && <> (feels like {Math.round(hourAt.feels)}° in the wind)</>}, {rainWords(hourAt)}
              {hourAt.code >= 0 && describeCode(hourAt.code) ? `, ${describeCode(hourAt.code)}` : ""}, wind {compass(hourAt.wd)} {Math.round(hourAt.ws)} mph with gusts to {Math.round(hourAt.gust)}
              {from.kind !== "start" && (
                <>
                  {" "}
                  · a{" "}
                  <b className="wx-kind" data-kind={windAt.kind}>
                    {WIND_LABEL[windAt.kind]}
                  </b>{" "}
                  for the riders here (they&rsquo;re heading {compass8(seg.heading)})
                </>
              )}
              . {seg.source === "typical" && <span className="muted">Typical values for the date, not a forecast yet. </span>}
              <a className="xs" target="_blank" rel="noopener" href={`https://www.google.com/maps/search/?api=1&query=${spot.lat.toFixed(5)},${spot.lon.toFixed(5)}`}>
                The route here on Google Maps ↗
              </a>
            </p>

            <HourStrip
              hours={seg.hours}
              at={etaIdx}
              mode={mode}
              heading={seg.heading}
              label={`${from.kind === "start" ? "off" : stopHere ? "here" : "pass"} ${fmtHm(stopHere ? tAt(from.day, stopHere.mile) : from.kind === "start" ? fromRes.start : eta)}`}
            />

            {to && legs && (
              <div className="wx-legs stack-sm">
                <p className="probe-answer">
                  Riding with them from <b>{from.name}</b> to <b>{to.name}</b>: <b>{Math.round(legs.miles)} miles</b>, about {fmtHm(legs.start)} to {fmtHm(legs.end)}
                  {legs.end > fromDay.sunset ? " (the last part after sunset)" : ""}. {Math.round(legs.tMin)}–{Math.round(legs.tMax)}°{mode === "feels" ? " feels like" : ""},{" "}
                  {legs.rain != null ? `rain ${Math.round(legs.rain)}%` : legs.mm >= 0.5 ? `${legs.mm.toFixed(1)} mm of rain` : "dry"}, wind around {legs.wind} mph: tailwind for{" "}
                  {Math.round(legs.tail)} miles, crosswind {Math.round(legs.cross)}, headwind {Math.round(legs.head)}.
                </p>
                <div className="table-wrap">
                  <table className="table wx-rows wx-leg-rows">
                    <thead>
                      <tr>
                        <th>Miles</th>
                        <th>Where</th>
                        <th>From</th>
                        <th>{mode === "air" ? "Air" : "Feels"}</th>
                        <th>Rain</th>
                        <th>Wind</th>
                        <th>On the road</th>
                      </tr>
                    </thead>
                    <tbody>
                      {legs.rows.map(({ s, a, b }) => {
                        const h = s.hour;
                        const dark = tAt(from.day, a) > fromDay.sunset;
                        return (
                          <tr key={s.i} data-dark={dark || undefined}>
                            <td className="mono">
                              {Math.round(a)}–{Math.round(b)}
                            </td>
                            <td>
                              {fromProfile ? placeBetween(fromProfile, a, b) : ""}
                              <span className="xs muted"> · {compass8(s.heading)}</span>
                            </td>
                            <td className="mono">
                              {fmtHm(tAt(from.day, a))}
                              {dark ? " ☾" : ""}
                            </td>
                            <td>
                              <span className="wx-chip" data-bin={tempBin(mode === "air" ? h.t : h.feels)}>
                                {Math.round(mode === "air" ? h.t : h.feels)}°
                              </span>
                            </td>
                            <td>{rainWords(h)}</td>
                            <td className="mono">
                              {compass(h.wd)} {Math.round(h.ws)}
                              <span className="xs muted"> g{Math.round(h.gust)}</span>
                            </td>
                            <td>
                              <span className="badge wx-kind" data-kind={s.wind.kind}>
                                {WIND_LABEL[s.wind.kind]}
                                {s.wind.side ? ` · ${s.wind.side}` : ""}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
        <p className="xs muted" style={{ margin: 0 }}>
          Times are the plan: a steady 12 mph with the planned stops, so they will move on the day. On the weekend this page follows the crew&rsquo;s updates from the road and moves the times along
          with them.
        </p>
      </section>

      {/* ---- the key ---- */}
      <section className="card wx-key-card">
        <div className="row-between" style={{ alignItems: "center", flexWrap: "wrap", gap: "var(--space-3)" }}>
          <div className="wx-mode" role="group" aria-label="Temperature shown">
            <span className="label">Temperature</span>
            <button className="btn btn-sm" data-on={mode === "air" || undefined} onClick={() => setMode("air")}>
              Air
            </button>
            <button className="btn btn-sm" data-on={mode === "feels" || undefined} onClick={() => setMode("feels")}>
              Feels like
            </button>
          </div>
          <Key />
        </div>
      </section>

      {/* ---- the two days ---- */}
      {days.map((d) => {
        const p = profiles.find((x) => x.day === d.day)!;
        const r = results.find((x) => x.day === d.day)!;
        const prog = progress[d.day];
        return (
          <section key={d.day} className="card card-lg stack-sm day-plan wx-day" id={`wx-day-${d.day}`} data-source={d.source}>
            <div className="row-between" style={{ alignItems: "baseline", flexWrap: "wrap", gap: "var(--space-2)" }}>
              <h2 style={{ margin: 0 }}>
                Day {d.day} · {DAY_NAMES[d.day]}
              </h2>
              <span className="small muted">
                {Math.round(r.miles)} mi · {fmtHm(r.start)} → ~{fmtHm(r.finish + (prog?.applied ? prog.offsetMin : 0))} · sunrise {fmtHm(d.sunrise)} · sunset {fmtHm(d.sunset)}
              </span>
            </div>
            <SourceLine d={d} climNote={weather.climatology.note} />
            {prog && <LiveLine prog={prog} now={now} />}
            <CrossSection
              d={d}
              profile={p}
              result={r}
              mode={mode}
              range={range && from?.day === d.day ? range : null}
              live={prog ? { mile: prog.mile, label: `riders · ${fmtHm(londonMinutes(prog.at))}` } : null}
              shift={shiftFor(d.day)}
              onPick={pickStretch}
              hint="Tap a stretch to pick it, or hover for the detail."
            />
            <SegmentTable d={d} profile={p} mode={mode} open={false} />
          </section>
        );
      })}

      <p className="xs muted">
        Forecast: Open-Meteo&rsquo;s best match for each point (ECMWF, Met Office and DWD models blended; rain chances from the ensembles), hourly, up to 16 days ahead, fetched every half hour.
        Typical values: {weather.climatology.source}, {weather.climatology.note}. Wind is at 10 m, so a sheltered lane feels less and an exposed ridge feels like the gusts. Head, tail and cross are
        judged against the direction each 10-mile stretch makes good. Temperatures are the air temperature at the hour the riders are expected; &ldquo;feels like&rdquo; is on a bike in that wind, so
        standing at the roadside you&rsquo;ll be nearer the air figure. The times come from <a href="/route">the route</a> plan.
      </p>
    </div>
  );
}

// ---- the hours around the pass -------------------------------------------------------

function HourStrip({ hours, at, mode, heading, label }: { hours: Hour[]; at: number; mode: Mode; heading: number; label: string }) {
  const lo = Math.max(0, at - 2);
  const hi = Math.min(23, at + 2);
  const cells = [];
  for (let k = lo; k <= hi; k++) cells.push(k);
  return (
    <div className="wx-hours" role="table" aria-label="The hours around the time the riders pass">
      {cells.map((k) => {
        const h = hours[k];
        if (!h) return null;
        const w = windRelative(h.wd, heading, h.ws);
        return (
          <div key={k} className="wx-hour" data-at={k === at || undefined} role="row">
            <span className="mono xs">{k === at ? label : `${String(k).padStart(2, "0")}:00`}</span>
            <span className="wx-chip" data-bin={tempBin(mode === "air" ? h.t : h.feels)}>
              {Math.round(mode === "air" ? h.t : h.feels)}°
            </span>
            <span className="wx-hour-rain">
              <svg viewBox="-9 -9 18 18" className="wx-key-glyph">
                <Glyph kind={rainGlyph(h)} />
              </svg>
              <span className="xs">{h.pp != null ? `${h.pp}%` : h.mm >= 0.1 ? `${h.mm} mm` : "dry"}</span>
            </span>
            <span className="xs mono wx-hour-wind" data-kind={w.kind}>
              {compass(h.wd)} {Math.round(h.ws)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---- the riders, now ------------------------------------------------------------------

function LiveLine({ prog, now }: { prog: Progress; now: number }) {
  const mins = Math.max(0, Math.round((now - Date.parse(prog.at)) / 60_000));
  const ago = mins < 1 ? "just now" : mins < 60 ? `${mins} min ago` : `${Math.floor(mins / 60)} h ${mins % 60} min ago`;
  const against = Math.abs(prog.offsetMin) < 10 ? "about on the plan" : `${Math.abs(prog.offsetMin)} min ${prog.offsetMin > 0 ? "behind" : "ahead of"} the plan`;
  return (
    <p className="probe-answer small wx-live-line">
      <b>From the road:</b> the riders were around <b>mile {Math.round(prog.mile)}</b> at {fmtHm(londonMinutes(prog.at))} ({ago}), {against}.
      {prog.applied ? " The times ahead of them are moved to match, and each stretch is read at its new hour." : ""}
    </p>
  );
}

/** The towns inside a piece of the road, or the nearest one to its middle. */
function placeBetween(profile: RouteProfile, a: number, b: number): string {
  const inside = profile.towns.filter((t) => t.mile >= a && t.mile < b);
  if (inside.length)
    return inside
      .slice(0, 2)
      .map((t) => t.name)
      .join(" · ");
  const mid = (a + b) / 2;
  let best: { name: string; d: number } | null = null;
  for (const t of profile.towns) {
    const dd = Math.abs(t.mile - mid);
    if (!best || dd < best.d) best = { name: t.name, d: dd };
  }
  return best && best.d <= 7 ? `near ${best.name}` : "";
}
