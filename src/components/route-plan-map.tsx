"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { RouteProfile } from "@/lib/route";
import type { DayResult, PlanEvent } from "@/lib/plan";
import { fmtHm, timeAtMile } from "@/lib/plan";

export type MapProbe = { day: number; mile: number; lat: number; lon: number } | null;

type Props = {
  profiles: RouteProfile[];
  results: DayResult[];
  /** The "where are we at this time" marker. */
  probe: MapProbe;
  /** A point the user hovers on the elevation profile. */
  hover: MapProbe;
  onPick: (p: { day: number; mile: number }) => void;
  focusDay: number | null;
  /** Draw the routine stops (short, long, halfway). Off on the public page, where only the rendezvous show. */
  showRoutine?: boolean;
};

function cssVar(name: string, fallback = ""): string {
  if (typeof document === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

export default function RoutePlanMap({ profiles, results, probe, hover, onPick, focusDay, showRoutine = true }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<{ lines: L.LayerGroup; stops: L.LayerGroup; towns: L.LayerGroup; probe: L.CircleMarker | null; hover: L.CircleMarker | null }>({
    lines: L.layerGroup(),
    stops: L.layerGroup(),
    towns: L.layerGroup(),
    probe: null,
    hover: null,
  });
  const resultsRef = useRef(results);
  resultsRef.current = results;
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  // Build the map once.
  useEffect(() => {
    if (!ref.current || map.current) return;
    const m = L.map(ref.current, { scrollWheelZoom: true, zoomSnap: 0.5 });
    const osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    });
    const cycle = L.tileLayer("https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '<a href="https://www.cyclosm.org">CyclOSM</a> · &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    });
    osm.addTo(m);
    L.control.layers({ "Street map": osm, "Cycling map (CyclOSM)": cycle }, { Stops: layers.current.stops, Towns: layers.current.towns }, { collapsed: true }).addTo(m);
    L.control.scale({ imperial: true, metric: false }).addTo(m);
    layers.current.lines.addTo(m);
    layers.current.stops.addTo(m);
    layers.current.towns.addTo(m);
    m.setView([52.8, -1.2], 7);
    m.on("click", (e: L.LeafletMouseEvent) => {
      // Nearest point on either day's line.
      let best: { day: number; mile: number; d: number } | null = null;
      const cosLat = Math.cos((e.latlng.lat * Math.PI) / 180);
      for (const p of profiles) {
        for (const pt of p.points) {
          const dx = (pt[0] - e.latlng.lng) * cosLat;
          const dy = pt[1] - e.latlng.lat;
          const d = dx * dx + dy * dy;
          if (!best || d < best.d) best = { day: p.day, mile: pt[3], d };
        }
      }
      if (best && Math.sqrt(best.d) < 0.15) onPickRef.current({ day: best.day, mile: best.mile });
    });
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lines and towns: from the profiles.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const g = layers.current.lines;
    g.clearLayers();
    layers.current.towns.clearLayers();
    const colours: Record<number, string> = { 1: cssVar("--color-accent"), 2: cssVar("--color-amber") };
    const bounds = L.latLngBounds([]);
    for (const p of profiles) {
      const latlngs = p.points.map((pt) => [pt[1], pt[0]] as [number, number]);
      if (!latlngs.length) continue;
      const line = L.polyline(latlngs, { color: colours[p.day], weight: 4, opacity: 0.9, dashArray: p.present ? undefined : "6 10" });
      line.bindTooltip(p.present ? `Day ${p.day} · ${p.miles} mi` : `Day ${p.day} — schematic, GPX awaited`, { sticky: true });
      line.on("mousemove", (e: L.LeafletMouseEvent) => {
        const near = nearestMile(p, e.latlng.lat, e.latlng.lng);
        const r = resultsRef.current.find((x) => x.day === p.day);
        const eta = r ? ` · ETA ${fmtHm(timeAtMile(r.events, near, 60 / r.speedMph))}` : "";
        line.setTooltipContent(`Day ${p.day} · mile ${near.toFixed(1)}${eta}`);
      });
      g.addLayer(line);
      latlngs.forEach((ll) => bounds.extend(ll));
      for (const t of p.towns) {
        if (t.offMi > 1) continue;
        const c = L.circleMarker([t.lat, t.lon], { radius: 3, color: cssVar("--color-fg-muted"), weight: 1, fillOpacity: 0.9, interactive: true });
        c.bindTooltip(`${t.name} · mile ${t.mile}`, { direction: "right", offset: [6, 0] });
        c.on("click", () => onPickRef.current({ day: p.day, mile: t.mile }));
        layers.current.towns.addLayer(c);
      }
    }
    if (bounds.isValid()) m.fitBounds(bounds, { padding: [24, 24] });
  }, [profiles]);

  // Stops: from the results.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const g = layers.current.stops;
    g.clearLayers();
    const colours: Record<number, string> = { 1: cssVar("--color-accent"), 2: cssVar("--color-amber") };
    const bg = cssVar("--color-bg-raised");
    for (const r of results) {
      let n = 0;
      for (const e of r.events) {
        const routine = e.kind === "short" || e.kind === "long" || e.kind === "halfway";
        if (routine && !showRoutine) continue;
        const big = e.kind === "start" || e.kind === "finish" || e.kind === "named";
        if (e.kind === "named") n++;
        const marker = big
          ? L.marker([e.lat, e.lon], {
              icon: L.divIcon({
                className: "stop-pin",
                html: `<span class="stop-pin-inner" data-kind="${e.kind}" data-day="${e.day}">${e.kind === "named" ? n : e.kind === "start" ? "S" : "F"}</span>`,
                iconSize: [26, 26],
                iconAnchor: [13, 13],
              }),
            })
          : L.circleMarker([e.lat, e.lon], { radius: routine && e.kind === "short" ? 5 : 7, color: colours[e.day], fillColor: bg, fillOpacity: 1, weight: 2 });
        marker.bindPopup(popupHtml(e, r));
        marker.bindTooltip(`${fmtHm(e.arrive)} · ${e.name}`, { direction: "top", offset: [0, -10] });
        g.addLayer(marker);
      }
    }
  }, [results, showRoutine]);

  // Probe + hover markers.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const upd = (key: "probe" | "hover", p: MapProbe, cls: string) => {
      const cur = layers.current[key];
      if (!p) {
        if (cur) {
          cur.remove();
          layers.current[key] = null;
        }
        return;
      }
      if (cur) cur.setLatLng([p.lat, p.lon]);
      else {
        layers.current[key] = L.circleMarker([p.lat, p.lon], { radius: key === "probe" ? 10 : 7, className: cls, color: cssVar(key === "probe" ? "--color-live" : "--color-fg"), weight: 3, fillOpacity: 0.35, interactive: false }).addTo(m);
      }
    };
    upd("probe", probe, "probe-marker");
    upd("hover", hover, "hover-marker");
    if (probe && !m.getBounds().pad(-0.1).contains([probe.lat, probe.lon])) m.panTo([probe.lat, probe.lon]);
  }, [probe, hover]);

  // Focus a day.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const ps = focusDay ? profiles.filter((p) => p.day === focusDay) : profiles;
    const b = L.latLngBounds([]);
    for (const p of ps) for (const pt of p.points) b.extend([pt[1], pt[0]]);
    if (b.isValid()) m.fitBounds(b, { padding: [24, 24] });
  }, [focusDay, profiles]);

  return <div ref={ref} style={{ width: "100%", height: "100%" }} />;
}

function nearestMile(p: RouteProfile, lat: number, lon: number): number {
  let best = 0;
  let bd = Infinity;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  for (const pt of p.points) {
    const dx = (pt[0] - lon) * cosLat;
    const dy = pt[1] - lat;
    const d = dx * dx + dy * dy;
    if (d < bd) {
      bd = d;
      best = pt[3];
    }
  }
  return best;
}

function popupHtml(e: PlanEvent, r: DayResult): string {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
  const when = e.durMin ? `<b>${fmtHm(e.arrive)}</b> → ${fmtHm(e.depart)} (${e.durMin} min)` : `<b>${fmtHm(e.arrive)}</b>`;
  return `<div class="stop-popup"><div class="stop-popup-title">${esc(e.name)}</div><div>Day ${r.day} · mile ${e.mile} · ${Math.round(e.eleM * 3.281)} ft</div><div>${when}${e.dark ? " · after dark" : ""}</div>${e.notes ? `<div class="stop-popup-notes">${esc(e.notes)}</div>` : ""}<a target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${e.lat.toFixed(5)},${e.lon.toFixed(5)}">Open in Google Maps ↗</a></div>`;
}
