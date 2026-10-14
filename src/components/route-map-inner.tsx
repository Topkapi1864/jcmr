"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export default function RouteMapInner({ src }: { src: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const map = L.map(ref.current, { scrollWheelZoom: false });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    map.setView([52.8, -1.4], 7);
    const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || undefined;
    const accent = css("--color-accent");
    const colours: Record<number, string | undefined> = { 1: accent, 2: css("--color-amber") };
    fetch(`${src}${src.includes("?") ? "&" : "?"}v=${Date.now()}`)
      .then((r) => r.json())
      .then((geo: GeoJSON.FeatureCollection) => {
        if (!geo.features.length) return;
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
        map.fitBounds(layer.getBounds(), { padding: [20, 20] });
      })
      .catch(() => {});
    return () => {
      map.remove();
    };
  }, [src]);
  return <div ref={ref} style={{ width: "100%", height: "100%" }} />;
}
