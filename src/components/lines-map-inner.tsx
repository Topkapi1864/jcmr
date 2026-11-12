"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapLine = { pts: [lat: number, lon: number][]; tone: "base" | "strong" | "alt"; dashed?: boolean; label?: string };
export type MapDot = { lat: number; lon: number; text: string; title: string; lines?: string[]; filled?: boolean; href?: string; hrefLabel?: string };

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}

const TONE_VAR = { base: "--color-fg", strong: "--color-red", alt: "--color-amber" } as const;

export default function LinesMapInner({ lines, dots = [] }: { lines: MapLine[]; dots?: MapDot[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const map = L.map(el, { scrollWheelZoom: false });
    const street = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    });
    const sat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19,
      attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics",
    });
    street.addTo(map);
    L.control.layers({ Map: street, Satellite: sat }, undefined, { position: "topright" }).addTo(map);
    L.control.scale({ imperial: true, metric: false }).addTo(map);
    map.setView([52.8, -1.4], 7);

    const cs = getComputedStyle(el);
    let bounds: L.LatLngBounds | null = null;
    for (const ln of lines) {
      if (ln.pts.length < 2) continue;
      const colour = cs.getPropertyValue(TONE_VAR[ln.tone]).trim() || undefined;
      const layer = L.polyline(ln.pts, { color: colour, weight: ln.tone === "base" ? 7 : 4, opacity: ln.tone === "base" ? 0.45 : 0.95, dashArray: ln.dashed ? "10 8" : undefined, interactive: !!ln.label }).addTo(map);
      if (ln.label) layer.bindTooltip(esc(ln.label), { sticky: true });
      bounds = bounds ? bounds.extend(layer.getBounds()) : layer.getBounds();
    }
    for (const d of dots) {
      L.marker([d.lat, d.lon], {
        icon: L.divIcon({ className: "veh-pin", html: `<span class="stop-plan-dot" data-scouted="${!!d.filled}">${esc(d.text)}</span>`, iconSize: [22, 22], iconAnchor: [11, 11] }),
        zIndexOffset: d.filled ? 400 : 0,
      })
        .bindPopup(
          `<div class="stop-popup"><span class="stop-popup-title">${esc(d.title)}</span>` +
            (d.lines ?? []).map((t) => `<span>${esc(t)}</span>`).join("") +
            (d.href ? `<a class="btn btn-primary" href="${esc(d.href)}" target="_blank" rel="noopener">${esc(d.hrefLabel ?? "Open")}</a>` : "") +
            `</div>`,
        )
        .addTo(map);
    }
    if (bounds) map.fitBounds(bounds, { padding: [16, 16] });

    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    return () => {
      ro.disconnect();
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={ref} style={{ position: "absolute", inset: 0 }} />;
}
