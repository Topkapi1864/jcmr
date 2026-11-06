"use client";

import dynamic from "next/dynamic";
import type { MapRider } from "./route-map-inner";

// Leaflet touches `window`, so it loads on the client only.
const Inner = dynamic(() => import("./route-map-inner"), { ssr: false, loading: () => <div className="map" /> });

export function RouteMap({ src = "/api/route-geo", riders }: { src?: string; riders?: MapRider[] }) {
  return <Inner src={src} riders={riders} />;
}
