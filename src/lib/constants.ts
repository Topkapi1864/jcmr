// Values safe to import from client components (no server-side imports here).
export const JUSTGIVING_URL = "https://www.justgiving.com/page/simon-gary-sarahchannon-3";
export const RIDE_DAYS = ["2026-11-14", "2026-11-15"];

/** The version of the route files in content/route. Bump it when the line changes:
 *  the download is named after it, and the stored stop miles are re-placed once
 *  (see `refreshForRouteVersion` in stops.ts). The files before it are in content/route/v1. */
export const ROUTE_VERSION = "2.0";
