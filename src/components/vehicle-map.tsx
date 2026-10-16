"use client";

import dynamic from "next/dynamic";

// Leaflet touches `window`, so it loads on the client only.
const Inner = dynamic(() => import("./vehicle-map-inner"), { ssr: false, loading: () => <div className="veh-map" /> });

/** Every vehicle's last known position on the route, refreshed every 30 seconds. */
export function VehicleMap({ vehicleId, tall }: { vehicleId?: number; tall?: boolean }) {
  return (
    <div className={`veh-map${tall ? " veh-map-tall" : ""}`}>
      <Inner vehicleId={vehicleId} />
    </div>
  );
}
