"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type Feed = {
  now: string;
  vehicles: {
    id: number;
    name: string;
    colour: string;
    registration: string;
    last: { lat: number; lng: number; at: string; accuracy: number | null; speed: number | null; battery: number | null; source: string; by: string } | null;
    trail: [number, number][];
  }[];
};

const REFRESH_MS = 30_000;

function ago(iso: string) {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} h ${m % 60} min ago` : `${Math.floor(h / 24)} d ago`;
}

/** Leaflet draws lines as SVG attributes, which can't read var(); resolve the token to its value. */
function resolve(colour: string, el: HTMLElement) {
  const m = /^var\((--[\w-]+)\)$/.exec(colour);
  return m ? getComputedStyle(el).getPropertyValue(m[1]).trim() || undefined : colour;
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}

export default function VehicleMapInner({ vehicleId }: { vehicleId?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [note, setNote] = useState("Loading…");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const map = L.map(el, { scrollWheelZoom: false });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    map.setView([52.8, -1.4], 7);
    L.control.scale({ imperial: true, metric: false }).addTo(map);

    const routeLayer = L.layerGroup().addTo(map);
    const live = L.layerGroup().addTo(map);
    let routeBounds: L.LatLngBounds | null = null;
    let fitted = false;
    let stopped = false;
    let livePts: L.LatLngExpression[] = [];

    // The route underneath, faint, so the vehicles have something to sit on.
    fetch(`/api/route-geo?v=${Date.now()}`)
      .then((r) => r.json())
      .then((geo: GeoJSON.FeatureCollection) => {
        if (stopped || !geo.features?.length) return;
        const muted = getComputedStyle(el).getPropertyValue("--color-fg-muted").trim() || undefined;
        const layer = L.geoJSON(geo, { style: () => ({ color: muted, weight: 4, opacity: 0.85, dashArray: "8 6" }) }).addTo(routeLayer);
        routeBounds = layer.getBounds();
        if (!fitted) map.fitBounds(routeBounds, { padding: [16, 16] });
        else if (!vehicleId && livePts.length) map.fitBounds(L.latLngBounds(livePts).extend(routeBounds), { padding: [30, 30], maxZoom: 13 });
      })
      .catch(() => {});

    async function load() {
      try {
        const r = await fetch(`/api/vehicles/positions${vehicleId ? `?vehicle=${vehicleId}` : ""}`, { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        const feed = (await r.json()) as Feed;
        if (stopped) return;
        live.clearLayers();
        const pts: L.LatLngExpression[] = [];
        for (const v of feed.vehicles) {
          if (!v.last) continue;
          const col = resolve(v.colour, el!);
          if (v.trail.length > 1) L.polyline(v.trail, { color: col, weight: 4, opacity: 0.75 }).addTo(live);
          if (v.last.accuracy && v.last.accuracy > 30 && v.last.accuracy < 5000) {
            L.circle([v.last.lat, v.last.lng], { radius: v.last.accuracy, color: col, weight: 1, fillOpacity: 0.08 }).addTo(live);
          }
          const stale = Date.now() - Date.parse(v.last.at) > 15 * 60_000;
          const icon = L.divIcon({
            className: "veh-pin",
            html: `<span class="veh-pin-inner" data-stale="${stale}" style="--vc:${esc(v.colour)}">${esc(v.name.slice(0, 1).toUpperCase())}</span>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15],
          });
          const extra = [v.last.speed != null ? `${Math.round(v.last.speed * 2.237)} mph` : "", v.last.battery != null ? `battery ${Math.round(v.last.battery)}%` : ""].filter(Boolean).join(" · ");
          L.marker([v.last.lat, v.last.lng], { icon, zIndexOffset: stale ? 0 : 500 })
            .bindTooltip(`<b>${esc(v.name)}</b> · ${ago(v.last.at)}`, { direction: "top", offset: [0, -14] })
            .bindPopup(
              `<div class="stop-popup"><span class="stop-popup-title">${esc(v.name)}${v.registration ? ` · ${esc(v.registration)}` : ""}</span>` +
                `<span>${ago(v.last.at)} · ${esc(v.last.source === "pasted" ? `pasted by ${v.last.by}` : v.last.source === "phone" ? `${v.last.by}'s phone` : "tracker")}</span>` +
                (extra ? `<span class="stop-popup-notes">${esc(extra)}</span>` : "") +
                `<a href="https://www.google.com/maps/dir/?api=1&destination=${v.last.lat},${v.last.lng}" target="_blank" rel="noopener">Directions to here</a></div>`,
            )
            .addTo(live);
          pts.push([v.last.lat, v.last.lng]);
        }
        livePts = pts;
        if (!fitted && pts.length) {
          // One vehicle: close in on it. The overview: every vehicle, with the route for context.
          if (vehicleId) map.setView(pts[0], 13);
          else {
            const b = L.latLngBounds(pts);
            if (routeBounds) b.extend(routeBounds);
            map.fitBounds(b, { padding: [30, 30], maxZoom: 13 });
          }
          fitted = true;
        }
        setNote(pts.length ? `Updated ${new Date(feed.now).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} · refreshes every 30 s` : "No positions yet");
      } catch {
        setNote("Couldn't load positions — retrying");
      }
    }
    load();
    const t = setInterval(load, REFRESH_MS);
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stopped = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
      map.remove();
    };
  }, [vehicleId]);

  return (
    <>
      <div ref={ref} style={{ width: "100%", height: "100%" }} />
      <div className="veh-map-note">{note}</div>
    </>
  );
}
