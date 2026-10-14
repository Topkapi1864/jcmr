"use client";

import { useMemo, useRef, useState } from "react";
import type { RouteProfile } from "@/lib/route";
import type { DayResult } from "@/lib/plan";
import { fmtHm, pointAtMile, timeAtMile } from "@/lib/plan";

type Props = {
  profile: RouteProfile;
  result: DayResult;
  onHover: (mile: number | null) => void;
  onPick: (mile: number) => void;
};

const W = 1000;
const H = 220;
const PAD = { l: 44, r: 12, t: 18, b: 26 };

export function Elevation({ profile, result, onHover, onPick }: Props) {
  const [cursor, setCursor] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const miles = profile.miles || 1;
  const x = (mile: number) => PAD.l + (mile / miles) * (W - PAD.l - PAD.r);

  const { path, area, minE, maxE, y } = useMemo(() => {
    const eles = profile.points.map((p) => p[2]);
    const minE = Math.floor((Math.min(...eles) - 10) / 50) * 50;
    const maxE = Math.ceil((Math.max(...eles) + 20) / 50) * 50;
    const y = (e: number) => PAD.t + (1 - (e - minE) / Math.max(1, maxE - minE)) * (H - PAD.t - PAD.b);
    const pts = profile.points.map((p) => `${x(p[3]).toFixed(1)},${y(p[2]).toFixed(1)}`);
    const path = `M${pts.join("L")}`;
    const area = `${path}L${x(miles).toFixed(1)},${(H - PAD.b).toFixed(1)}L${PAD.l},${(H - PAD.b).toFixed(1)}Z`;
    return { path, area, minE, maxE, y };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  if (!profile.present) {
    return (
      <div className="elev elev-empty">
        <span>Day {profile.day}: elevation appears when the GPX is in. Distances below use Simon&rsquo;s roadbook miles.</span>
      </div>
    );
  }

  const mileFromEvent = (ev: React.MouseEvent | React.TouchEvent): number | null => {
    const el = svg.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const clientX = "touches" in ev ? ev.touches[0]?.clientX : ev.clientX;
    if (clientX == null) return null;
    const px = ((clientX - rect.left) / rect.width) * W;
    const mile = ((px - PAD.l) / (W - PAD.l - PAD.r)) * miles;
    return mile < 0 || mile > miles ? null : mile;
  };
  const move = (ev: React.MouseEvent | React.TouchEvent) => {
    const m = mileFromEvent(ev);
    setCursor(m);
    onHover(m);
  };
  const leave = () => {
    setCursor(null);
    onHover(null);
  };

  const minPerMile = 60 / result.speedMph;
  const cur = cursor != null ? pointAtMile(profile.points, cursor) : null;
  const curT = cursor != null ? timeAtMile(result.events, cursor, minPerMile) : null;
  // Daylight band: where on the x axis sunset falls.
  const sunsetMile = (() => {
    for (let m = 0; m <= miles; m += 0.5) if (timeAtMile(result.events, m, minPerMile) >= result.sunset) return m;
    return null;
  })();
  const ticks = [];
  for (let m = 0; m <= miles; m += miles > 80 ? 20 : 10) ticks.push(m);
  const eTicks = [];
  for (let e = minE; e <= maxE; e += (maxE - minE) / 4) eTicks.push(Math.round(e));

  return (
    <div className="elev">
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        onMouseMove={move}
        onMouseLeave={leave}
        onTouchMove={move}
        onTouchEnd={leave}
        onClick={() => cursor != null && onPick(cursor)}
        role="img"
        aria-label={`Elevation profile for day ${profile.day}`}
      >
        {sunsetMile != null && <rect className="elev-dark" x={x(sunsetMile)} y={PAD.t} width={Math.max(0, x(miles) - x(sunsetMile))} height={H - PAD.t - PAD.b} />}
        {eTicks.map((e) => (
          <g key={e}>
            <line className="elev-grid" x1={PAD.l} x2={W - PAD.r} y1={y(e)} y2={y(e)} />
            <text className="elev-tick" x={PAD.l - 6} y={y(e) + 3} textAnchor="end">
              {Math.round(e * 3.281)}
            </text>
          </g>
        ))}
        <path className="elev-area" d={area} />
        <path className="elev-line" d={path} />
        {ticks.map((m) => (
          <text key={m} className="elev-tick" x={x(m)} y={H - 8} textAnchor="middle">
            {m}
          </text>
        ))}
        {result.events
          .filter((e) => e.kind !== "start" && e.kind !== "finish")
          .map((e, i) => (
            <g key={i} className="elev-stop" data-kind={e.kind}>
              <line x1={x(e.mile)} x2={x(e.mile)} y1={PAD.t} y2={H - PAD.b} />
              <circle cx={x(e.mile)} cy={y(e.eleM)} r={e.kind === "named" ? 5 : 3.5} />
            </g>
          ))}
        {cur && curT != null && (
          <g className="elev-cursor">
            <line x1={x(cur[3])} x2={x(cur[3])} y1={PAD.t} y2={H - PAD.b} />
            <circle cx={x(cur[3])} cy={y(cur[2])} r={5} />
            <text x={x(cur[3]) + (cur[3] > miles * 0.75 ? -8 : 8)} y={PAD.t + 10} textAnchor={cur[3] > miles * 0.75 ? "end" : "start"}>
              mile {cur[3].toFixed(1)} · {Math.round(cur[2] * 3.281)} ft · {fmtHm(curT)}
            </text>
          </g>
        )}
      </svg>
      <div className="elev-foot xs muted">
        <span>
          {profile.miles} mi · {profile.climbFt.toLocaleString("en-GB")} ft up · {profile.descentFt.toLocaleString("en-GB")} ft down
        </span>
        <span>shaded = after sunset ({fmtHm(result.sunset)}) · click to set the probe</span>
      </div>
    </div>
  );
}
