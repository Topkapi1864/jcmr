"use client";

import dynamic from "next/dynamic";

// Leaflet touches `window`, so it loads on the client only.
const Inner = dynamic(() => import("./route-map-inner"), { ssr: false, loading: () => <div className="map" /> });

export function RouteMap({ src = "/api/route-geo" }: { src?: string }) {
  return <Inner src={src} />;
}
