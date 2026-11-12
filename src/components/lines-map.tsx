"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type LinesMapInner from "./lines-map-inner";

// Leaflet touches `window`, so it loads on the client only.
const Inner = dynamic(() => import("./lines-map-inner"), { ssr: false, loading: () => null });

/** A map of a few lines and numbered dots. It knows nothing of what they are: the page gives it everything. */
export function LinesMap(props: ComponentProps<typeof LinesMapInner>) {
  return (
    <div className="veh-map veh-map-tall">
      <Inner {...props} />
    </div>
  );
}
