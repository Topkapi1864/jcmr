"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type StopsMapInner from "./stops-map-inner";

// Leaflet touches `window`, so it loads on the client only.
const Inner = dynamic(() => import("./stops-map-inner"), { ssr: false, loading: () => null });

export function StopsMap({ tall, ...props }: ComponentProps<typeof StopsMapInner> & { tall?: boolean }) {
  return (
    <div className={`veh-map${tall ? " veh-map-tall" : ""}`}>
      <Inner {...props} />
    </div>
  );
}
