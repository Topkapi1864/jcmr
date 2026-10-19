"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ZONES, ZONE_BY_ID, zoneFor, type ZoneId } from "@/lib/kit-zones";

type Status = "need" | "ordered" | "have";
export type FigItem = { id: number; riderId: number; name: string; category: string; status: Status; qty: number };
export type FigRider = { id: number; name: string; first: string };

const WORD: Record<Status, string> = { have: "have", ordered: "ordered", need: "need" };

// ---- Where things sit on the drawing (viewBox 0 0 520 424) -----------------

type Spot = { bubble: [number, number]; anchor: [number, number] };
const SPOTS: Partial<Record<ZoneId, Spot>> = {
  helmet: { bubble: [312, 30], anchor: [352, 74] },
  headwear: { bubble: [240, 58], anchor: [337, 106] },
  glasses: { bubble: [428, 52], anchor: [366, 95] },
  jacket: { bubble: [170, 92], anchor: [286, 133] },
  jersey: { bubble: [96, 134], anchor: [256, 147] },
  fuel: { bubble: [40, 186], anchor: [236, 156] },
  saddle: { bubble: [112, 204], anchor: [214, 180] },
  rearLight: { bubble: [40, 262], anchor: [207, 200] },
  gloves: { bubble: [462, 118], anchor: [378, 176] },
  cockpit: { bubble: [480, 184], anchor: [384, 178] },
  frontLight: { bubble: [484, 250], anchor: [390, 198] },
  wheels: { bubble: [476, 334], anchor: [436, 320] },
  legs: { bubble: [322, 236], anchor: [292, 204] },
  bike: { bubble: [150, 386], anchor: [200, 260] },
  power: { bubble: [218, 386], anchor: [244, 260] },
  feet: { bubble: [286, 386], anchor: [272, 312] },
  bottles: { bubble: [354, 386], anchor: [306, 252] },
};

// ---- Little line icons, drawn in a 24-unit box --------------------------------

function Icon({ id }: { id: ZoneId }) {
  switch (id) {
    case "helmet":
      return <path d="M3.5 16a8.5 8.5 0 0 1 17 0Z M3.5 16h17 M8 10l1.6 3 M12 8v4 M16 10l-1.6 3" />;
    case "glasses":
      return <path d="M3 12h1 M20 12h1 M5 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M13 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M11 11.5q1-1 2 0" />;
    case "headwear":
      return <path d="M5 15a7 7 0 0 1 14 0Z M4 15h16v3H4Z M12 8V6 M10.5 5.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0" />;
    case "jacket":
      return <path d="M9 3 4 6v14h5V10 M15 3l5 3v14h-5V10 M9 3l3 3 3-3 M12 6v14 M7 13h2 M15 13h2" />;
    case "jersey":
      return <path d="M8 4 3 7l2 4 2-1v10h10V10l2 1 2-4-5-3 M8 4a4 3 0 0 0 8 0" />;
    case "gloves":
      return <path d="M7 21v-8 M7 13V7a1.5 1.5 0 0 1 3 0v5 M10 11V5a1.5 1.5 0 0 1 3 0v6 M13 11V6a1.5 1.5 0 0 1 3 0v6 M16 12V9a1.5 1.5 0 0 1 3 0v5c0 4-3 7-7 7H7" />;
    case "legs":
      return <path d="M6 3h12l1 18h-5l-2-10-2 10H5Z M6 6h12" />;
    case "feet":
      return <path d="M3 16h7l3-5 4 2.5 4 1V18H3Z M3 18v2h18v-2 M11 13.5l1.5 1.5" />;
    case "fuel":
      return <path d="M8 3h8v4l2 2v12H6V9l2-2Z M8 7h8 M10 13h4 M10 16h4" />;
    case "cockpit":
      return <path d="M7 3h10v18H7Z M9 6h6v7H9Z M10 16h4" />;
    case "frontLight":
      return <path d="M4 9h7l3-3v12l-3-3H4Z M17 8l3-1 M17 12h4 M17 16l3 1" />;
    case "rearLight":
      return <path d="M8 4h8v16H8Z M10 8h4 M10 12h4 M10 16h4" />;
    case "bottles":
      return <path d="M10 2h4v3l2 2v14H8V7l2-2Z M8 11h8 M8 15h8" />;
    case "saddle":
      return <path d="M14.5 3.5a4.5 4.5 0 0 0-4.3 5.8L3.5 16 7 19.5l6.7-6.7a4.5 4.5 0 0 0 5.8-4.3l-3 1.5-2-2 1.5-3Z" />;
    case "wheels":
      return <path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0 M10.5 12a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0 M12 3v7.5 M12 13.5V21 M3 12h7.5 M13.5 12H21" />;
    case "bike":
      return <path d="M2 16a4 4 0 1 0 8 0a4 4 0 1 0-8 0 M14 16a4 4 0 1 0 8 0a4 4 0 1 0-8 0 M6 16l4-8h7l1 8 M10 8l3 8H6 M9 6h3 M16 5h3" />;
    case "power":
      return <path d="M7 6h10v15H7Z M10 3.5h4V6 M13 9l-3 4h4l-3 4" />;
    case "bag":
      return <path d="M4 8h16v12H4Z M9 8V5h6v3 M4 13h16" />;
    case "car":
      return <path d="M3 16l2-5h13l3 5v3H3Z M7 19a1.5 1.5 0 1 0 0 .1 M17 19a1.5 1.5 0 1 0 0 .1 M7 11l1.5-3h7l1.5 3" />;
  }
}

// ---- The rider and the bike ----------------------------------------------------

function Drawing() {
  return (
    <g className="fig-draw">
      {/* wheels */}
      <circle cx="140" cy="290" r="64" />
      <circle cx="140" cy="290" r="56" className="faint" />
      <circle cx="380" cy="290" r="64" />
      <circle cx="380" cy="290" r="56" className="faint" />
      <circle cx="140" cy="290" r="3" />
      <circle cx="380" cy="290" r="3" />
      {/* frame */}
      <path d="M250 292 L226 184 L352 182 L360 216 Z M226 184 L140 290 L250 292 M360 216 Q370 255 380 290" />
      <path d="M352 182 L357 172 L374 170 Q388 170 386 184 Q384 200 372 202" />
      <path d="M202 168 Q224 160 246 166 M224 167 L226 184" />
      <circle cx="250" cy="292" r="13" />
      {/* far leg, lighter */}
      <path className="far" d="M230 156 L284 190 L240 264 M228 270 L256 276" />
      <path className="far" d="M250 292 L234 274" />
      {/* torso, head, arm */}
      <path d="M230 156 Q268 116 324 122 Q333 124 338 110" />
      <path d="M230 156 Q236 168 246 168" />
      <circle cx="350" cy="96" r="14" />
      <path d="M334 92 Q338 70 358 72 Q376 76 372 92 Z" className="helmet" />
      <path d="M359 97 L371 96" className="specs" />
      <path d="M324 122 L342 152 L378 176" />
      {/* near leg and foot on the pedal */}
      <path d="M230 156 L292 204 L260 298 M250 304 L284 312" />
      <path d="M250 292 L268 310" />
    </g>
  );
}

// ---- Numbers ---------------------------------------------------------------------

type Cell = { have: number; ordered: number; need: number; total: number; items: FigItem[] };
const empty = (): Cell => ({ have: 0, ordered: 0, need: 0, total: 0, items: [] });

function zoneStatus(c: Cell): Status | "none" {
  if (!c.total) return "none";
  if (c.need) return "need";
  if (c.ordered) return "ordered";
  return "have";
}

function Ring({ c, max }: { c: Cell; max: number }) {
  const R = 23;
  const C = 2 * Math.PI * R;
  let off = 0;
  const segs: { st: Status; len: number; off: number }[] = [];
  for (const st of ["have", "ordered", "need"] as Status[]) {
    const len = max ? (c[st] / max) * C : 0;
    if (len > 0) segs.push({ st, len, off });
    off += len;
  }
  return (
    <g transform="rotate(-90)">
      <circle r={R} className="ring-track" />
      {segs.map((s) => (
        <circle key={s.st} r={R} className="ring-seg" data-st={s.st} strokeDasharray={`${Math.max(s.len - 1.5, 0.5)} ${C}`} strokeDashoffset={-s.off} />
      ))}
    </g>
  );
}

export function KitFigures({ riders, items, myRiderId }: { riders: FigRider[]; items: FigItem[]; myRiderId: number | null }) {
  const [active, setActive] = useState<ZoneId | null>(null);
  const [pinned, setPinned] = useState(false);

  const grid = useMemo(() => {
    const g = new Map<number, Map<ZoneId, Cell>>();
    for (const r of riders) g.set(r.id, new Map(ZONES.map((z) => [z.id, empty()])));
    for (const it of items) {
      const c = g.get(it.riderId)?.get(zoneFor(it));
      if (!c) continue;
      c[it.status]++;
      c.total++;
      c.items.push(it);
    }
    return g;
  }, [riders, items]);

  // Per zone: the most items anyone has listed (for the ring), and who has most in hand.
  const zoneMax = useMemo(() => {
    const m = new Map<ZoneId, { maxTotal: number; leaders: number[]; leaderHave: number }>();
    for (const z of ZONES) {
      let maxTotal = 0;
      let leaderHave = 0;
      for (const r of riders) {
        const c = grid.get(r.id)!.get(z.id)!;
        maxTotal = Math.max(maxTotal, c.total);
        leaderHave = Math.max(leaderHave, c.have);
      }
      const leaders = leaderHave ? riders.filter((r) => grid.get(r.id)!.get(z.id)!.have === leaderHave).map((r) => r.id) : [];
      m.set(z.id, { maxTotal, leaders, leaderHave });
    }
    return m;
  }, [riders, grid]);

  const totals = riders.map((r) => {
    const t = { have: 0, ordered: 0, need: 0, total: 0 };
    for (const c of grid.get(r.id)!.values()) {
      t.have += c.have;
      t.ordered += c.ordered;
      t.need += c.need;
      t.total += c.total;
    }
    return { r, ...t };
  });
  const mostHave = Math.max(0, ...totals.map((t) => t.have));

  function hover(z: ZoneId | null) {
    if (!pinned) setActive(z);
  }
  function tap(z: ZoneId) {
    if (pinned && active === z) {
      setPinned(false);
      setActive(null);
    } else {
      setPinned(true);
      setActive(z);
    }
  }

  const ordered = [...riders].sort((a, b) => (a.id === myRiderId ? -1 : b.id === myRiderId ? 1 : 0));

  return (
    <div className="stack">
      <div className="fig-key xs muted">
        <span className="fig-dot" data-st="have" /> have <span className="fig-dot" data-st="ordered" /> ordered <span className="fig-dot" data-st="need" /> need{" "}
        <span className="fig-dot" data-st="none" /> nothing listed · the ring shows how much you&rsquo;ve listed against whoever has listed the most there · ★ most in hand
        {pinned && (
          <button
            type="button"
            className="btn btn-sm btn-quiet"
            onClick={() => {
              setPinned(false);
              setActive(null);
            }}
          >
            Clear
          </button>
        )}
      </div>
      <div className="figs" data-active={active ?? undefined}>
        {ordered.map((r) => {
          const t = totals.find((x) => x.r.id === r.id)!;
          const sorted = t.have + t.ordered;
          const pct = t.total ? Math.round((sorted / t.total) * 100) : 0;
          const cells = grid.get(r.id)!;
          return (
            <section key={r.id} className="fig" aria-label={`${r.name}'s kit`}>
              <div className="row-between fig-head">
                <Link href={`/crew/kit/${r.id}`} className="fig-name">
                  {r.name}
                  {r.id === myRiderId && <span className="xs muted"> (you)</span>}
                </Link>
                <span className="xs muted">
                  {t.have > 0 && t.have === mostHave && <span className="fig-most">★ most kit · </span>}
                  <b className="fig-num">{sorted}</b> of {t.total} sorted · {pct}% · {t.have} in hand
                </span>
              </div>
              <svg viewBox="0 0 520 424" className="fig-svg" role="img" aria-label={`${r.name}: ${t.have} have, ${t.ordered} ordered, ${t.need} need`} onPointerLeave={() => hover(null)}>
                <Drawing />
                {ZONES.filter((z) => SPOTS[z.id]).map((z) => {
                  const s = SPOTS[z.id]!;
                  const c = cells.get(z.id)!;
                  const zm = zoneMax.get(z.id)!;
                  const st = zoneStatus(c);
                  const lead = zm.leaders.includes(r.id);
                  return (
                    <g
                      key={z.id}
                      className="spot"
                      data-st={st}
                      data-on={active === z.id ? "yes" : active ? "dim" : undefined}
                      tabIndex={0}
                      role="button"
                      aria-label={`${z.label}: ${c.have} have, ${c.ordered} ordered, ${c.need} need`}
                      onPointerEnter={(e) => e.pointerType === "mouse" && hover(z.id)}
                      onFocus={() => hover(z.id)}
                      onClick={() => tap(z.id)}
                      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), tap(z.id))}
                    >
                      <line x1={s.anchor[0]} y1={s.anchor[1]} x2={s.bubble[0]} y2={s.bubble[1]} className="leader" />
                      <circle cx={s.anchor[0]} cy={s.anchor[1]} r="3" className="anchor" />
                      <g transform={`translate(${s.bubble[0]} ${s.bubble[1]})`}>
                        <g className="bub">
                          <circle r="27" className="hit" />
                          <Ring c={c} max={zm.maxTotal} />
                          <circle r="19" className="disc" />
                          <g transform="translate(-10.5 -10.5) scale(0.875)" className="ico">
                            <Icon id={z.id} />
                          </g>
                          {lead && (
                            <text x="17" y="-15" className="star">
                              ★
                            </text>
                          )}
                          {c.total > 0 && (
                            <text y="38" className="cnt">
                              {c.have + c.ordered}/{c.total}
                            </text>
                          )}
                        </g>
                      </g>
                    </g>
                  );
                })}
              </svg>
              <div className="fig-off">
                {ZONES.filter((z) => z.where === "off").map((z) => {
                  const c = cells.get(z.id)!;
                  const st = zoneStatus(c);
                  return (
                    <button
                      key={z.id}
                      type="button"
                      className="fig-chip spot-chip"
                      data-st={st}
                      data-on={active === z.id ? "yes" : active ? "dim" : undefined}
                      onPointerEnter={(e) => e.pointerType === "mouse" && hover(z.id)}
                      onPointerLeave={() => hover(null)}
                      onClick={() => tap(z.id)}
                    >
                      <svg viewBox="0 0 24 24" width="18" height="18" className="ico" aria-hidden="true">
                        <Icon id={z.id} />
                      </svg>
                      {z.label} <span className="mono">{c.total ? `${c.have + c.ordered}/${c.total}` : "—"}</span>
                    </button>
                  );
                })}
              </div>
              <Detail rider={r} riders={riders} cells={cells} grid={grid} zone={active} zoneMax={zoneMax} />
            </section>
          );
        })}
      </div>

      <AreaTable riders={ordered} grid={grid} zoneMax={zoneMax} active={active} onHover={hover} onTap={tap} />
    </div>
  );
}

function Detail({
  rider,
  riders,
  cells,
  grid,
  zone,
  zoneMax,
}: {
  rider: FigRider;
  riders: FigRider[];
  cells: Map<ZoneId, Cell>;
  grid: Map<number, Map<ZoneId, Cell>>;
  zone: ZoneId | null;
  zoneMax: Map<ZoneId, { maxTotal: number; leaders: number[]; leaderHave: number }>;
}) {
  const nameOf = (id: number) => riders.find((r) => r.id === id)?.first ?? "";

  if (!zone) {
    // The biggest gaps against whoever has the most in hand in each area.
    const gaps = ZONES.map((z) => ({ z, gap: zoneMax.get(z.id)!.leaderHave - cells.get(z.id)!.have, leaders: zoneMax.get(z.id)!.leaders }))
      .filter((g) => g.gap > 0)
      .sort((a, b) => b.gap - a.gap)
      .slice(0, 4);
    return (
      <div className="fig-detail small">
        {gaps.length ? (
          <>
            <span className="muted">Furthest behind: </span>
            {gaps.map((g, i) => (
              <span key={g.z.id}>
                {i > 0 && " · "}
                <b>{g.z.label}</b> <span className="muted">({g.gap} fewer than {g.leaders.map(nameOf).join(" & ")})</span>
              </span>
            ))}
          </>
        ) : (
          <span className="muted">Level with or ahead of everyone in every area.</span>
        )}
        <div className="xs faint" style={{ marginTop: 4 }}>
          Hover or tap a part to compare all four.
        </div>
      </div>
    );
  }

  const z = ZONE_BY_ID[zone];
  const c = cells.get(zone)!;
  const zm = zoneMax.get(zone)!;
  const mine = new Set(c.items.map((i) => i.name.toLowerCase()));
  const others = new Map<string, { name: string; who: string[] }>();
  for (const r of riders) {
    if (r.id === rider.id) continue;
    for (const it of grid.get(r.id)!.get(zone)!.items) {
      const k = it.name.toLowerCase();
      if (mine.has(k)) continue;
      const o = others.get(k) ?? { name: it.name, who: [] };
      o.who.push(r.first);
      others.set(k, o);
    }
  }
  const lead = zm.leaders.includes(rider.id);

  return (
    <div className="fig-detail small">
      <div className="row-between">
        <b>{z.label}</b>
        <span className="xs">
          <span className="fig-tag" data-st="have">
            {c.have} have
          </span>{" "}
          <span className="fig-tag" data-st="ordered">
            {c.ordered} ordered
          </span>{" "}
          <span className="fig-tag" data-st="need">
            {c.need} need
          </span>
        </span>
      </div>
      <div className="xs muted" style={{ margin: "2px 0 6px" }}>
        {zm.leaderHave === 0
          ? "Nobody has anything here in hand yet."
          : lead
            ? zm.leaders.length > 1
              ? `Joint most in hand here (${zm.leaderHave}).`
              : `Most in hand here (${zm.leaderHave}).`
            : `Most in hand: ${zm.leaders.map(nameOf).join(" & ")} (${zm.leaderHave}) — ${zm.leaderHave - c.have} more than ${rider.first}.`}
      </div>
      {c.items.length ? (
        <ul className="fig-items">
          {c.items.map((it) => (
            <li key={it.id}>
              <span className="fig-dot" data-st={it.status} aria-label={WORD[it.status]} />
              <Link href={`/crew/kit/${rider.id}#item-${it.id}`}>{it.name}</Link>
              {it.qty > 1 && <span className="mono muted"> ×{it.qty}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <div className="xs muted">Nothing listed for {z.covers}.</div>
      )}
      {others.size > 0 && (
        <div className="fig-missing xs">
          <span className="muted">Others have, not on {rider.first}&rsquo;s list: </span>
          {[...others.values()].map((o, i) => (
            <span key={o.name}>
              {i > 0 && " · "}
              {o.name} <span className="muted">({o.who.join(", ")})</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function AreaTable({
  riders,
  grid,
  zoneMax,
  active,
  onHover,
  onTap,
}: {
  riders: FigRider[];
  grid: Map<number, Map<ZoneId, Cell>>;
  zoneMax: Map<ZoneId, { maxTotal: number; leaders: number[]; leaderHave: number }>;
  active: ZoneId | null;
  onHover: (z: ZoneId | null) => void;
  onTap: (z: ZoneId) => void;
}) {
  return (
    <section className="stack-sm">
      <h3 style={{ margin: 0 }}>Area by area</h3>
      <div className="sheet-wrap">
        <table className="sheet area-table" onPointerLeave={() => onHover(null)}>
          <thead>
            <tr>
              <th className="sticky-2">Area</th>
              {riders.map((r) => (
                <th key={r.id}>{r.first}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ZONES.map((z) => {
              const zm = zoneMax.get(z.id)!;
              return (
                <tr key={z.id} data-on={active === z.id ? "yes" : undefined} onPointerEnter={(e) => e.pointerType === "mouse" && onHover(z.id)} onClick={() => onTap(z.id)}>
                  <td className="sticky-2 cell-text">
                    <span className="area-name">
                      <svg viewBox="0 0 24 24" width="18" height="18" className="ico" aria-hidden="true">
                        <Icon id={z.id} />
                      </svg>
                      {z.label}
                    </span>
                  </td>
                  {riders.map((r) => {
                    const c = grid.get(r.id)!.get(z.id)!;
                    const lead = zm.leaders.includes(r.id);
                    const w = (n: number) => (zm.maxTotal ? `${(n / zm.maxTotal) * 100}%` : "0");
                    return (
                      <td key={r.id} className="cell-text area-cell" data-lead={lead ? "yes" : undefined}>
                        <div className="area-bar">
                          {c.have > 0 && <span data-st="have" style={{ width: w(c.have) }} />}
                          {c.ordered > 0 && <span data-st="ordered" style={{ width: w(c.ordered) }} />}
                          {c.need > 0 && <span data-st="need" style={{ width: w(c.need) }} />}
                        </div>
                        <span className="mono xs">
                          {c.total ? `${c.have + c.ordered}/${c.total}` : "—"}
                          {lead && " ★"}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
