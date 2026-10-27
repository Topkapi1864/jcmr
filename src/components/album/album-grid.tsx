"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PhotoLite } from "@/lib/janet";

// The album's shared pieces: a thumbnail grid (or several titled groups of one)
// and the lightbox they all open. Thumbnails are /album/thumb, the lightbox
// shows /album/med. Everything is lazy so a thousand pictures stay cheap.

export type Group = { key: string; title: string; sub?: string; photos: PhotoLite[]; /** shown faded: the riders have not reached it yet */ dim?: boolean; /** a line set above the group, e.g. where the riders are */ marker?: string };

export function yearLabel(p: PhotoLite): string {
  if (p.y == null) return "";
  return p.yc === "high" ? String(p.y) : `about ${p.y}`;
}

export function AlbumGrid({
  groups,
  size = "md",
  square = true,
  showYears = false,
  tiles = false,
}: {
  groups: Group[];
  size?: "xs" | "sm" | "md" | "lg";
  square?: boolean;
  showYears?: boolean;
  /** use the 64px tiles instead of thumbnails (for the very dense views) */
  tiles?: boolean;
}) {
  const all = useMemo(() => groups.flatMap((g) => g.photos), [groups]);
  const [open, setOpen] = useState<number | null>(null);
  const indexOf = useMemo(() => {
    const m = new Map<string, number>();
    all.forEach((p, i) => m.set(p.id, i));
    return m;
  }, [all]);

  return (
    <>
      {groups.map((g) => (
        <section key={g.key} className={`album-group${g.dim ? " album-group-dim" : ""}`} id={`g-${g.key}`}>
          {g.marker && <div className="album-marker">{g.marker}</div>}
          {g.title && (
            <header className="album-group-head">
              <h2>{g.title}</h2>
              {g.sub && <div className="muted small">{g.sub}</div>}
            </header>
          )}
          <div className={`album-grid album-grid-${size}${square ? "" : " album-grid-flow"}`}>
            {g.photos.map((p) => (
              <button key={p.id} type="button" className="album-cell" onClick={() => setOpen(indexOf.get(p.id) ?? 0)} title={p.cap}>
                <img src={`/album/${tiles ? "tile" : "thumb"}/${p.id}.jpg`} alt={p.cap} loading="lazy" decoding="async" width={tiles ? 64 : p.w} height={tiles ? 64 : p.h} />
                {showYears && p.y != null && <span className="album-cell-year">{yearLabel(p)}</span>}
              </button>
            ))}
          </div>
        </section>
      ))}
      {open != null && <Lightbox photos={all} index={open} onClose={() => setOpen(null)} onIndex={setOpen} />}
    </>
  );
}

export function Lightbox({ photos, index, onClose, onIndex }: { photos: PhotoLite[]; index: number; onClose: () => void; onIndex: (i: number) => void }) {
  const p = photos[index];
  const touch = useRef<number | null>(null);
  const prev = useCallback(() => onIndex((index - 1 + photos.length) % photos.length), [index, photos.length, onIndex]);
  const next = useCallback(() => onIndex((index + 1) % photos.length), [index, photos.length, onIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose, prev, next]);

  // Preload the neighbours so flicking through feels instant.
  useEffect(() => {
    [index - 1, index + 1].forEach((i) => {
      const q = photos[(i + photos.length) % photos.length];
      if (q) {
        const im = new Image();
        im.src = `/album/med/${q.id}.jpg`;
      }
    });
  }, [index, photos]);

  if (!p) return null;
  const date = p.date ? new Date(p.date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : yearLabel(p);
  return (
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={p.cap}
      onClick={onClose}
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touch.current == null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        touch.current = null;
        if (dx > 50) prev();
        else if (dx < -50) next();
      }}
    >
      <button type="button" className="lightbox-x" aria-label="Close" onClick={onClose}>
        ×
      </button>
      <button
        type="button"
        className="lightbox-arrow lightbox-prev"
        aria-label="Previous"
        onClick={(e) => {
          e.stopPropagation();
          prev();
        }}
      >
        ‹
      </button>
      <figure onClick={(e) => e.stopPropagation()}>
        <img src={`/album/med/${p.id}.jpg`} alt={p.cap} width={p.w} height={p.h} />
        <figcaption>
          <span>{p.cap}</span>
          <span className="lightbox-meta">
            {date}
            {" · "}
            {index + 1} of {photos.length}
          </span>
        </figcaption>
      </figure>
      <button
        type="button"
        className="lightbox-arrow lightbox-next"
        aria-label="Next"
        onClick={(e) => {
          e.stopPropagation();
          next();
        }}
      >
        ›
      </button>
    </div>
  );
}
