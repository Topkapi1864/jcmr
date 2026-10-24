"use client";

import { useMemo, useState, useTransition } from "react";
import type { RouteProfile } from "@/lib/route";
import type { DayResult } from "@/lib/plan";
import { fmtHm, timeAtMile } from "@/lib/plan";
import { SEGMENT_MI, TEMP_BINS, WIND_LABEL, compass, compass8, describeCode, rainGlyph, tempBin, type DayWx, type Hour, type RainGlyph, type RideWeather, type SegmentWx, type WindKind } from "@/lib/weather";
import { refreshWeatherAction } from "@/app/crew/weather/actions";

// Crew → Weather. Two things: the latest forecast for the 14th and 15th along the
// course, point by point, and a cross-section of the day — temperature as a heat
// band, rain as marks, wind as arrows relative to the direction of travel —
// drawn over the route profile with the riders' timetable along the top.

type Props = { weather: RideWeather; profiles: RouteProfile[]; results: DayResult[] };
type Mode = "air" | "feels";

const DAY_NAMES: Record<number, string> = { 1: "Saturday 14 November", 2: "Sunday 15 November" };
const DAY_SHORT: Record<number, string> = { 1: "Sat 14 Nov", 2: "Sun 15 Nov" };

export function WeatherView({ weather, profiles, results }: Props) {
  const [mode, setMode] = useState<Mode>("air");
  const [flash, setFlash] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const anyForecast = weather.days.some((d) => d.source === "forecast");
  const fc = weather.forecast;

  const refresh = () =>
    startTransition(async () => {
      const r = await refreshWeatherAction();
      setFlash(r.error ? `Couldn't fetch a new forecast: ${r.error}` : r.fetchedAt ? `Forecast refreshed at ${fmtWhen(r.fetchedAt)}.` : "Nothing to fetch yet — the ride is still beyond the 16-day forecast range.");
      setTimeout(() => setFlash(null), 4000);
    });

  return (
    <div className="planner wx">
      <header className="planner-head">
        <div>
          <h1>Weather along the course</h1>
          <p className="small muted" style={{ margin: 0 }}>
            Every 10 miles, at the hour the crew plan has the riders passing. Forecasts sharpen as the days close in; this page fetches a new one every half hour.
            {!anyForecast && (
              <>
                {" "}
                Right now the ride is beyond the 16-day forecast range, so you&rsquo;re seeing what mid-November is <b>typically</b> like at each point — the real forecast for the 14th arrives on {fmtDayLong(weather.days[0]?.forecastFrom ?? "")} and switches in by itself.
              </>
            )}
          </p>
        </div>
        <div className="planner-actions">
          {anyForecast && (
            <button className="btn btn-primary" onClick={refresh} disabled={pending}>
              {pending ? "Fetching…" : "Fetch the latest forecast"}
            </button>
          )}
          <a className="btn" href="/crew/route">
            Route &amp; timeline
          </a>
          <button className="btn" onClick={() => window.print()}>
            Print
          </button>
        </div>
      </header>
      {flash && <p className="notice planner-flash">{flash}</p>}
      {fc.error && (
        <p className="notice planner-warn small">
          Couldn&rsquo;t reach the forecast service ({fc.error}).{fc.stale ? ` Showing the forecast fetched ${fmtWhen(fc.fetchedAt ?? "")}.` : " Showing typical values for the date instead."}
        </p>
      )}

      <div className="planner-tiles">
        {weather.days.map((d) => (
          <DayTile key={d.day} d={d} />
        ))}
      </div>

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

      {weather.days.map((d) => {
        const p = profiles.find((x) => x.day === d.day)!;
        const r = results.find((x) => x.day === d.day)!;
        return (
          <section key={d.day} className="card stack-sm day-plan wx-day" id={`wx-day-${d.day}`} data-source={d.source}>
            <div className="row-between" style={{ alignItems: "baseline" }}>
              <h2>
                Day {d.day} — {DAY_NAMES[d.day]}
              </h2>
              <span className="small muted">
                {r.miles} mi · {fmtHm(r.start)} → ~{fmtHm(r.finish)} · sunrise {fmtHm(d.sunrise)} · sunset {fmtHm(d.sunset)}
              </span>
            </div>
            <SourceLine d={d} climNote={weather.climatology.note} />
            <CrossSection d={d} profile={p} result={r} mode={mode} />
            <SegmentTable d={d} profile={p} mode={mode} />
          </section>
        );
      })}

      <p className="xs muted">
        Forecast: Open-Meteo&rsquo;s best match for each point (ECMWF, Met Office and DWD models blended; rain chances from the ensembles), hourly, up to 16 days ahead. Typical values: {weather.climatology.source} — {weather.climatology.note}. Wind is at 10 m; on a
        bike with hedges it feels less, on an exposed ridge it feels like the gusts. Head, tail and cross are judged against the direction each 10-mile stretch makes good, so a twisty lane can hide a bit of both. Temperatures are the air
        temperature at the hour the plan has you there — the plan on <a href="/crew/route">Route &amp; timeline</a> drives the times.
      </p>
    </div>
  );
}

// ---- tiles and source lines ----------------------------------------------------

function DayTile({ d }: { d: DayWx }) {
  const s = d.summary;
  return (
    <a className="tile day-tile wx-tile" href={`#wx-day-${d.day}`} data-source={d.source}>
      <span className="eyebrow">
        Day {d.day} · {DAY_SHORT[d.day]} · <ConfidenceBadge d={d} />
      </span>
      <span className="tile-row">
        <b>
          {Math.round(s.tMin)}–{Math.round(s.tMax)}°
        </b>
        <span className="arrow">·</span>
        <b>
          {compass(s.windFrom)} {Math.round(s.windMean)}
        </b>
        <span className="xs muted">mph</span>
      </span>
      <span className="xs muted">
        {s.rainChance != null ? `rain ${Math.round(s.rainChance)}%` : `${s.rainMm} mm rain`}
        {s.rainMm >= 0.5 && s.rainChance != null ? ` (${s.rainMm} mm)` : ""} · feels {Math.round(s.feelsMin)}° at worst · gusts {Math.round(s.gustMax)} mph
      </span>
      <span className="wx-windbar" aria-label={`tailwind ${s.tailMi} miles, crosswind ${s.crossMi}, headwind ${s.headMi}`}>
        <span data-kind="tail" style={{ flex: s.tailMi }} title={`tailwind ${s.tailMi} mi`} />
        <span data-kind="cross" style={{ flex: s.crossMi }} title={`crosswind ${s.crossMi} mi`} />
        <span data-kind="head" style={{ flex: s.headMi }} title={`headwind ${s.headMi} mi`} />
      </span>
      <span className="xs muted">
        tail {Math.round(s.tailMi)} mi · cross {Math.round(s.crossMi)} · head {Math.round(s.headMi)}
        {s.snow && <> · ❄ snow in the forecast</>}
        {s.thunder && <> · thunder possible</>}
        {s.fog && <> · fog at some point</>}
      </span>
    </a>
  );
}

function ConfidenceBadge({ d }: { d: DayWx }) {
  return (
    <span className="badge wx-conf" data-level={d.confidence.level} title={d.confidence.note}>
      {d.source === "forecast" ? `${d.daysOut} days out · ${d.confidence.label}` : "typical"}
    </span>
  );
}

function SourceLine({ d, climNote }: { d: DayWx; climNote: string }) {
  if (d.source === "forecast") {
    return (
      <p className="wx-source small" data-level={d.confidence.level}>
        <b>Forecast</b>, fetched {d.fetchedAt ? fmtWhen(d.fetchedAt) : "—"} · {d.daysOut === 0 ? "today" : d.daysOut === 1 ? "tomorrow" : `${d.daysOut} days out`} · confidence <b>{d.confidence.label}</b> — {d.confidence.note}. Normally
        around now: {d.typicalDay.tMin}–{d.typicalDay.tMax} °C, a wet day {d.typicalDay.rainDay}% of the time, {compass(d.typicalDay.windFrom)} {Math.round(d.typicalDay.windMean)} mph.
      </p>
    );
  }
  return (
    <p className="wx-source small" data-level={0}>
      <b>Typical for the date</b> — {climNote}. A normal {DAY_SHORT[d.day].slice(4)} here: {d.typicalDay.tMin}–{d.typicalDay.tMax} °C, a wet day {d.typicalDay.rainDay}% of the time, {compass(d.typicalDay.windFrom)} around{" "}
      {Math.round(d.typicalDay.windMean)} mph. The forecast reaches this day on <b>{fmtDayLong(d.forecastFrom)}</b>.
    </p>
  );
}

// ---- the key --------------------------------------------------------------------

function Key() {
  return (
    <div className="wx-key">
      <span className="wx-key-group" aria-label="Temperature bins">
        {TEMP_BINS.map((b, i) => (
          <span key={b} className="wx-swatch" data-bin={i}>
            {b}
          </span>
        ))}
        <span className="xs muted">°C</span>
      </span>
      <span className="wx-key-group">
        <svg viewBox="-9 -9 18 18" className="wx-key-glyph">
          <Glyph kind="maybe" />
        </svg>
        <span className="xs muted">40%+ chance</span>
        <svg viewBox="-9 -9 18 18" className="wx-key-glyph">
          <Glyph kind="light" />
        </svg>
        <span className="xs muted">light</span>
        <svg viewBox="-9 -9 18 18" className="wx-key-glyph">
          <Glyph kind="rain" />
        </svg>
        <span className="xs muted">rain</span>
        <svg viewBox="-9 -9 18 18" className="wx-key-glyph">
          <Glyph kind="heavy" />
        </svg>
        <span className="xs muted">heavy</span>
        <svg viewBox="-9 -9 18 18" className="wx-key-glyph">
          <Glyph kind="snow" />
        </svg>
        <span className="xs muted">snow</span>
      </span>
      <span className="wx-key-group" title="The arrow points where the wind is blowing, relative to the direction you're riding (left to right).">
        <svg viewBox="-16 -9 32 18" className="wx-key-glyph wide">
          <Arrow kind="tail" rel={180} len={22} />
        </svg>
        <span className="xs muted">tail</span>
        <svg viewBox="-16 -9 32 18" className="wx-key-glyph wide">
          <Arrow kind="cross" rel={90} len={16} />
        </svg>
        <span className="xs muted">cross</span>
        <svg viewBox="-16 -9 32 18" className="wx-key-glyph wide">
          <Arrow kind="head" rel={0} len={22} />
        </svg>
        <span className="xs muted">head — you ride left → right</span>
      </span>
    </div>
  );
}

// ---- the cross-section ------------------------------------------------------------

const W = 1000;
const PAD = { l: 44, r: 12 };
const ROW = {
  time: 13, // baseline of the ETA labels
  tempTop: 20,
  tempH: 26,
  rainTop: 50,
  rainH: 34,
  windTop: 88,
  windH: 50,
  elevTop: 144,
  elevH: 118,
  axis: 278,
  town: 292,
};
const H = 298;

function CrossSection({ d, profile, result, mode }: { d: DayWx; profile: RouteProfile; result: DayResult; mode: Mode }) {
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const miles = profile.miles || 1;
  const x = (mile: number) => PAD.l + (mile / miles) * (W - PAD.l - PAD.r);
  const sel = hover ?? pinned;
  const minPerMile = 60 / result.speedMph;

  const elev = useMemo(() => {
    const eles = profile.points.map((p) => p[2]);
    const lo = Math.min(...eles);
    const hi = Math.max(...eles);
    const minE = Math.max(lo >= 0 ? 0 : -Infinity, Math.floor((lo - 10) / 50) * 50);
    const maxE = Math.max(minE + 50, Math.ceil((hi + 20) / 50) * 50);
    const y = (e: number) => ROW.elevTop + (1 - (e - minE) / Math.max(1, maxE - minE)) * ROW.elevH;
    const pts = profile.points.map((p) => `${x(p[3]).toFixed(1)},${y(p[2]).toFixed(1)}`);
    const path = `M${pts.join("L")}`;
    const area = `${path}L${x(miles).toFixed(1)},${(ROW.elevTop + ROW.elevH).toFixed(1)}L${PAD.l},${(ROW.elevTop + ROW.elevH).toFixed(1)}Z`;
    const ticks: number[] = [];
    for (let e = minE; e <= maxE + 1e-6; e += (maxE - minE) / 2) ticks.push(Math.round(e));
    // Where daylight starts and ends along the x axis.
    let sunriseMile: number | null = null;
    let sunsetMile: number | null = null;
    for (let m = 0; m <= miles; m += 0.5) {
      const t = timeAtMile(result.events, m, minPerMile);
      if (sunriseMile == null && t >= result.sunrise) sunriseMile = m;
      if (sunsetMile == null && t >= result.sunset) sunsetMile = m;
    }
    return { path, area, y, ticks, sunriseMile, sunsetMile };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, result]);

  const segs = d.segments;
  const towns = useMemo(() => {
    // One town per boundary tick where the line passes within reach, no repeats.
    const out: { mile: number; name: string }[] = [];
    const used = new Set<string>();
    for (const s of segs) {
      const near = profile.towns.filter((t) => Math.abs(t.mile - s.fromMi) <= 3 && !used.has(t.name)).sort((a, b) => Math.abs(a.mile - s.fromMi) - Math.abs(b.mile - s.fromMi))[0];
      if (near) {
        used.add(near.name);
        out.push({ mile: s.fromMi, name: near.name });
      }
    }
    return out;
  }, [segs, profile.towns]);

  const cur = sel != null ? segs[sel] : null;

  return (
    <div className="wx-chart-wrap">
      <div className="wx-chart">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Weather cross-section for day ${d.day}`} onMouseLeave={() => setHover(null)} data-source={d.source}>
          {/* night shading over the profile */}
          {elev.sunriseMile != null && elev.sunriseMile > 0 && <rect className="wx-night" x={PAD.l} y={ROW.elevTop} width={Math.max(0, x(elev.sunriseMile) - PAD.l)} height={ROW.elevH} />}
          {elev.sunsetMile != null && <rect className="wx-night" x={x(elev.sunsetMile)} y={ROW.elevTop} width={Math.max(0, x(miles) - x(elev.sunsetMile))} height={ROW.elevH} />}
          {elev.ticks.map((e) => (
            <g key={e}>
              <line className="elev-grid" x1={PAD.l} x2={W - PAD.r} y1={elev.y(e)} y2={elev.y(e)} />
              <text className="elev-tick" x={PAD.l - 6} y={elev.y(e) + 3} textAnchor="end">
                {Math.round(e * 3.281)}
              </text>
            </g>
          ))}
          <path className="elev-area" d={elev.area} />
          <path className="elev-line" d={elev.path} />

          {/* row labels in the left margin */}
          <text className="wx-rowlabel" x={PAD.l - 6} y={ROW.tempTop + ROW.tempH / 2 + 3} textAnchor="end">
            °C
          </text>
          <text className="wx-rowlabel" x={PAD.l - 6} y={ROW.rainTop + ROW.rainH / 2 + 3} textAnchor="end">
            rain
          </text>
          <text className="wx-rowlabel" x={PAD.l - 6} y={ROW.windTop + ROW.windH / 2 + 3} textAnchor="end">
            wind
          </text>
          <text className="wx-rowlabel" x={PAD.l - 6} y={ROW.time} textAnchor="end">
            pass
          </text>

          {segs.map((s, i) => {
            const x0 = x(s.fromMi);
            const x1 = x(s.toMi);
            const w = Math.max(1, x1 - x0);
            const cx = (x0 + x1) / 2;
            const h = s.hour;
            const temp = mode === "air" ? h.t : h.feels;
            const glyph = rainGlyph(h);
            const narrow = w < 42; // a short last stretch: marks only, no labels
            const len = Math.min(44, Math.max(14, 10 + h.ws * 1.1), w - 6);
            const etaAt = timeAtMile(result.events, s.fromMi, minPerMile);
            return (
              <g key={i} className="wx-col" data-sel={sel === i || undefined} data-kind={s.wind.kind} onMouseEnter={() => setHover(i)} onClick={() => setPinned(pinned === i ? null : i)}>
                {i > 0 && <line className="wx-divider" x1={x0} x2={x0} y1={ROW.tempTop} y2={ROW.elevTop + ROW.elevH} />}
                {!narrow && (
                  <text className="wx-eta" x={x0 + 3} y={ROW.time} textAnchor="start" data-dark={s.fromMi > 0 && etaAt > result.sunset ? true : undefined}>
                    {fmtHm(etaAt)}
                  </text>
                )}
                <rect className="wx-temp" x={x0} y={ROW.tempTop} width={w} height={ROW.tempH} fill={`var(--wx-t${tempBin(temp)})`} />
                {!narrow && (
                  <text className="wx-temp-txt" x={cx} y={ROW.tempTop + ROW.tempH / 2 + 4} textAnchor="middle">
                    {Math.round(temp)}°
                  </text>
                )}
                <g transform={`translate(${cx.toFixed(1)},${ROW.rainTop + 13})`}>
                  <Glyph kind={glyph} />
                </g>
                {!narrow && (
                  <text className="wx-sub" x={cx} y={ROW.rainTop + ROW.rainH - 3} textAnchor="middle">
                    {h.pp != null ? `${h.pp}%` : h.mm >= 0.1 ? `${h.mm} mm` : ""}
                  </text>
                )}
                <g transform={`translate(${cx.toFixed(1)},${ROW.windTop + 20})`}>
                  <Arrow kind={s.wind.kind} rel={s.wind.rel} len={len} />
                </g>
                {!narrow && (
                  <text className="wx-sub wx-wind-txt" x={cx} y={ROW.windTop + ROW.windH - 4} textAnchor="middle" data-kind={s.wind.kind}>
                    {Math.round(h.ws)} mph
                  </text>
                )}
                <rect className="wx-hit" x={x0} y={0} width={w} height={ROW.elevTop + ROW.elevH} />
              </g>
            );
          })}

          {/* the stops, as on the planner */}
          {result.events
            .filter((e) => e.kind !== "start" && e.kind !== "finish")
            .map((e, i) => (
              <g key={i} className="elev-stop" data-kind={e.kind}>
                <line x1={x(e.mile)} x2={x(e.mile)} y1={ROW.elevTop} y2={ROW.elevTop + ROW.elevH} />
                <circle cx={x(e.mile)} cy={elev.y(e.eleM)} r={e.kind === "named" ? 5 : 3.5} />
              </g>
            ))}

          {/* miles and towns */}
          {segs.map((s) => (
            <text key={s.i} className="elev-tick" x={x(s.fromMi)} y={ROW.axis} textAnchor="middle">
              {s.fromMi}
            </text>
          ))}
          {segs.length > 0 && x(miles) - x(segs[segs.length - 1].fromMi) > 30 && (
            <text className="elev-tick" x={x(miles)} y={ROW.axis} textAnchor="middle">
              {Math.round(miles)}
            </text>
          )}
          {towns.map((t) => (
            <text key={t.name} className="wx-town" x={x(t.mile) + 2} y={ROW.town} textAnchor="start">
              {t.name}
            </text>
          ))}
        </svg>
      </div>
      <div className="wx-detail small" aria-live="polite">
        {cur ? (
          <Detail s={cur} profile={profile} source={d.source} />
        ) : (
          <span className="muted">
            {profile.present ? "Hover or tap a column for the detail." : "The GPX for this day isn't in yet, so the profile is flat; weather points follow the roadbook's straight-line schematic."}
          </span>
        )}
      </div>
    </div>
  );
}

function Detail({ s, profile, source }: { s: SegmentWx; profile: RouteProfile; source: DayWx["source"] }) {
  const h = s.hour;
  const w = s.wind;
  const where = placeFor(profile, s);
  return (
    <span>
      <b>
        Mile {s.fromMi}–{Math.round(s.toMi)}
      </b>
      {where && <> · {where}</>} · pass about <b>{s.etaHm}</b>
      {s.dark && " (dark)"} · <b>{Math.round(h.t)}°</b> feels {Math.round(h.feels)}° · {rainWords(h)} · wind {compass(h.wd)} {Math.round(h.ws)} mph, gusts {Math.round(h.gust)} —{" "}
      <b data-kind={w.kind} className="wx-kind">
        {WIND_LABEL[w.kind]}
        {w.side ? ` from the ${w.side}` : ""}
      </b>
      {w.kind !== "cross" && ` (${Math.abs(w.along)} mph along the road)`} · heading {compass8(s.heading)}
      {s.straight < 0.6 && " (twisty)"}
      {h.code >= 0 && describeCode(h.code) && <> · {describeCode(h.code)}</>}
      {h.cloud != null && <> · cloud {h.cloud}%</>}
      {source === "forecast" && (
        <span className="muted">
          {" "}
          · normally {Math.round(s.typical.t)}°, {compass(s.typical.wd)} {Math.round(s.typical.ws)} mph
        </span>
      )}
    </span>
  );
}

// ---- the table -------------------------------------------------------------------

function SegmentTable({ d, profile, mode }: { d: DayWx; profile: RouteProfile; mode: Mode }) {
  return (
    <details className="wx-table" open>
      <summary className="small">Point by point — {d.segments.length} stretches of {SEGMENT_MI} miles</summary>
      <div className="table-wrap">
        <table className="table wx-rows">
          <thead>
            <tr>
              <th>Miles</th>
              <th>Where</th>
              <th>Pass</th>
              <th>{mode === "air" ? "Air" : "Feels"}</th>
              <th>Rain</th>
              <th>Wind</th>
              <th>On the road</th>
            </tr>
          </thead>
          <tbody>
            {d.segments.map((s) => {
              const h = s.hour;
              return (
                <tr key={s.i} data-dark={s.dark || undefined}>
                  <td className="mono">
                    {s.fromMi}–{Math.round(s.toMi)}
                  </td>
                  <td>
                    {placeFor(profile, s) || <span className="muted">—</span>}
                    <span className="xs muted"> · {compass8(s.heading)}</span>
                  </td>
                  <td className="mono">
                    {s.etaHm}
                    {s.dark && (
                      <span className="moon" title="after sunset">
                        {" "}
                        ☾
                      </span>
                    )}
                  </td>
                  <td>
                    <span className="wx-chip" data-bin={tempBin(mode === "air" ? h.t : h.feels)}>
                      {Math.round(mode === "air" ? h.t : h.feels)}°
                    </span>
                    <span className="xs muted"> {mode === "air" ? `feels ${Math.round(h.feels)}°` : `air ${Math.round(h.t)}°`}</span>
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
    </details>
  );
}

// ---- glyphs ------------------------------------------------------------------------

const DROP = "M0,-6.5 C0,-6.5 -5,-0.5 -5,2.5 A5,5 0 0 0 5,2.5 C5,-0.5 0,-6.5 0,-6.5 Z";

function Glyph({ kind }: { kind: RainGlyph }) {
  switch (kind) {
    case "none":
      return <circle className="wx-none" r={1.6} />;
    case "maybe":
      return <path className="wx-drop wx-drop-maybe" d={DROP} />;
    case "light":
      return <path className="wx-drop" d={DROP} transform="scale(0.72)" />;
    case "rain":
      return <path className="wx-drop" d={DROP} />;
    case "heavy":
      return (
        <g className="wx-drop">
          <path d={DROP} transform="translate(-5,-2) scale(0.8)" />
          <path d={DROP} transform="translate(5,-2) scale(0.8)" />
          <path d={DROP} transform="translate(0,5) scale(0.8)" />
        </g>
      );
    case "snow":
      return (
        <g className="wx-flake">
          {[0, 60, 120].map((a) => (
            <line key={a} x1={0} y1={-7} x2={0} y2={7} transform={`rotate(${a})`} />
          ))}
          {[0, 60, 120, 180, 240, 300].map((a) => (
            <path key={a} d="M0,-7 L-2.2,-4.6 M0,-7 L2.2,-4.6" transform={`rotate(${a})`} />
          ))}
        </g>
      );
    case "storm":
      return <path className="wx-bolt" d="M2.5,-8 L-4.5,1 L-0.5,1 L-2.5,8 L5,-2 L1,-2 Z" />;
    default:
      return null;
  }
}

/** An arrow pointing where the wind blows, with the road running left → right. */
function Arrow({ kind, rel, len }: { kind: WindKind; rel: number; len: number }) {
  // `rel` is where the wind comes *from* relative to the heading; it blows the other way.
  const rot = (rel + 180) % 360;
  const half = len / 2;
  return (
    <g className="wx-arrow" data-kind={kind} transform={`rotate(${rot})`}>
      <path d={`M${-half},0 L${half},0`} />
      <path d={`M${half - 6},-4.5 L${half},0 L${half - 6},4.5`} />
    </g>
  );
}

// ---- words -------------------------------------------------------------------------

function rainWords(h: Hour): string {
  const g = rainGlyph(h);
  const chance = h.pp != null ? `${h.pp}%` : "";
  if (g === "snow") return `snow${chance ? `, ${chance}` : ""}`;
  if (g === "storm") return `thunder${chance ? `, ${chance}` : ""}`;
  if (h.mm >= 0.2) return `${chance ? chance + ", " : ""}${h.mm} mm/h`;
  if (chance) return `${chance} chance`;
  return "dry";
}

function placeFor(profile: RouteProfile, s: SegmentWx): string {
  const inside = profile.towns.filter((t) => t.mile >= s.fromMi && t.mile < s.toMi);
  if (inside.length) return inside.slice(0, 2).map((t) => t.name).join(" · ");
  let best: { name: string; d: number } | null = null;
  for (const t of profile.towns) {
    const dd = Math.abs(t.mile - s.midMi);
    if (!best || dd < best.d) best = { name: t.name, d: dd };
  }
  return best && best.d <= 7 ? `near ${best.name}` : "";
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

function fmtDayLong(ymd: string): string {
  if (!ymd) return "";
  const d = new Date(ymd + "T12:00:00Z");
  if (Number.isNaN(d.getTime())) return ymd;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${g("weekday")} ${g("day")} ${g("month")}`;
}
