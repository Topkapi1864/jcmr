// Values safe to import from client components (no server-side imports here).
export const JUSTGIVING_URL = "https://www.justgiving.com/page/simon-gary-sarahchannon-3";
export const RIDE_DAYS = ["2026-11-14", "2026-11-15"];

/** The version of each day's route file in content/route. Day 1 is V2.0 (11 Nov 2026);
 *  Day 2 is V2.3 (11 Nov 2026, evening). The download is named after the day's version
 *  and the link says it. The files before them are in content/route/v1 and v2.0. */
export const ROUTE_VERSIONS: Readonly<Record<number, string>> = { 1: "2.0", 2: "2.3" };
export function routeVersion(day: number): string {
  return ROUTE_VERSIONS[day] ?? ROUTE_VERSION;
}
/** The newest of the files' versions: the key for re-placing the stored stop miles once
 *  when any line changes (see `refreshForRouteVersion` in route-version.ts). Bump it
 *  whenever a day's version above changes. */
export const ROUTE_VERSION = "2.3";
