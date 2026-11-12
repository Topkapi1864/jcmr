// Simon's Support Roadbook and the two PDF route guides ("London to Leeds Route
// Guide 14-15 Nov 2026" and the "Towns and Villages Route Guide") were written for
// his October line: old miles, the Gorhambury estate, Wharncliffe and Silkstone on
// gravel, "Bakewell" for the mile-37 stop. They have not been redone for the final
// line, so wherever the site names or links one it says so (Fiona's job on the
// cowork board, 11 Nov 2026 23:55Z, on Gary's word of 18:51).
//
// The site stores no documents: a link to one is a row in Admin -> Links, so the
// mark goes on by what the link is called or where it points. No server-only
// import here: the crew planner (a client component) uses the note too.

export const OLD_ROUTE_DOCS_NOTE =
  "OLD ROUTE — the Support Roadbook and the two PDF route guides follow Simon’s October line, not the final line. Ride by the map and the GPX files.";

export const OLD_ROUTE_LINK_MARK = "OLD ROUTE — Simon’s October line, not the final line; ride by the map and the GPX files";

const GAP = "(?:\\s|_|-|\\+|%20)*";
const OLD_DOC = new RegExp(`road${GAP}book|route${GAP}guide|towns${GAP}(?:and|&|%26)${GAP}villages`, "i");

/** True for a link to the Support Roadbook or either PDF route guide, by its label or its address. */
export function isOldRouteDoc(label: string | null | undefined, url: string | null | undefined): boolean {
  return OLD_DOC.test(`${label ?? ""} ${url ?? ""}`);
}
