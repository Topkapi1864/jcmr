"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapSpot = { id: number; name: string; kind: string; lat: number; lon: number; day: number; mile: number | null; photo: string | null };
export type MapPlanned = { key: string; day: number; n: number; label: string; lat: number; lon: number; mile: number; time: string; scouted: boolean; findHref: string };

type Props = {
  /** The pin being placed (edit mode). */
  pin?: { lat: number; lon: number } | null;
  /** Called when the map is tapped or the pin dragged; makes the map an editor. */
  onPick?: (lat: number, lon: number) => void;
  /** Where the plan puts the stop: a faint marker to search around. */
  ghost?: { lat: number; lon: number; label: string } | null;
  spots?: MapSpot[];
  planned?: MapPlanned[];
};

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}

const sv = (lat: number, lon: number) => `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lon}`;

export default function StopsMapInner({ pin, onPick, ghost, spots = [], planned = [] }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const pinRef = useRef<L.Marker | null>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const fittedRef = useRef(false);

  // The map, the route and the fixed markers: once.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const map = L.map(el, { scrollWheelZoom: !!onPick });
    mapRef.current = map;
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
    const muted = cs.getPropertyValue("--color-fg-muted").trim() || undefined;
    let stopped = false;

    fetch(`/api/route-geo?v=${Date.now()}`)
      .then((r) => r.json())
      .then((geo: GeoJSON.FeatureCollection) => {
        if (stopped || !geo.features?.length) return;
        const layer = L.geoJSON(geo, { style: () => ({ color: muted, weight: 4, opacity: 0.8, dashArray: "8 6" }), interactive: false }).addTo(map);
        if (!fittedRef.current && !pin && !ghost) {
          map.fitBounds(layer.getBounds(), { padding: [16, 16] });
          fittedRef.current = true;
        }
      })
      .catch(() => {});

    for (const p of planned) {
      L.marker([p.lat, p.lon], {
        icon: L.divIcon({ className: "veh-pin", html: `<span class="stop-plan-dot" data-scouted="${p.scouted}" data-day="${p.day}">${p.n}</span>`, iconSize: [22, 22], iconAnchor: [11, 11] }),
        zIndexOffset: 0,
      })
        .bindTooltip(`Day ${p.day} · ${esc(p.label)} · mile ${p.mile.toFixed(0)}`, { direction: "top", offset: [0, -10] })
        .bindPopup(
          `<div class="stop-popup"><span class="stop-popup-title">Day ${p.day}, stop ${p.n}: ${esc(p.label)}</span>` +
            `<span>Mile ${p.mile.toFixed(1)} · planned ${esc(p.time)}</span>` +
            `<span class="stop-popup-notes">${p.scouted ? "A spot is pinned for this one." : "No spot pinned yet."}</span>` +
            `<a href="${esc(p.findHref)}">${p.scouted ? "Pin another spot" : "Pin a spot for this stop"}</a>` +
            `<a href="${sv(p.lat, p.lon)}" target="_blank" rel="noopener">Street View here</a></div>`,
        )
        .addTo(map);
    }

    const pts: L.LatLngExpression[] = [];
    for (const s of spots) {
      pts.push([s.lat, s.lon]);
      L.marker([s.lat, s.lon], {
        icon: L.divIcon({ className: "veh-pin", html: `<span class="stop-spot-pin" data-kind="${esc(s.kind)}" data-faint="${!!onPick}"></span>`, iconSize: [26, 34], iconAnchor: [13, 32] }),
        zIndexOffset: 400,
      })
        .bindTooltip(esc(s.name), { direction: "top", offset: [0, -30] })
        .bindPopup(
          `<div class="stop-popup">${s.photo ? `<img src="${esc(s.photo)}" alt="" class="stop-popup-img" />` : ""}<span class="stop-popup-title">${esc(s.name)}</span>` +
            `<span>Day ${s.day}${s.mile != null ? ` · mile ${s.mile.toFixed(1)}` : ""}</span>` +
            `<a href="/crew/stops/${s.id}">Open</a><a href="https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}" target="_blank" rel="noopener">Directions</a></div>`,
        )
        .addTo(map);
    }

    if (ghost) {
      L.circle([ghost.lat, ghost.lon], { radius: 1600, color: cs.getPropertyValue("--color-amber").trim() || undefined, weight: 1, fillOpacity: 0.06, dashArray: "4 4", interactive: false }).addTo(map);
      L.marker([ghost.lat, ghost.lon], {
        icon: L.divIcon({ className: "veh-pin", html: `<span class="stop-plan-dot" data-scouted="false">★</span>`, iconSize: [22, 22], iconAnchor: [11, 11] }),
        interactive: true,
      })
        .bindTooltip(`${esc(ghost.label)} (where the plan puts it)`, { direction: "top", offset: [0, -10] })
        .addTo(map);
    }

    if (pin) map.setView([pin.lat, pin.lon], 15);
    else if (ghost) map.setView([ghost.lat, ghost.lon], 13);
    else if (pts.length && !planned.length) map.fitBounds(L.latLngBounds(pts), { padding: [30, 30], maxZoom: pts.length === 1 ? 16 : 13 });
    if (pin || ghost) fittedRef.current = true;

    // Inside a closed <details> the map starts with no size; redraw once it has one.
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);

    if (onPick) map.on("click", (e: L.LeafletMouseEvent) => pickRef.current?.(e.latlng.lat, e.latlng.lng));

    return () => {
      stopped = true;
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      pinRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The pin follows the props.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!pin) {
      pinRef.current?.remove();
      pinRef.current = null;
      return;
    }
    if (!pinRef.current) {
      pinRef.current = L.marker([pin.lat, pin.lon], {
        draggable: true,
        icon: L.divIcon({ className: "veh-pin", html: `<span class="stop-spot-pin" data-kind="edit"></span>`, iconSize: [30, 40], iconAnchor: [15, 38] }),
        zIndexOffset: 1000,
      }).addTo(map);
      pinRef.current.on("dragend", () => {
        const ll = pinRef.current!.getLatLng();
        pickRef.current?.(ll.lat, ll.lng);
      });
    } else pinRef.current.setLatLng([pin.lat, pin.lon]);
    if (!map.getBounds().pad(-0.1).contains([pin.lat, pin.lon])) map.setView([pin.lat, pin.lon], Math.max(map.getZoom(), 15));
  }, [pin?.lat, pin?.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={ref} style={{ position: "absolute", inset: 0 }} />;
}
