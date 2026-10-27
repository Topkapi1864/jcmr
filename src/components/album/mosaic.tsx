"use client";

import { useMemo, useRef, useState } from "react";
import type { PhotoLite } from "@/lib/janet";
import { Lightbox, yearLabel } from "./album-grid";

// The photomosaic: one big picture made of every photograph, with a hit-map so
// hovering (or touching) a tile shows which photograph it is, and tapping opens it.

export type MosaicData = { key: string; title: string; cols: number; rows: number; tile: number; cells: string[] };

export function Mosaic({ mosaic, photos }: { mosaic: MosaicData; photos: Record<string, PhotoLite> }) {
  const [hover, setHover] = useState<{ cell: number; x: number; y: number } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const list = useMemo(() => Object.values(photos), [photos]);
  const index = useMemo(() => new Map(list.map((p, i) => [p.id, i])), [list]);

  const locate = (clientX: number, clientY: number) => {
    const el = ref.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const x = (clientX - r.left) / r.width;
    const y = (clientY - r.top) / r.height;
    if (x < 0 || x >= 1 || y < 0 || y >= 1) return null;
    const c = Math.floor(x * mosaic.cols);
    const rw = Math.floor(y * mosaic.rows);
    return { cell: rw * mosaic.cols + c, x, y };
  };
  const id = hover ? mosaic.cells[hover.cell] : null;
  const p = id ? photos[id] : null;

  return (
    <div className="mosaic-wrap">
      <div
        ref={ref}
        className="mosaic"
        onMouseMove={(e) => setHover(locate(e.clientX, e.clientY))}
        onMouseLeave={() => setHover(null)}
        onTouchStart={(e) => setHover(locate(e.touches[0].clientX, e.touches[0].clientY))}
        onTouchMove={(e) => setHover(locate(e.touches[0].clientX, e.touches[0].clientY))}
        onClick={(e) => {
          const h = locate(e.clientX, e.clientY);
          if (h) setOpen(mosaic.cells[h.cell]);
        }}
        role="img"
        aria-label={mosaic.title}
      >
        <img src={`/album/${mosaic.key}.jpg`} alt="" width={mosaic.cols * mosaic.tile} height={mosaic.rows * mosaic.tile} />
        {hover && (
          <span
            className="mosaic-cursor"
            style={{ left: `${(100 * Math.floor(hover.x * mosaic.cols)) / mosaic.cols}%`, top: `${(100 * Math.floor(hover.y * mosaic.rows)) / mosaic.rows}%`, width: `${100 / mosaic.cols}%`, height: `${100 / mosaic.rows}%` }}
          />
        )}
      </div>
      <aside className="mosaic-side">
        {p ? (
          <>
            <img src={`/album/thumb/${p.id}.jpg`} alt={p.cap} />
            <div className="mosaic-side-cap">{p.cap}</div>
            <div className="xs muted">{yearLabel(p)} · tap the tile to open it</div>
          </>
        ) : (
          <div className="muted small">Move over the picture, or touch it, to see which photograph each tile is. Tap to open one.</div>
        )}
      </aside>
      {open && index.has(open) && <Lightbox photos={list} index={index.get(open)!} onClose={() => setOpen(null)} onIndex={(i) => setOpen(list[i].id)} />}
    </div>
  );
}
