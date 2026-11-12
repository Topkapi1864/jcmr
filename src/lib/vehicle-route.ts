import "server-only";
import fs from "node:fs";
import path from "node:path";
import { fmtHm } from "./plan";
import { listSpots, plannedLabel, plannedStops } from "./stops";

// Crew → Vehicle route: where the support vehicles leave the bike line and where they
// meet it again. Crew only. What is in this file and in content/vehicle is the vehicle
// track lines and the leg data (coordinates, road names, miles, minutes, map links).
// The stops are NOT here: they are read from the crew's own plan and stop pins each
// time the page is opened or a file is downloaded, and never written to the repo.
// One meeting point (Day 2, place 6) is not here either: its coordinate and the three
// map links that use it are filled in from the plan when the page is opened (legsFor).

export const VEHICLE_ROUTE_VERSION = "1.0";

export const TOP_LINE =
  "These roads come from the map. Nobody has driven them, the times have no traffic in them, and nothing has been checked for the motorhome's height or width. Go by the roads named and your own eyes.";
export const NAV_APP_LINE = "Google Maps cannot follow a GPX. Use OsmAnd (Navigate by track) for the whole route, or the Maps buttons below leg by leg.";
/** Under the downloads while V 1.0 is what the page serves. It comes off (null) when V 1.1 goes in. */
export const VERSION_NOTE: string | null =
  "V 1.0 turns round in two places where it has followed the riders to a point a car cannot pass. Day 1, Leicester: the line goes to the end of Ryder Road, a dead end, and comes back about 690 m. Day 2, Sheffield: the line goes to the tram junction on Glossop Road and comes back about 300 m to Wilkinson Street. V 1.1 takes both out.";
export const DAY2_AB_LINE =
  "A goes to Leeds Dock and round the ring road; B goes straight to Kirkstall Road by the M621 and is the one for a single vehicle; with two vehicles, one each.";

export type VehicleFileKey = "day1" | "day2a" | "day2b";
export type VehicleFile = { key: VehicleFileKey; day: 1 | 2; label: string; track: string; filename: string };

export const VEHICLE_FILES: VehicleFile[] = [
  { key: "day1", day: 1, label: "Day 1", track: "JCMR vehicle Day 1", filename: `JCMR_vehicle_Day1_V${VEHICLE_ROUTE_VERSION}.gpx` },
  { key: "day2a", day: 2, label: "Day 2 A, via Leeds Dock", track: "JCMR vehicle Day 2 A, via Leeds Dock", filename: `JCMR_vehicle_Day2A_via_Leeds_Dock_V${VEHICLE_ROUTE_VERSION}.gpx` },
  { key: "day2b", day: 2, label: "Day 2 B, direct to Kirkstall Road", track: "JCMR vehicle Day 2 B, direct to Kirkstall Road", filename: `JCMR_vehicle_Day2B_direct_V${VEHICLE_ROUTE_VERSION}.gpx` },
];

export const vehicleFileHref = (f: VehicleFile) => `/crew/vehicle-route/gpx/${f.filename}`;

function trackPath(key: VehicleFileKey): string {
  return path.join(process.cwd(), "content", "vehicle", `${key}.gpx`);
}

/** The track as committed: one trk, one trkseg, no waypoints. */
export function vehicleTrackXml(key: VehicleFileKey): string | null {
  const p = trackPath(key);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

export type LatLonPair = [lat: number, lon: number];

export function vehicleLine(key: VehicleFileKey): LatLonPair[] {
  const xml = vehicleTrackXml(key);
  if (!xml) return [];
  const out: LatLonPair[] = [];
  const re = /<trkpt lat="(-?[\d.]+)" lon="(-?[\d.]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push([Math.round(parseFloat(m[1]) * 1e5) / 1e5, Math.round(parseFloat(m[2]) * 1e5) / 1e5]);
  return out;
}

/** The piece of `a` that `b` does not share: from the last point they have in common at the front to the first at the back. */
export function ownStretch(a: LatLonPair[], b: LatLonPair[]): LatLonPair[] {
  let i = 0;
  while (i < a.length && i < b.length && a[i][0] === b[i][0] && a[i][1] === b[i][1]) i++;
  let j = 0;
  while (j < a.length - i && j < b.length - i && a[a.length - 1 - j][0] === b[b.length - 1 - j][0] && a[a.length - 1 - j][1] === b[b.length - 1 - j][1]) j++;
  return a.slice(Math.max(0, i - 1), a.length - j + 1);
}

// ---- the stops, from the crew's plan and pins ----

export type VehicleStop = { day: number; n: number; name: string; mile: number; arrive: string; depart: string; durMin: number; lat: number; lon: number; pinned: boolean };

/** The stops as the Stops tool has them now: the plan's stops in order, each at its pin where one has been made the stop. */
export async function vehicleStops(): Promise<VehicleStop[]> {
  const [{ days }, spots] = await Promise.all([plannedStops(), listSpots()]);
  const out: VehicleStop[] = [];
  for (const d of days) {
    for (const p of d.stops) {
      const id = p.key?.startsWith("spot:") ? Number(p.key.slice(5)) : null;
      const spot = id != null ? spots.find((s) => s.id === id) : undefined;
      out.push({
        day: p.day,
        n: p.n,
        name: (spot?.name ?? (id != null ? p.name : plannedLabel(p))).trim(),
        mile: p.mile,
        arrive: fmtHm(p.arrive),
        depart: fmtHm(p.depart),
        durMin: p.durMin,
        lat: spot?.lat ?? p.lat,
        lon: spot?.lon ?? p.lon,
        pinned: !!spot,
      });
    }
  }
  return out;
}

export const mapsTo = (lat: number, lon: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=driving`;

const xmlEsc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

/** The download: the committed track with the day's stops added as waypoints, for a crew session only. */
export function gpxWithStops(key: VehicleFileKey, stops: VehicleStop[]): string | null {
  const xml = vehicleTrackXml(key);
  const file = VEHICLE_FILES.find((f) => f.key === key);
  if (!xml || !file) return null;
  const mine = stops.filter((s) => s.day === file.day);
  const wpts = mine
    .map(
      (s) =>
        ` <wpt lat="${s.lat.toFixed(6)}" lon="${s.lon.toFixed(6)}"><name>${xmlEsc(`D${s.day} stop ${s.n} ${s.name} ${s.arrive}`)}</name>` +
        `<desc>${xmlEsc(`Day ${s.day} stop ${s.n} of ${mine.length}. Mile ${s.mile.toFixed(1)} on the bike line. ${s.arrive} to ${s.depart}, ${s.durMin} minutes.`)}</desc><type>Stop</type></wpt>\n`,
    )
    .join("");
  const at = xml.indexOf(" <trk>");
  return at < 0 ? null : xml.slice(0, at) + wpts + xml.slice(at);
}

// ---- the places the cars and the bikes part ----

export type Leg = {
  day: 1 | 2;
  /** "1" … "8"; Day 2's place 6 has three parts, "6a" "6b" "6c". */
  n: string;
  title: string;
  /** Which of the Day 2 files the leg is in, where it is in only one. */
  only?: "A" | "B";
  part: string;
  partAt?: LatLonPair;
  car: string;
  meet: string;
  meetAt?: LatLonPair;
  carMiles?: string;
  carMin?: string;
  alone: string;
  note?: string;
  maps: string;
  mapsLabel?: string;
  /** The leg parts or meets at the point read from the plan (planPoint), not at a coordinate in this file. */
  partFromPlan?: true;
  meetFromPlan?: true;
  /** The map link once the plan has given the point ("lat,lon"). Until then `maps` and `mapsLabel` stand. */
  planMaps?: (at: string) => string;
};

const G = "https://www.google.com/maps/dir/?api=1&";

export const LEGS: Leg[] = [
  {
    day: 1,
    n: "1",
    title: "The start: Castelnau to Shepherd's Bush Road",
    part: "Castelnau, Barnes, mile 0. Hammersmith Bridge is closed to cars; the riders go over it on the old carriageway.",
    partAt: [51.47783, -0.23819],
    car: "South down Castelnau → Church Road (A3003) → Barnes High Street → The Terrace → Lower Richmond Road → A316 over Chiswick Bridge → Hogarth roundabout → A4 Great West Road → Hammersmith Bridge Road → Hammersmith Broadway → A219 Shepherd's Bush Road.",
    meet: "A sighting on Shepherd's Bush Road by Brook Green, mile 1.4. The riders are on this road for 0.3 mi, then turn right into Dunsany Road. Where a car may stand is not checked; a side street by Brook Green is likelier than the main road.",
    meetAt: [51.4958, -0.224],
    carMiles: "5.2",
    carMin: "19",
    alone: "1.4 mi, 7 minutes (07:00 to 07:07). The car needs a head start of about 15 minutes, with nothing to spare.",
    maps: `${G}origin=51.47783,-0.23819&destination=51.4958,-0.2240&waypoints=51.4731,-0.2697&travelmode=driving`,
  },
  {
    day: 1,
    n: "2",
    title: "West London back streets: Shepherd's Bush Road to the A5",
    part: "Where the line leaves Shepherd's Bush Road, mile 1.7. Two filters a car cannot pass: Richmond Way → Lower Addison Gardens (mile 2.0) and Princedale Road → Portland Road (mile 2.9). Then Gladstone Park.",
    partAt: [51.4958, -0.224],
    car: "A219 north (Shepherd's Bush Green, Wood Lane, Scrubs Lane) → right on Harrow Road (A404) → left Wrottesley Road (A4000) → left Chamberlayne Road → left Willesden Lane (A4003) → right Walm Lane (A407) → left onto the A5 at Cricklewood → a mile north to Humber Road.",
    meet: "A5 Edgware Road at Humber Road, mile 7.7. From there the line is the A5 through Burnt Oak and Edgware.",
    meetAt: [51.56828, -0.22902],
    carMiles: "6.0",
    carMin: "28",
    alone: "6.0 mi, 30 minutes (about 07:08 to 07:40). From Castelnau it is 7.7 mi and about 39 minutes with the one sighting.",
    note: "The car is level with the riders at best. A car that waits to see them on Shepherd's Bush Road reaches the A5 behind them and catches them on the A5.",
    maps: `${G}origin=51.4958,-0.2240&destination=51.56828,-0.22902&travelmode=driving`,
  },
  {
    day: 1,
    n: "3",
    title: "Gladstone Park (inside place 2: only for a car that has somehow kept with the riders)",
    part: "Park Avenue North, mile 6.58. The riders take the park cycleway and the cycle bridge over the railway.",
    partAt: [51.5552, -0.23078],
    car: "Kendal Road → Anson Road → left Chichele Road (A407) → left onto the A5 → left Gladstone Park Gardens → left Parkside.",
    meet: "Parkside, mile 6.79.",
    meetAt: [51.55797, -0.2318],
    carMiles: "2.1",
    carMin: "11",
    alone: "0.2 mi, a minute.",
    note: "Not worth it: from Anson Road stay on the A5 and meet at Humber Road. This one is not in the GPX.",
    maps: `${G}origin=51.5552,-0.23078&destination=51.55797,-0.2318&travelmode=driving`,
  },
  {
    day: 1,
    n: "4",
    title: "The A405 at Bricket Wood: Lye Lane to Noke Lane",
    part: "The top of Lye Lane, mile 21.36. The riders cross both carriageways of the A405 on a cycle link: at grade, no signals, a 70 mph dual carriageway.",
    partAt: [51.7186, -0.365],
    car: "Left onto the A405, 0.3 mi to the Bricket Wood Junction roundabout, all the way round and back, left into Noke Lane.",
    meet: "Noke Lane, mile 21.43.",
    meetAt: [51.7197, -0.3671],
    carMiles: "0.9",
    carMin: "about 3",
    alone: "115 m. The car is about 3 minutes behind (about 08:52).",
    maps: `${G}origin=51.7186,-0.3650&destination=51.7197,-0.3671&travelmode=driving`,
  },
  {
    day: 1,
    n: "5",
    title: "Northampton: the ring-road cycle track, Queen Eleanor roundabout to Sixfields",
    part: "Queen Eleanor roundabout (Hardingstone Lane / A5076), mile 69.3. The riders take the cycle track beside the A5076 Mereway and Danes Camp Way (five underpasses), two bridleways at Briar Hill, then a car park and Meadow Way.",
    partAt: [52.2146, -0.8915],
    car: "A5076 Mereway → Danes Camp Way → Upton Way → at the Sixfields roundabout take Edgar Mobbs Way → Walter Tull Way.",
    meet: "Walter Tull Way, Sixfields, about mile 72.2.",
    meetAt: [52.23481, -0.93591],
    carMiles: "3.2",
    carMin: "9",
    alone: "2.9 mi, 15 minutes (about 13:33 to 13:48). For the first two miles the car is on the dual carriageway 10 to 50 m from them but cannot stop.",
    maps: `${G}origin=52.2146,-0.8915&destination=52.23481,-0.93591&travelmode=driving`,
  },
  {
    day: 1,
    n: "6",
    title: "Northampton: St Crispin's (26 m of grass)",
    part: "Berrywood Road at Kent Road, mile 73.6. The riders take Kent Road and The Drive (service roads, parked cars), then walk a 26 m grass link.",
    partAt: [52.2458, -0.9525],
    car: "Stay on Berrywood Road → left Berrywood Drive → right St Crispin Drive.",
    meet: "St Crispin Drive, about mile 74.0. The car comes to it from the far end and turns round to follow.",
    meetAt: [52.24368, -0.95899],
    carMiles: "1.0",
    carMin: "5",
    alone: "0.35 mi, 2 minutes.",
    maps: `${G}origin=52.2458,-0.9525&destination=52.243678,-0.958992&travelmode=driving`,
  },
  {
    day: 1,
    n: "7",
    title: "Leicester: the Kirby Frith path to Gynsill Lane (after dark)",
    part: "The north end of Ryder Road, mile 108.7. The riders take a 140 m path, then about 1.7 mi of streets, then a 290 m cycle track at the A50 / Gynsill Lane roundabout.",
    partAt: [52.63752, -1.19945],
    car: "Ryder Road is a dead end for a car, so don't follow up it. From the end of Ryder Road: Fulford Road → Scudamore Road → A563 → A563 New Parks Way → Groby Road roundabout → A50 → the Gynsill Lane roundabout.",
    meet: "Gynsill Lane, mile 110.6.",
    meetAt: [52.6585, -1.1938],
    carMiles: "2.9",
    carMin: "10",
    alone: "1.9 mi, 10 minutes (about 17:48 to 17:58, dark).",
    note: "The GPX goes to the end of Ryder Road and turns round there, as the route was written.",
    maps: `${G}origin=52.63752,-1.19945&destination=52.6585,-1.1938&travelmode=driving`,
  },
  {
    day: 1,
    n: "8",
    title: "Anstey: the A46 (Anstey Lane) roundabout",
    part: "Gynsill Lane at the roundabout, mile 111.1. The riders take a cycle track and a cycle bridge over the junction (0.25 mi).",
    partAt: [52.6642, -1.1869],
    car: "Round the Anstey Lane roundabout, second exit, Leicester Road into Anstey.",
    meet: "Leicester Road on the Anstey side, mile 111.4. A 110 m service road by Ned Ludd Close runs beside Leicester Road; the car stays on Leicester Road.",
    meetAt: [52.6665, -1.185],
    alone: "A minute or two, dark.",
    maps: `${G}origin=52.6642,-1.1869&destination=52.6724,-1.1854&travelmode=driving`,
  },
  {
    day: 2,
    n: "1",
    title: "Derby: the NCN 6 path, Wilson to Derby",
    part: "Wilson, where the line leaves the road onto Forty Foot Lane, mile 9.56. The riders take the Cloud Trail, the Trent viaduct, the canal towpath at Swarkestone, the Derby Canal path and the riverside into Derby. Unlit; three short compacted pieces.",
    partAt: [52.82017, -1.40224],
    car: "Wilson → Melbourne (Market Place) → B587 → A50 → A6 (Alvaston Bypass) → A5111 Raynesway → A52 Brian Clough Way → the Pentagon island → A61 Sir Frank Whittle Road → Mansfield Road.",
    meet: "Mansfield Road by Chester Green, Derby, mile 20.0. The car comes down Mansfield Road to it and turns round to follow north.",
    meetAt: [52.9317, -1.4717],
    carMiles: "about 13",
    carMin: "33",
    alone: "10.4 mi, 52 minutes (about 07:53 to 08:45). The longest of the weekend. The car is well ahead of the bikes.",
    note: "One place to see them on the way: Penalton Close, Allenton (DE24 9BP), 52.8908, -1.4456, mile 15.8. The bike line is on this street for 0.1 mi (about 08:25).",
    maps: `${G}origin=52.82017,-1.40224&destination=52.9317,-1.4717&travelmode=driving`,
  },
  {
    day: 2,
    n: "2",
    title: "Derby centre: Exeter Bridge and Phoenix Street (inside place 1: not driven)",
    part: "The riders go up 6 m of steps, or the 11 m dismount path beside them, to Exeter Bridge (mile 19.4), along Derwent Street and Stuart Street, then Phoenix Street under St Alkmund's Way: 92 m closed to all vehicles, so they walk unless the sign says cycles may pass.",
    partAt: [52.92443, -1.47332],
    car: "Don't follow into Derwent Street. A car there cannot cross St Alkmund's Way and is about 0.9 km round by the inner ring road. Wait on Mansfield Road (place 1).",
    meet: "Mansfield Road, from mile 19.7.",
    meetAt: [52.92777, -1.47435],
    alone: "Inside the 52 minutes of place 1.",
    note: "This one is not in the GPX. The button is only for a car that ends up on Derwent Street.",
    maps: `${G}origin=52.92443,-1.47332&destination=52.92777,-1.47435&travelmode=driving`,
    mapsLabel: "Google Maps: from Derwent Street round to Mansfield Road",
  },
  {
    day: 2,
    n: "3",
    title: "Sheffield: Glossop Road to Upper Hanover Street (the tram junction)",
    part: "Glossop Road at Upper Hanover Street, mile 59.8. The left turn is one the map does not allow a car; on foot it is about 75 m of footway and crossings.",
    partAt: [53.38022, -1.48527],
    car: "Wilkinson Street (off Glossop Road about 300 m before the junction) → Brunswick Street → Broomspring Lane → left onto the A61 Upper Hanover Street. One-ways here are not checked.",
    meet: "A61 Upper Hanover Street, mile 59.9.",
    meetAt: [53.38093, -1.48421],
    carMiles: "0.7",
    carMin: "4",
    alone: "A minute or two.",
    note: "Turn off into Wilkinson Street before the junction. The GPX goes to the junction and doubles back 300 m, as the route was written.",
    maps: `${G}origin=53.38022,-1.48527&destination=53.38093,-1.48421&travelmode=driving`,
  },
  {
    day: 2,
    n: "4",
    title: "Hillsborough to Oughtibridge: Beeley Wood, then the Bridge Hill walk",
    part: "The A61 Penistone Road North at the Leppings Lane junction, mile 62.64. The riders carry on up the A61 for 172 m, turn left into Claywheels Lane (1.1 mi), take a sealed bridleway through Beeley Wood (1.1 mi) to Waterside Gardens, Oughtibridge, then Station Lane, then walk 70 m up Bridge Hill, which is one-way against them.",
    partAt: [53.41483, -1.50063],
    car: "At the junction turn left into Leppings Lane (A6102), 0.3 mi → right into Catch Bar Lane → right into Middlewood Road and stay on the A6102 north through Middlewood to Oughtibridge, 2.2 mi. Don't follow into Claywheels Lane: for a car it is a dead end a mile in.",
    meet: "The top of Bridge Hill on the A6102, mile 65.1. A car cannot drive up Bridge Hill and doesn't need to: coming north on the A6102 it arrives at the top.",
    meetAt: [53.43604, -1.53957],
    carMiles: "2.6",
    carMin: "8",
    alone: "2.5 mi, 12 minutes plus the walk (about 12:58 to 13:12).",
    maps: `${G}origin=53.41483,-1.50063&destination=53.43604,-1.53957&travelmode=driving`,
  },
  {
    day: 2,
    n: "5",
    title: "Wortley: the 25 m path off Soughley Lane",
    part: "Soughley Lane, about mile 69.5 (the line turns left off the A6102 onto Soughley Lane at about mile 69.0). The riders take a 25 m path onto Cherry Tree Row, then Forge Lane.",
    partAt: [53.48789, -1.55228],
    car: "Carry on up Soughley Lane about 130 m → left on Finkle Street Lane → bear right onto Forge Lane.",
    meet: "Forge Lane, within about a quarter of a mile. Cote Lane, mile 70.7, at the latest.",
    meetAt: [53.50029, -1.56174],
    carMiles: "1.85 from the A6102 to Cote Lane, against the bikes' 1.77",
    alone: "A minute.",
    maps: `${G}origin=53.48789,-1.55228&destination=53.50029,-1.56174&travelmode=driving`,
  },
  {
    day: 2,
    n: "6a",
    title: "Woodlesford to Leeds, the waterside: Pottery Lane to the meeting point",
    part: "Pottery Lane at The Locks, Woodlesford, mile 94.1 (about 16:05). The riders come off the A642 by a cycle track with a bollard at each end; the car enters Pottery Lane by its own arm off the A642. The riders take Bullough Lane, a gate, then 3 mi of cycleway along the Aire & Calder Navigation past Skelton Lake, and come up steps with a wheeling ramp onto Skelton Grange Road and over the canal bridge.",
    partAt: [53.75893, -1.44398],
    car: "Pottery Lane → left Church Street → right Station Lane (0.5 mi) → roundabout, Holmsley Lane (0.4 mi) → bear right onto the A639 Leeds Road (1.0 mi) → Rothwell Haigh Interchange, 3rd exit, B6481 Pontefract Road (0.6 mi) → next roundabout, 2nd exit, still Pontefract Road (0.26 mi) → right into Skelton Grange Road, 0.43 mi.",
    meet: "The meeting point, mile 97.1, on the south-west (Stourton) bank of the canal. The car comes in from the Pontefract Road side and never crosses the canal: the bridge is beyond the meeting point.",
    meetFromPlan: true,
    carMiles: "3.6",
    carMin: "14",
    alone: "3.0 mi, 15 to 16 minutes (about 16:05 to 16:21), dusk into dark. The car has about two minutes in hand, so it leaves Pottery Lane as the riders leave the road, not after.",
    maps: `${G}origin=53.75893,-1.44398&destination=53.77167,-1.50876&travelmode=driving`,
    mapsLabel: "Google Maps: place 6a, to the turn into Skelton Grange Road",
    planMaps: (at) => `${G}origin=53.75893,-1.44398&destination=${at}&waypoints=53.77167,-1.50876&travelmode=driving`,
  },
  {
    day: 2,
    n: "6b",
    only: "A",
    title: "A: from the meeting point to Leeds Dock",
    part: "The meeting point. After it the riders stay on the road another 55 m, then double back down a path to the towpath on the south bank: Stourton, Thwaite Mills, Knostrop. Unlit.",
    partFromPlan: true,
    car: "Back down Skelton Grange Road (0.43 mi) → right onto the B6481 Pontefract Road (0.33 mi) → roundabout, 1st exit, Thwaite Gate and the A639 (0.5 mi) → right into Old Mill Lane → roundabout, National Road (0.3 mi) → roundabout, Atkinson Street → South Accommodation Road gyratory, 3rd exit, the A61 over Richmond Bridge → A61 South Accommodation Road and East Street (0.65 mi) → left onto Crown Point Road (A653), over the river → bear left into Armouries Way.",
    meet: "Armouries Way, mile 99.56: the first road at Leeds Dock a car can follow on from. The riders pass at about 16:38.",
    meetAt: [53.79259, -1.53395],
    carMiles: "2.9",
    carMin: "14",
    alone: "A car that leaves the meeting point with the riders at 16:26 is at Armouries Way about 16:40, two minutes behind them.",
    maps: `${G}destination=53.79259,-1.53395&travelmode=driving`,
    mapsLabel: "Google Maps: place 6b, from where you are to where they meet",
    planMaps: (at) => `${G}origin=${at}&destination=53.79259,-1.53395&travelmode=driving`,
  },
  {
    day: 2,
    n: "6c",
    only: "B",
    title: "B: from the meeting point direct to Kirkstall Road (no Leeds Dock, no city centre)",
    part: "The meeting point.",
    partFromPlan: true,
    car: "Back down Skelton Grange Road (0.43 mi) → right onto the B6481 Pontefract Road (about 125 m) → left into Queen Street (0.27 mi) → left onto the A639 Wakefield Road (0.15 mi) → Stourton Interchange, 4th exit, M621 (2.8 mi) → leave at junction 2 (A643, Elland Road Interchange) → 4th exit, A643 Ingram Distributor (0.9 mi) → Armley Gyratory, 3rd exit, A58 Wellington Road (0.2 mi) → left onto the A65 (0.16 mi); the point is on the left.",
    meet: "A65 Kirkstall Road, about mile 101.0. The riders arrive at about 16:46.",
    meetAt: [53.79805, -1.56186],
    carMiles: "5.7",
    carMin: "18",
    alone: "3.9 mi, about 20 minutes, in the dark: the waterside, then Leeds centre. A car that leaves the meeting point with the riders at 16:26 is at Kirkstall Road about 16:44, a minute or two before them.",
    note: "Not through the City Square bus gate: this way never enters the city centre.",
    maps: `${G}destination=53.79805,-1.56186&travelmode=driving`,
    mapsLabel: "Google Maps: place 6c, from where you are to where they meet",
    planMaps: (at) => `${G}origin=${at}&destination=53.79805,-1.56186&travelmode=driving`,
  },
  {
    day: 2,
    n: "7",
    only: "A",
    title: "A: Leeds centre, the City Square bus gate (only for a car that went to Leeds Dock)",
    part: "Armouries Way, mile 99.56. The riders take Bowman Lane, Leeds Bridge, Swinegate, Bishopgate Street and cross City Square into Wellington Street. The bus gate at City Square (about mile 100.3) is camera-enforced: a car must not follow them through it.",
    partAt: [53.79259, -1.53395],
    car: "Armouries Way → Black Bull Street → Crown Point Road → New York Road → Inner Ring Road (A64(M) / A58(M)) → A65 Kirkstall Road.",
    meet: "A65 Kirkstall Road, about mile 101.0.",
    meetAt: [53.79805, -1.56186],
    carMiles: "3.0",
    carMin: "9",
    alone: "1.45 mi, 7 to 8 minutes (about 16:38 to 16:46), city centre, dark.",
    maps: `${G}origin=53.79259,-1.53395&destination=53.79805,-1.56186&travelmode=driving`,
  },
];

// Day 2's place 6 turns on one point that is not written in this file. It is the entry in
// the crew's plan nearest this mile of the Day 2 bike line, read when the page is opened.
const PLAN_POINT = { day: 2, mile: 97.1, withinMi: 3 } as const;

export function planPoint(stops: VehicleStop[]): LatLonPair | null {
  let best: VehicleStop | null = null;
  for (const s of stops) if (s.day === PLAN_POINT.day && (!best || Math.abs(s.mile - PLAN_POINT.mile) < Math.abs(best.mile - PLAN_POINT.mile))) best = s;
  return best && Math.abs(best.mile - PLAN_POINT.mile) <= PLAN_POINT.withinMi ? [best.lat, best.lon] : null;
}

/** The legs as the page shows them: the committed ones, with the plan's point put into the legs that turn on it. */
export function legsFor(stops: VehicleStop[]): Leg[] {
  const p = planPoint(stops);
  if (!p) return LEGS;
  const at = `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
  return LEGS.map((l) => (l.planMaps ? { ...l, partAt: l.partFromPlan ? p : l.partAt, meetAt: l.meetFromPlan ? p : l.meetAt, maps: l.planMaps(at), mapsLabel: undefined } : l));
}

export const DAY_TITLES: Record<number, string> = { 1: "Barnes to The Link Hotel", 2: "The Link Hotel to Yeadon" };
