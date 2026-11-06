"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapRider = { id: number; name: string; lat: number; lng: number; at: string; mile: number | null; stale: boolean };

function ago(iso: string) {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} h ${m % 60} min ago` : `${Math.floor(h / 24)} d ago`;
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}

/** The route, and — when given — the riders' latest positions on it, redrawn whenever `riders` changes. */
export default function RouteMapInner({ src, riders }: { src: string; riders?: MapRider[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const ridersLayer = useRef<L.LayerGroup | null>(null);
  const zoomed = useRef(false);

  useEffect(() => {
    if (!ref.current) return;
    const map = L.map(ref.current, { scrollWheelZoom: false });
    mapRef.current = map;
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    map.setView([52.8, -1.4], 7);
    ridersLayer.current = L.layerGroup().addTo(map);
    const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || undefined;
    const accent = css("--color-accent");
    const colours: Record<number, string | undefined> = { 1: accent, 2: css("--color-amber") };
    fetch(`${src}${src.includes("?") ? "&" : "?"}v=${Date.now()}`)
      .then((r) => r.json())
      .then((geo: GeoJSON.FeatureCollection) => {
        if (!geo.features.length || mapRef.current !== map) return;
        const layer = L.geoJSON(geo, { style: (f) => ({ color: colours[Number(f?.properties?.day)] ?? accent, weight: 4, opacity: 0.9 }) }).addTo(map);
        for (const f of geo.features) {
          const c = (f.geometry as GeoJSON.LineString).coordinates;
          if (!c.length) continue;
          const first = c[0];
          const last = c[c.length - 1];
          const col = colours[Number(f.properties?.day)] ?? accent;
          L.circleMarker([first[1], first[0]], { radius: 6, color: col, fillOpacity: 1 }).bindTooltip(`Day ${f.properties?.day} start`).addTo(map);
          L.circleMarker([last[1], last[0]], { radius: 6, color: col, fillOpacity: 1 }).bindTooltip(`Day ${f.properties?.day} end`).addTo(map);
        }
        if (!zoomed.current) map.fitBounds(layer.getBounds(), { padding: [20, 20] });
        ridersLayer.current?.eachLayer((l) => (l as L.Marker).setZIndexOffset?.(600));
      })
      .catch(() => {});
    return () => {
      mapRef.current = null;
      map.remove();
    };
  }, [src]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = ridersLayer.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const list = riders ?? [];
    for (const r of list) {
      const icon = L.divIcon({
        className: "veh-pin",
        html: `<span class="veh-pin-inner rider-pin" data-kind="rider" data-stale="${r.stale}">${esc(r.name.slice(0, 2))}</span>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });
      L.marker([r.lat, r.lng], { icon, zIndexOffset: r.stale ? 0 : 600 })
        .bindTooltip(`<b>${esc(r.name)}</b> · ${ago(r.at)}${r.mile != null ? ` · mile ${r.mile}` : ""}`, { direction: "top", offset: [0, -14] })
        .addTo(layer);
    }
    // First time the riders appear, close in on them (with the route they are on); after that leave the viewer's view alone.
    const fresh = list.filter((r) => !r.stale);
    if (!zoomed.current && fresh.length) {
      map.fitBounds(L.latLngBounds(fresh.map((r) => [r.lat, r.lng] as [number, number])), { padding: [40, 40], maxZoom: 12 });
      zoomed.current = true;
    }
  }, [riders]);

  return <div ref={ref} style={{ width: "100%", height: "100%" }} />;
}
