"use client";

import { useState } from "react";

// "Janet at your age": type an age, jump to the year she was that age. The album
// mostly covers her late fifties onwards, so the nearest year with pictures is
// offered when there are none from that exact age.

export function AgeJump({ years, born }: { years: { y: number; n: number }[]; born: number }) {
  const [age, setAge] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const go = () => {
    const a = parseInt(age, 10);
    if (Number.isNaN(a) || a < 0 || a > 120) {
      setNote("Try an age between 0 and 120.");
      return;
    }
    const want = born + a;
    const exact = years.find((y) => y.y === want);
    const nearest = [...years].sort((p, q) => Math.abs(p.y - want) - Math.abs(q.y - want) || p.y - q.y)[0];
    const target = exact ?? nearest;
    if (!target) return;
    if (exact) setNote(`She was ${a} in ${want}: ${exact.n} photograph${exact.n === 1 ? "" : "s"}.`);
    else if (want < years[0].y)
      setNote(`She was ${a} in ${want}, before the first pictures in the album. The earliest are from ${nearest.y}, when she was ${nearest.y - born}.`);
    else setNote(`No pictures from ${want}, when she was ${a}. The nearest are from ${nearest.y}, when she was ${nearest.y - born}.`);
    document.getElementById(`g-${target.y}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <form
      className="album-age"
      onSubmit={(e) => {
        e.preventDefault();
        go();
      }}
    >
      <label htmlFor="age-jump">Janet at your age</label>
      <input id="age-jump" type="number" inputMode="numeric" min={0} max={120} placeholder="your age" value={age} onChange={(e) => setAge(e.target.value)} />
      <button type="submit" className="btn">
        Show me
      </button>
      {note && <span className="small muted album-age-note">{note}</span>}
    </form>
  );
}
