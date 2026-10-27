"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RouteProfile } from "@/lib/route";
import { fmtHm, mileAtTime, pointAtMile, timeAtMile, type DayResult } from "@/lib/plan";

// The ride as a cross-section: each day's profile with a bicycle riding it, the
// time of day above the bike, the towns lighting up as it passes them. Runs on a
// loop, two days in about a minute. Everything moving is driven straight from
// requestAnimationFrame through refs; React only lays the scene out.

type Props = {
  profiles: RouteProfile[];
  /** The public timetable, every stop in: the bike pauses where the riders will. */
  results: DayResult[];
  /** The public names for each day's ends. */
  dayLabels: Record<number, { start: string; end: string }>;
};

/** Seconds of animation per hour of riding. */
const SEC_PER_HOUR = 2.4;
/** The pause at the hotel between the days, and at the cemetery before the loop restarts. */
const HOLD_OVERNIGHT = 2.5;
const HOLD_FINISH = 4.5;
const PAD = { l: 10, r: 10 };
const DEFAULT_W = 960;
const DAY_SHORT: Record<number, string> = { 1: "Sat 14 Nov", 2: "Sun 15 Nov" };
/** Towns whose names should survive when there's no room for every label. */
const MAJOR = new Set(["Barnes", "St Albans", "Dunstable", "Newport Pagnell", "Northampton", "Leicester", "Loughborough", "Derby", "Belper", "Matlock", "Bakewell", "Sheffield", "Penistone", "Wakefield", "Leeds", "Yeadon"]);
const CHAR_W = 6.7; // 11px mono, roughly

type TownLabel = { name: string; mile: number; x: number; line: 0 | 1 | null; lx: number; anchor: "start" | "middle" | "end" };
type Row = {
  day: number;
  profile: RouteProfile;
  result: DayResult;
  x: (mile: number) => number;
  y: (ele: number) => number;
  headBase: number;
  top: number;
  bandTop: number;
  baseline: number;
  path: string;
  area: string;
  dawnX: number | null;
  duskX: number | null;
  towns: TownLabel[];
  stops: { n: number; mile: number; x: number; y: number }[];
  xEnd: number;
};
type Segment = { i: number; t0: number; dur: number; hold: number; end: number };

export function RideStrip({ profiles, results, dayLabels }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const phase = useRef(0);
  const [measured, setMeasured] = useState<number | null>(null);
  const w = measured ?? DEFAULT_W;
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => setMeasured(Math.max(320, Math.round(el.getBoundingClientRect().width)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const narrow = w < 560;
  const geo = useMemo(() => ({ headH: 18, hud: 60, band: narrow ? 72 : 104, labels: 40 }), [narrow]);

  const { rows, H } = useMemo(() => {
    const longest = Math.max(1, ...profiles.map((p) => p.miles));
    const ppm = (w - PAD.l - PAD.r) / longest;
    const eles = profiles.flatMap((p) => p.points.map((pt) => pt[2]));
    const minE = Math.min(0, ...eles);
    const maxE = Math.max(minE + 50, Math.ceil((Math.max(...eles) + 20) / 50) * 50);
    let cursor = 0;
    const rows: Row[] = results.map((result, i) => {
      const profile = profiles.find((p) => p.day === result.day) ?? profiles[i];
      // One vertical scale for both days (the Peak District is the hilly one), with the
      // room above each row cut to what its own highest point needs for the bike and clock.
      const dayMax = Math.max(minE, ...profile.points.map((pt) => pt[2]));
      const slack = (1 - (dayMax - minE) / (maxE - minE)) * geo.band;
      const y0 = cursor;
      const bandTop = y0 + geo.headH + geo.hud - slack;
      const baseline = bandTop + geo.band;
      cursor = baseline + geo.labels;
      const x = (mile: number) => PAD.l + mile * ppm;
      const y = (ele: number) => bandTop + (1 - (ele - minE) / (maxE - minE)) * geo.band;
      const pts = profile.points.map((p) => `${x(p[3]).toFixed(1)},${y(p[2]).toFixed(1)}`);
      const path = `M${pts.join("L")}`;
      const xEnd = x(profile.miles);
      const area = `${path}L${xEnd.toFixed(1)},${baseline.toFixed(1)}L${PAD.l},${baseline.toFixed(1)}Z`;
      // Where daylight starts and ends along the line.
      const minPerMile = 60 / result.speedMph;
      let dawnMile: number | null = null;
      let duskMile: number | null = null;
      for (let m = 0; m <= profile.miles; m += 0.25) {
        const t = timeAtMile(result.events, m, minPerMile);
        if (dawnMile == null && t >= result.sunrise) dawnMile = m;
        if (duskMile == null && t >= result.sunset) duskMile = m;
      }
      const towns = placeLabels(profile.towns, x, w);
      let n = 0;
      const stops = result.events.filter((e) => e.kind === "named").map((e) => ({ n: ++n, mile: e.mile, x: x(e.mile), y: y(e.eleM) }));
      return {
        day: result.day,
        profile,
        result,
        x,
        y,
        headBase: y0 + 12,
        top: y0,
        bandTop,
        baseline,
        path,
        area,
        dawnX: dawnMile != null && dawnMile > 0 ? x(dawnMile) : null,
        duskX: duskMile != null ? x(duskMile) : null,
        towns,
        stops,
        xEnd,
      };
    });
    return { rows, H: cursor + 4 };
  }, [profiles, results, w, geo]);

  // The loop: each day rides for its planned hours, then holds.
  const timeline = useMemo(() => {
    const segs: Segment[] = [];
    let t = 0;
    results.forEach((r, i) => {
      const dur = Math.max(1, ((r.finish - r.start) / 60) * SEC_PER_HOUR);
      const hold = i === results.length - 1 ? HOLD_FINISH : HOLD_OVERNIGHT;
      segs.push({ i, t0: t, dur, hold, end: t + dur + hold });
      t += dur + hold;
    });
    return { segs, length: t };
  }, [results]);

  // Reduced motion: hold on the finished ride, every town lit; Play still starts it.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      setReduced(mq.matches);
      if (mq.matches) {
        setPaused(true);
        phase.current = Math.max(0, timeline.length - 0.01);
      }
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [timeline.length]);

  // ---- refs the frame loop writes to ---------------------------------------
  const bike = useRef<SVGGElement>(null);
  const glyph = useRef<SVGGElement>(null);
  const clock = useRef<SVGTextElement>(null);
  const mileText = useRef<SVGTextElement>(null);
  const clips = useRef<(SVGRectElement | null)[]>([]);
  const rowEls = useRef<(SVGGElement | null)[]>([]);
  const townEls = useRef<{ tick: SVGLineElement | null; name: SVGTextElement | null }[][]>([]);
  const stopEls = useRef<(SVGGElement | null)[][]>([]);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const last = useRef<{ clock: string; mile: string; lit: number[]; stops: number[]; active: number }>({ clock: "", mile: "", lit: [], stops: [], active: -1 });
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const paint = (p: number) => {
      const seg = timeline.segs.find((s) => p < s.end) ?? timeline.segs[timeline.segs.length - 1];
      if (!seg) return;
      const row = rows[seg.i];
      const r = row.result;
      const riding = p < seg.t0 + seg.dur;
      const t = riding ? r.start + ((p - seg.t0) / SEC_PER_HOUR) * 60 : r.finish;
      const where = mileAtTime(r.events, t, 60 / r.speedMph);
      const mile = Math.min(row.profile.miles, Math.max(0, where.mile));
      const pt = pointAtMile(row.profile.points, mile);
      const bx = row.x(mile);
      const by = row.y(pt[2]);
      const ahead = pointAtMile(row.profile.points, Math.min(row.profile.miles, mile + 0.3));
      const behind = pointAtMile(row.profile.points, Math.max(0, mile - 0.3));
      const dx = row.x(ahead[3]) - row.x(behind[3]);
      const dy = row.y(ahead[2]) - row.y(behind[2]);
      const tilt = dx > 0 ? Math.max(-24, Math.min(24, (Math.atan2(dy, dx) * 180) / Math.PI)) : 0;
      const b = bike.current;
      if (b) {
        b.setAttribute("transform", `translate(${bx.toFixed(1)} ${by.toFixed(1)})`);
        glyph.current?.setAttribute("transform", `rotate(${tilt.toFixed(1)})`);
        const moving = riding && !where.stopped;
        if ((b.dataset.moving === "1") !== moving) b.dataset.moving = moving ? "1" : "0";
      }
      const dark = t > r.sunset || t < r.sunrise;
      const clockStr = `${fmtHm(t)}${dark ? " ☾" : ""}`;
      if (clock.current && last.current.clock !== clockStr) {
        clock.current.textContent = clockStr;
        last.current.clock = clockStr;
      }
      const total = results.reduce((a, x) => a + x.miles, 0);
      const mileStr = !riding && seg.i === results.length - 1 ? `${Math.round(total)} miles` : `mile ${Math.round(mile)}`;
      if (mileText.current && last.current.mile !== mileStr) {
        mileText.current.textContent = mileStr;
        last.current.mile = mileStr;
      }
      if (last.current.active !== seg.i) {
        rowEls.current.forEach((el, i) => el && (el.dataset.active = i === seg.i ? "1" : "0"));
        last.current.active = seg.i;
      }
      rows.forEach((rw, i) => {
        const done = i < seg.i;
        const here = i === seg.i;
        const cur = done ? rw.profile.miles + 1 : here ? mile : -1;
        const clip = clips.current[i];
        if (clip) clip.setAttribute("width", Math.max(0, (done ? rw.xEnd : here ? bx : PAD.l) - PAD.l).toFixed(1));
        // Towns: how many are behind the bike. Only touch the DOM when that changes.
        let lit = 0;
        for (const tw of rw.towns) if (tw.mile <= cur + 0.05) lit++;
        const was = last.current.lit[i] ?? -1;
        if (lit !== was) {
          const els = townEls.current[i] ?? [];
          rw.towns.forEach((tw, k) => {
            const on = k < lit;
            for (const el of [els[k]?.tick, els[k]?.name]) {
              if (!el) continue;
              el.dataset.lit = on ? "1" : "0";
              if (on && k >= was && here) {
                el.dataset.just = "1";
                timers.current.push(window.setTimeout(() => (el.dataset.just = "0"), 1500));
              }
            }
          });
          last.current.lit[i] = lit;
        }
        let stopsLit = 0;
        for (const s of rw.stops) if (s.mile <= cur + 0.05) stopsLit++;
        if (stopsLit !== (last.current.stops[i] ?? -1)) {
          (stopEls.current[i] ?? []).forEach((el, k) => el && (el.dataset.lit = k < stopsLit ? "1" : "0"));
          last.current.stops[i] = stopsLit;
        }
      });
    };

    last.current = { clock: "", mile: "", lit: [], stops: [], active: -1 };
    if (reduced && paused) {
      paint(phase.current);
      return;
    }
    let raf = 0;
    let prev = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - prev) / 1000);
      prev = now;
      if (!pausedRef.current) phase.current = (phase.current + dt) % timeline.length;
      paint(phase.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      timers.current.forEach((id) => clearTimeout(id));
      timers.current = [];
    };
  }, [rows, timeline, results, reduced, paused]);

  const total = Math.round(results.reduce((a, r) => a + r.miles, 0));

  return (
    <div className="ride-strip" ref={wrap} data-ready={measured != null || undefined}>
      {measured == null && <div className="ride-strip-wait" style={{ height: H }} />}
      {measured != null && (
      <svg
        viewBox={`0 0 ${w} ${H}`}
        width="100%"
        height={H}
        role="img"
        aria-label={`The two days as a cross-section: a bicycle riding the ${total} miles with the time of day, the towns lighting up as it passes`}
        onClick={() => setPaused((p) => !p)}
      >
        <defs>
          {rows.map((rw, i) => (
            <clipPath key={rw.day} id={`ride-done-${rw.day}`}>
              <rect ref={(el) => void (clips.current[i] = el)} x={PAD.l} y={rw.bandTop - 70} width={0} height={geo.band + 80} />
            </clipPath>
          ))}
        </defs>
        {rows.map((rw, i) => (
          <g key={rw.day} className="ride-row" data-day={rw.day} ref={(el) => void (rowEls.current[i] = el)}>
            <text className="ride-head" x={PAD.l} y={rw.headBase}>
              Day {rw.day} · {DAY_SHORT[rw.day] ?? ""}
              {!narrow && dayLabels[rw.day] && ` · ${dayLabels[rw.day].start} → ${dayLabels[rw.day].end}`}
            </text>
            <text className="ride-head ride-head-r" x={w - PAD.r} y={rw.headBase} textAnchor="end">
              {!narrow && `${Math.round(rw.profile.miles)} mi · `}
              {fmtHm(rw.result.start)} → ~{fmtHm(rw.result.finish)}
            </text>
            {rw.dawnX != null && <rect className="ride-night" x={PAD.l} y={rw.bandTop} width={Math.max(0, rw.dawnX - PAD.l)} height={geo.band} />}
            {rw.duskX != null && <rect className="ride-night" x={rw.duskX} y={rw.bandTop} width={Math.max(0, rw.xEnd - rw.duskX)} height={geo.band} />}
            <line className="ride-ground" x1={PAD.l} x2={rw.xEnd} y1={rw.baseline} y2={rw.baseline} />
            <path className="ride-area ride-ahead" d={rw.area} />
            <path className="ride-line ride-ahead" d={rw.path} />
            <g clipPath={`url(#ride-done-${rw.day})`}>
              <path className="ride-area ride-done" d={rw.area} />
              <path className="ride-line ride-done" d={rw.path} />
            </g>
            {/* ticks first, names after, so a name sits over any tick running through it */}
            {rw.towns.map((t, k) => (
              <line
                key={t.name}
                className="ride-tick"
                data-lit="0"
                data-just="0"
                ref={(el) => {
                  (townEls.current[i] ??= [])[k] = { tick: el, name: townEls.current[i]?.[k]?.name ?? null };
                }}
                x1={t.x}
                x2={t.x}
                y1={rw.baseline}
                y2={rw.baseline + (t.line == null ? 5 : t.line === 0 ? 7 : 19)}
              />
            ))}
            {rw.towns.map(
              (t, k) =>
                t.line != null && (
                  <text
                    key={t.name}
                    className="ride-name"
                    data-lit="0"
                    data-just="0"
                    ref={(el) => {
                      (townEls.current[i] ??= [])[k] = { tick: townEls.current[i]?.[k]?.tick ?? null, name: el };
                    }}
                    x={t.lx}
                    y={rw.baseline + (t.line === 0 ? 19 : 31)}
                    textAnchor={t.anchor}
                  >
                    {t.name}
                  </text>
                ),
            )}
            {rw.stops.map((s, k) => (
              <g
                key={s.n}
                className="ride-stop"
                data-lit="0"
                ref={(el) => {
                  (stopEls.current[i] ??= [])[k] = el;
                }}
              >
                <line x1={s.x} x2={s.x} y1={s.y} y2={rw.baseline} />
                <circle cx={s.x} cy={s.y} r={7} />
                <text x={s.x} y={s.y + 3.5} textAnchor="middle">
                  {s.n}
                </text>
              </g>
            ))}
          </g>
        ))}
        <g className="ride-bike" ref={bike} data-moving="0" transform={`translate(${PAD.l} ${rows[0]?.y(rows[0].profile.points[0]?.[2] ?? 0) ?? 0})`}>
          <text className="ride-clock" ref={clock} x={0} y={-45} textAnchor="middle">
            {fmtHm(results[0]?.start ?? 420)}
          </text>
          <text className="ride-mile" ref={mileText} x={0} y={-33} textAnchor="middle">
            mile 0
          </text>
          <g ref={glyph}>
            <Bicycle />
          </g>
        </g>
      </svg>
      )}
      <div className="ride-strip-foot xs muted">
        <span>
          Both days at a steady 12 mph with the planned stops; the shading is after sunset. The clock is the plan, not the day.
        </span>
        <button type="button" className="btn btn-sm btn-quiet" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>
          {paused ? "Play" : "Pause"}
        </button>
      </div>
    </div>
  );
}

/** A small side-on bicycle with a rider, drawn with the ground at y = 0 and the front to the right. */
function Bicycle() {
  return (
    <g className="ride-bike-glyph">
      <g className="ride-wheel">
        <circle cx={-9.5} cy={-6.5} r={6.5} />
        <line x1={-9.5} x2={-9.5} y1={-13} y2={0} />
        <line x1={-15.1} x2={-3.9} y1={-9.75} y2={-3.25} />
        <line x1={-15.1} x2={-3.9} y1={-3.25} y2={-9.75} />
      </g>
      <g className="ride-wheel">
        <circle cx={9.5} cy={-6.5} r={6.5} />
        <line x1={9.5} x2={9.5} y1={-13} y2={0} />
        <line x1={3.9} x2={15.1} y1={-9.75} y2={-3.25} />
        <line x1={3.9} x2={15.1} y1={-3.25} y2={-9.75} />
      </g>
      {/* frame: rear hub, bottom bracket, seat, head tube, front hub */}
      <path className="ride-frame" d="M-9.5,-6.5 L-1,-6 L6,-16 L-3.5,-16 Z M-3.5,-16 L-1,-6 M6,-16 L9.5,-6.5 M-5.5,-17.5 L-1.5,-17.5 M6.5,-17.5 L8.5,-18.5" />
      {/* rider */}
      <path className="ride-rider" d="M-3,-17.5 L3,-25.5 L7,-18.5 M-3,-17.5 L1,-12.5 L-1,-7" />
      <circle className="ride-rider-head" cx={4.6} cy={-29} r={3.1} />
    </g>
  );
}

/** Lay the town names along the baseline on two lines, the better-known names first, dropping what won't fit. */
function placeLabels(towns: RouteProfile["towns"], x: (mile: number) => number, w: number): TownLabel[] {
  const out: TownLabel[] = towns.map((t) => ({ name: t.name, mile: t.mile, x: x(t.mile), line: null, lx: x(t.mile), anchor: "middle" }));
  const order = [...out].sort((a, b) => Number(MAJOR.has(b.name)) - Number(MAJOR.has(a.name)) || a.mile - b.mile);
  const lines: { a: number; b: number }[][] = [[], []];
  for (const o of order) {
    const width = o.name.length * CHAR_W + 10;
    let a = o.x - width / 2;
    let b = o.x + width / 2;
    if (a < PAD.l) {
      o.anchor = "start";
      a = o.x - 2;
      b = a + width;
    } else if (b > w - PAD.r) {
      o.anchor = "end";
      b = o.x + 2;
      a = b - width;
    }
    for (let li = 0; li < 2; li++) {
      if (lines[li].every((iv) => b <= iv.a || a >= iv.b)) {
        lines[li].push({ a, b });
        o.line = li as 0 | 1;
        break;
      }
    }
  }
  return out;
}
