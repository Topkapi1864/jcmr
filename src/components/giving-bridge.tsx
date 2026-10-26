import type { Donation } from "@/lib/donate";
import { RIDE_DAYS } from "@/lib/constants";
import { TZ } from "@/lib/time";

// The giving bridge (Give page). A suspension bridge from Barnes to Yeadon
// whose deck, hangers and cable are built from the Barnes end as the money
// comes in; the span is the target. Beneath it, the river is a timeline from
// the day the JustGiving page opened to the ride days, and the water rises
// with every gift. The two meet when the target is reached. Pure SVG,
// server-rendered, no script; tooltips are <title> elements.

const W = 960;
const H = 470;
const X0 = 70; // left bank edge, also the start of the timeline
const X1 = 890; // right bank edge, also the end of the timeline
const SPAN = X1 - X0;
const DECK = 206; // deck top
const DECK_H = 12;
const TOWER_L = 190;
const TOWER_R = 770;
const TOWER_TOP = 64;
const CABLE_LOW = 236; // quadratic control y; the cable's low point is ~ (TOWER_TOP + CABLE_LOW) / 2 + ...
const WATER_TOP = DECK + DECK_H + 14; // where the water would meet the deck
const AXIS = 416; // the timeline baseline
const PLANK = 10;

const fmtDate = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short" }).format(new Date(iso));

export function GivingBridge({
  total,
  target,
  donations,
  opened,
  today,
}: {
  total: number;
  target: number;
  donations: Donation[];
  opened: string; // YYYY-MM-DD the page opened
  today: string; // YYYY-MM-DD in London
}) {
  const t0 = Date.parse(opened + "T00:00:00Z");
  const t1 = Date.parse(RIDE_DAYS[1] + "T23:59:59Z");
  const tx = (ms: number) => X0 + (Math.min(Math.max(ms, t0), t1) - t0) / (t1 - t0) * SPAN;
  const dayX = (ymd: string) => tx(Date.parse(ymd + "T00:00:00Z"));
  const py = (pounds: number) => AXIS - Math.min(1, pounds / target) * (AXIS - WATER_TOP);

  const frac = Math.min(1, total / target);
  const built = SPAN * frac;
  const edge = X0 + built;
  const complete = total >= target;

  // The cable: side spans straight to the anchors, a quadratic between the towers.
  const cable = `M40 ${DECK} L${TOWER_L} ${TOWER_TOP} Q${(TOWER_L + TOWER_R) / 2} ${CABLE_LOW} ${TOWER_R} ${TOWER_TOP} L${W - 40} ${DECK}`;
  // Hangers every plank; the y on the cable comes from the matching segment.
  const cableY = (x: number) => {
    if (x <= TOWER_L) return DECK + (TOWER_TOP - DECK) * ((x - 40) / (TOWER_L - 40));
    if (x >= TOWER_R) return TOWER_TOP + (DECK - TOWER_TOP) * ((x - TOWER_R) / (W - 40 - TOWER_R));
    const t = (x - TOWER_L) / (TOWER_R - TOWER_L);
    return (1 - t) * (1 - t) * TOWER_TOP + 2 * (1 - t) * t * CABLE_LOW + t * t * TOWER_TOP;
  };
  const hangers: number[] = [];
  for (let x = X0 + PLANK; x < X1; x += PLANK * 2) hangers.push(x);

  // The water: a step line through the gifts, oldest first, rising with each.
  let cum = 0;
  const steps: { x: number; y: number; d: Donation; cum: number }[] = [];
  for (const d of donations) {
    cum += d.amount ?? 0;
    steps.push({ x: tx(Date.parse(d.at)), y: py(cum), d, cum });
  }
  // If the feed is short of the headline total (hidden amounts, offline gifts), lift the last step to it.
  const lastY = py(Math.max(cum, total));
  const nowX = tx(Date.now());
  let water = `M${X0} ${AXIS}`;
  let prevY = AXIS;
  for (const s of steps) {
    water += ` L${s.x.toFixed(1)} ${prevY.toFixed(1)} L${s.x.toFixed(1)} ${s.y.toFixed(1)}`;
    prevY = s.y;
  }
  if (steps.length && lastY < prevY) {
    const lx = steps[steps.length - 1].x;
    water += ` L${lx.toFixed(1)} ${lastY.toFixed(1)}`;
    prevY = lastY;
  }
  water += ` L${nowX.toFixed(1)} ${prevY.toFixed(1)}`;
  const waterLine = water;
  const waterArea = water + ` L${nowX.toFixed(1)} ${AXIS} Z`;

  // Timeline ticks: the first of each month inside the window, plus the ride.
  const months: { x: number; label: string }[] = [];
  for (const ymd of ["2026-10-01", "2026-11-01"]) {
    const x = dayX(ymd);
    if (Date.parse(ymd) > t0 && Date.parse(ymd) < t1 && x - X0 > 70) months.push({ x, label: fmtDate(ymd + "T12:00:00Z") });
  }
  const rideX0 = dayX(RIDE_DAYS[0]);
  const todayX = dayX(today);
  const preRide = today < RIDE_DAYS[0];
  const r = (amount: number | null) => (amount === null ? 3 : Math.max(3, Math.min(11, 2 + Math.sqrt(amount) * 0.55)));
  const pounds = (n: number) => "£" + n.toLocaleString("en-GB");

  return (
    <div className="bridge-scroll">
      <svg className="bridge" viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="bridge-title bridge-desc">
        <title id="bridge-title">The giving bridge</title>
        <desc id="bridge-desc">
          {pounds(total)} raised of a {pounds(target)} target, from {donations.length} gifts since the page opened on {fmtDate(opened + "T12:00:00Z")}. The bridge is {Math.round(frac * 100)}% built.
        </desc>
        <defs>
          <clipPath id="bridge-built">
            <rect x="0" y="0" width={edge} height={H} />
          </clipPath>
        </defs>

        {/* Water and timeline */}
        <rect x={rideX0} y={WATER_TOP - 6} width={X1 - rideX0} height={AXIS - WATER_TOP + 6} className="bridge-ride-band" />
        <path d={waterArea} className="bridge-water" />
        <path d={waterLine} className="bridge-water-line" />
        <line x1={X0} y1={AXIS} x2={X1} y2={AXIS} className="bridge-axis" />
        {months.map((m) => (
          <g key={m.label}>
            <line x1={m.x} y1={AXIS} x2={m.x} y2={AXIS + 6} className="bridge-axis" />
            <text x={m.x} y={AXIS + 22} className="bridge-tick" textAnchor="middle">
              {m.label}
            </text>
          </g>
        ))}
        <text x={X0} y={AXIS + 22} className="bridge-tick" textAnchor="start">
          Page opened {fmtDate(opened + "T12:00:00Z")}
        </text>
        <text x={X1} y={AXIS + 22} className="bridge-tick" textAnchor="end">
          The ride, 14 and 15 Nov
        </text>
        {preRide && (
          <g>
            <line x1={todayX} y1={WATER_TOP - 6} x2={todayX} y2={AXIS} className="bridge-today" />
            <text x={todayX} y={AXIS + 40} className="bridge-tick bridge-tick-strong" textAnchor="middle">
              Today
            </text>
          </g>
        )}
        {/* Gifts */}
        {steps.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={r(s.d.amount)} className={s.d.amount === null ? "bridge-gift bridge-gift-hidden" : "bridge-gift"}>
            <title>
              {s.d.name}
              {s.d.amount !== null ? ` gave ${pounds(s.d.amount)}` : " gave"} on {fmtDate(s.d.at)} · {pounds(s.cum)} so far
            </title>
          </circle>
        ))}

        {/* Banks */}
        <path d={`M0 ${DECK - 2} L${X0} ${DECK - 2} L${X0} ${AXIS + 2} L0 ${AXIS + 2} Z`} className="bridge-bank" />
        <path d={`M${X1} ${DECK - 2} L${W} ${DECK - 2} L${W} ${AXIS + 2} L${X1} ${AXIS + 2} Z`} className="bridge-bank" />
        <text x={X0 / 2} y={DECK + 34} className="bridge-place" textAnchor="middle">
          Barnes
        </text>
        <text x={(X1 + W) / 2} y={DECK + 34} className="bridge-place" textAnchor="middle">
          Yeadon
        </text>

        {/* The unbuilt bridge, ghosted */}
        <g className="bridge-ghost">
          <path d={cable} />
          {hangers.map((x) => (
            <line key={x} x1={x} y1={cableY(x)} x2={x} y2={DECK} />
          ))}
          <rect x={X0} y={DECK} width={SPAN} height={DECK_H} rx="2" />
        </g>

        {/* The built bridge */}
        <g clipPath="url(#bridge-built)" className="bridge-built">
          <path d={cable} className="bridge-cable" />
          {hangers.map((x) => (
            <line key={x} x1={x} y1={cableY(x)} x2={x} y2={DECK} className="bridge-hanger" />
          ))}
          <rect x={X0} y={DECK} width={SPAN} height={DECK_H} rx="2" className="bridge-deck" />
          {Array.from({ length: Math.floor(SPAN / PLANK) }, (_, i) => X0 + (i + 1) * PLANK).map((x) => (
            <line key={x} x1={x} y1={DECK + 1} x2={x} y2={DECK + DECK_H - 1} className="bridge-plank" />
          ))}
        </g>

        {/* Towers, always standing */}
        {[TOWER_L, TOWER_R].map((x) => (
          <g key={x} className="bridge-tower">
            <rect x={x - 7} y={TOWER_TOP - 4} width="14" height={AXIS - TOWER_TOP - 40} rx="2" />
            <rect x={x - 11} y={TOWER_TOP - 10} width="22" height="8" rx="2" />
            <rect x={x - 12} y={DECK - 3} width="24" height={DECK_H + 6} rx="2" />
          </g>
        ))}

        {/* The leading edge: the wheel, and the total */}
        {!complete && (
          <g transform={`translate(${edge} ${DECK - 15})`}>
            <circle r="13" className="bridge-wheel-ring" />
            <line x1="0" y1="-9" x2="0" y2="9" className="bridge-wheel-spoke" />
            <line x1="-9" y1="0" x2="9" y2="0" className="bridge-wheel-spoke" />
            <line x1="-6.4" y1="-6.4" x2="6.4" y2="6.4" className="bridge-wheel-spoke" />
            <line x1="6.4" y1="-6.4" x2="-6.4" y2="6.4" className="bridge-wheel-spoke" />
            <circle r="2.4" className="bridge-wheel-hub" />
          </g>
        )}
        <g transform={`translate(${complete ? X1 : edge + 24} ${DECK - 8})`}>
          <text x="0" y="0" className="bridge-total" textAnchor={complete ? "end" : "start"}>
            {pounds(total)}
          </text>
          <text x="0" y="-32" className="bridge-label" textAnchor={complete ? "end" : "start"}>
            {complete ? "Target reached, bridge built" : "raised so far"}
          </text>
        </g>
        {!complete && edge < X1 - 220 && (
          <text x={X1 - 4} y={DECK - 8} className="bridge-label" textAnchor="end">
            {pounds(target)} target
          </text>
        )}
      </svg>
    </div>
  );
}
