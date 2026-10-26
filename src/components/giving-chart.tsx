import type { Donation } from "@/lib/donate";
import { RIDE_DAYS } from "@/lib/constants";
import { TZ } from "@/lib/time";

// The giving chart (Give page). One solid block per gift, each stacked on
// the one before, so the total builds up gift by gift from the day the
// JustGiving page opened to the ride days. Pure SVG, server-rendered, no
// script; hover a block for who gave and when.

const W = 960;
const H = 420;
const L = 64; // left axis
const R = 24;
const T = 36;
const B = 56;
const X0 = L;
const X1 = W - R;
const Y0 = H - B; // zero
const Y1 = T; // the target

const fmtDate = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short" }).format(new Date(iso));
const pounds = (n: number) => "£" + n.toLocaleString("en-GB");

export function GivingChart({ total, target, donations, opened, today }: { total: number; target: number; donations: Donation[]; opened: string; today: string }) {
  const t0 = Date.parse(opened + "T00:00:00Z");
  const t1 = Date.parse(RIDE_DAYS[1] + "T23:59:59Z");
  const top = Math.max(target, total) * 1.04;
  const tx = (ms: number) => X0 + ((Math.min(Math.max(ms, t0), t1) - t0) / (t1 - t0)) * (X1 - X0);
  const dayX = (ymd: string) => tx(Date.parse(ymd + "T00:00:00Z"));
  const py = (p: number) => Y0 - (Math.min(p, top) / top) * (Y0 - Y1);
  const nowX = tx(Date.now());

  // Blocks: gift i spans from its own time to now, from the running total
  // before it to the running total after it, so each sits on the ones before.
  let cum = 0;
  const blocks = donations.map((d, i) => {
    const from = cum;
    cum += d.amount ?? 0;
    const x = tx(Date.parse(d.at));
    return { d, x, y: py(cum), y2: py(from), cum };
  });
  // Anything the feed can't see (hidden amounts, offline gifts) sits as one more block on top.
  const extra = total - cum;
  const lastX = blocks.length ? blocks[blocks.length - 1].x : X0;

  const ticks: { x: number; label: string }[] = [{ x: X0, label: fmtDate(opened + "T12:00:00Z") }];
  for (const ymd of ["2026-10-15", "2026-11-01"]) if (Date.parse(ymd) > t0 && Date.parse(ymd) < t1) ticks.push({ x: dayX(ymd), label: fmtDate(ymd + "T12:00:00Z") });
  const rideX = dayX(RIDE_DAYS[0]);
  const preRide = today < RIDE_DAYS[0];
  const yTicks = [0, 1000, 2000, 3000, 4000, 5000].filter((v) => v <= top);
  const frac = Math.min(1, total / target);

  return (
    <svg className="giving-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="chart-title chart-desc">
      <title id="chart-title">Donations building up over time</title>
      <desc id="chart-desc">
        {pounds(total)} raised of a {pounds(target)} target from {donations.length} gifts since the page opened on {fmtDate(opened + "T12:00:00Z")}, {Math.round(frac * 100)}% of the way.
      </desc>

      {/* Grid and axes */}
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={X0} y1={py(v)} x2={X1} y2={py(v)} className="gc-grid" />
          <text x={X0 - 10} y={py(v) + 4} className="gc-tick" textAnchor="end">
            {v === 0 ? "0" : pounds(v)}
          </text>
        </g>
      ))}
      <rect x={rideX} y={Y1} width={X1 - rideX} height={Y0 - Y1} className="gc-ride-band" />


      {/* The blocks */}
      {blocks.map((b, i) => (
        <rect key={i} x={b.x} y={b.y} width={Math.max(2, nowX - b.x)} height={Math.max(0, b.y2 - b.y)} className="gc-block">
          <title>
            {b.d.name}
            {b.d.amount !== null ? ` gave ${pounds(b.d.amount)}` : " gave"} on {fmtDate(b.d.at)} · {pounds(b.cum)} so far
          </title>
        </rect>
      ))}
      {extra > 0 && <rect x={lastX} y={py(total)} width={Math.max(2, nowX - lastX)} height={py(cum) - py(total)} className="gc-block gc-block-extra" />}

      {/* Target line and the headline */}
      <line x1={X0} y1={py(target)} x2={X1} y2={py(target)} className="gc-target" />
      <text x={rideX - 10} y={py(target) - 8} className="gc-label" textAnchor="end">
        {pounds(target)} target
      </text>
      <g transform={`translate(${Math.min(nowX, X1 - 8)} ${py(total)})`}>
        <line x1="0" y1="0" x2="0" y2={Y0 - py(total)} className="gc-now" />
        <text x={nowX > (X0 + X1) / 2 ? -10 : 10} y="-10" className="gc-total" textAnchor={nowX > (X0 + X1) / 2 ? "end" : "start"}>
          {pounds(total)}
        </text>
        <text x={nowX > (X0 + X1) / 2 ? -10 : 10} y="-40" className="gc-label" textAnchor={nowX > (X0 + X1) / 2 ? "end" : "start"}>
          {total >= target ? "Target reached" : `${Math.round(frac * 100)}% of the way`}
        </text>
      </g>

      {/* Time axis */}
      <line x1={X0} y1={Y0} x2={X1} y2={Y0} className="gc-axis" />
      {ticks.map((t) => (
        <g key={t.label}>
          <line x1={t.x} y1={Y0} x2={t.x} y2={Y0 + 6} className="gc-axis" />
          <text x={t.x} y={Y0 + 22} className="gc-tick" textAnchor={t.x === X0 ? "start" : "middle"}>
            {t.label}
          </text>
        </g>
      ))}
      <text x={(rideX + X1) / 2} y={Y0 + 22} className="gc-tick" textAnchor="middle">
        The ride
      </text>
      {preRide && (
        <text x={Math.min(nowX, X1 - 8)} y={Y0 + 40} className="gc-tick gc-tick-strong" textAnchor={nowX > (X0 + X1) / 2 ? "end" : "middle"}>
          Today
        </text>
      )}
    </svg>
  );
}
