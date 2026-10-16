"use client";

import { useEffect, useRef, useState } from "react";

const SEND_EVERY_MS = 30_000; // at most one post every 30 s…
const SEND_IF_MOVED_M = 150; // …or sooner after a real move

type Fix = { lat: number; lng: number; accuracy: number; speed: number | null; at: number };

function metres(a: Fix, b: Fix) {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

type BatteryLike = { level: number };

/** Turns this phone into the vehicle's tracker while the page is open. */
export function LocationSharer({ vehicleId, vehicleName }: { vehicleId: number; vehicleName: string }) {
  const [on, setOn] = useState(false);
  const [status, setStatus] = useState("Not sharing");
  const [sent, setSent] = useState(0);
  const [lastSent, setLastSent] = useState<number | null>(null);
  const [, tick] = useState(0);
  const watch = useRef<number | null>(null);
  const lastPost = useRef<Fix | null>(null);
  const lock = useRef<{ release: () => Promise<void> } | null>(null);

  async function post(f: Fix) {
    let battery: number | undefined;
    try {
      const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryLike> };
      if (nav.getBattery) battery = Math.round((await nav.getBattery()).level * 100);
    } catch {}
    try {
      const r = await fetch("/api/vehicles/position", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vehicleId, lat: f.lat, lng: f.lng, accuracy: f.accuracy, speed: f.speed, battery }),
      });
      if (r.status === 401) {
        setStatus("Signed out — sign in to the crew board again");
        return;
      }
      if (!r.ok) throw new Error();
      lastPost.current = f;
      setSent((n) => n + 1);
      setLastSent(Date.now());
      setStatus("Sharing");
    } catch {
      setStatus("No signal — will send the next fix");
    }
  }

  async function keepAwake() {
    try {
      const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
      if (wl) lock.current = await wl.request("screen");
    } catch {}
  }

  function start() {
    if (!("geolocation" in navigator)) {
      setStatus("This browser can't share location");
      return;
    }
    setOn(true);
    setStatus("Finding you…");
    keepAwake();
    watch.current = navigator.geolocation.watchPosition(
      (p) => {
        const f: Fix = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, speed: p.coords.speed, at: Date.now() };
        const prev = lastPost.current;
        if (!prev || f.at - prev.at >= SEND_EVERY_MS || metres(prev, f) >= SEND_IF_MOVED_M) post(f);
      },
      (e) => setStatus(e.code === e.PERMISSION_DENIED ? "Location permission was refused — allow it in the browser settings" : "Can't get a fix — keep the phone where it can see the sky"),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 60_000 },
    );
  }

  function stop() {
    if (watch.current != null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
    lock.current?.release().catch(() => {});
    lock.current = null;
    setOn(false);
    setStatus("Not sharing");
  }

  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 10_000);
    // The wake lock drops when the tab is hidden; take it back on return.
    const onVis = () => document.visibilityState === "visible" && watch.current != null && keepAwake();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
      if (watch.current != null) navigator.geolocation.clearWatch(watch.current);
      lock.current?.release().catch(() => {});
    };
  }, []);

  const secs = lastSent ? Math.round((Date.now() - lastSent) / 1000) : null;
  return (
    <div className="stack">
      <div className="veh-share-status" data-on={on}>
        <div className="eyebrow">{vehicleName}</div>
        <div className="veh-share-big">{status}</div>
        <div className="small muted">
          {sent > 0 ? `${sent} position${sent === 1 ? "" : "s"} sent` : "Nothing sent yet"}
          {secs != null ? ` · last ${secs < 60 ? `${secs}s` : `${Math.round(secs / 60)} min`} ago` : ""}
        </div>
      </div>
      {on ? (
        <button type="button" className="btn btn-big btn-danger" onClick={stop}>
          Stop sharing
        </button>
      ) : (
        <button type="button" className="btn btn-big btn-primary" onClick={start}>
          Start sharing this phone&rsquo;s location
        </button>
      )}
    </div>
  );
}
