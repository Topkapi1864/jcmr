import Link from "next/link";
import { requireCrew } from "@/lib/auth";
import { loadDay } from "@/lib/gpx";
import { routeVersion } from "@/lib/constants";
import { LinesMap } from "@/components/lines-map";
import type { MapDot, MapLine } from "@/components/lines-map-inner";
import { DAY2_AB_LINE, DAY_TITLES, NAV_APP_LINE, TOP_LINE, VEHICLE_FILES, VEHICLE_ROUTE_VERSION, VERSION_NOTE, legsFor, mapsTo, ownStretch, vehicleFileHref, vehicleLine, vehicleStops, type LatLonPair, type Leg, type VehicleStop } from "@/lib/vehicle-route";

export const dynamic = "force-dynamic";

const big = { width: "100%", minHeight: "56px", fontSize: "var(--text-base)", textAlign: "center" as const };
const swatch = (v: string, dashed = false) => ({ display: "inline-block", width: "2.2em", height: 0, borderTop: `4px ${dashed ? "dashed" : "solid"} var(${v})`, verticalAlign: "middle", marginRight: "0.4em" });

function bikeLine(day: number): LatLonPair[] {
  const f = loadDay(day).feature;
  return f ? f.geometry.coordinates.map((c) => [c[1], c[0]] as LatLonPair) : [];
}

export default async function VehicleRoutePage() {
  await requireCrew();
  const stops = await vehicleStops();
  const allLegs = legsFor(stops);
  const d1 = vehicleLine("day1");
  const d2a = vehicleLine("day2a");
  const d2b = vehicleLine("day2b");
  const lines: Record<number, MapLine[]> = {
    1: [
      { pts: bikeLine(1), tone: "base", label: "Bikes" },
      { pts: d1, tone: "strong", label: "Vehicles" },
    ],
    2: [
      { pts: bikeLine(2), tone: "base", label: "Bikes" },
      { pts: d2b, tone: "strong", label: "Vehicles (B, direct to Kirkstall Road)" },
      { pts: ownStretch(d2a, d2b), tone: "strong", dashed: true, label: "Vehicles (A, via Leeds Dock)" },
    ],
  };

  return (
    <div className="stack" style={{ maxWidth: "64rem" }}>
      <div className="stack-sm">
        <h1>Vehicle route</h1>
        <p className="notice" style={{ margin: 0 }}>
          <b>{TOP_LINE}</b>
        </p>
        <p style={{ margin: 0 }}>{NAV_APP_LINE}</p>
        <p className="small muted" style={{ margin: 0 }}>
          The cars follow the bike line everywhere except the places listed under each map. The bike line is the one in <Link href="/crew/route">Route</Link> (Day 1 V {routeVersion(1)}, Day 2 V {routeVersion(2)}); the stops are the ones in{" "}
          <Link href="/crew/stops">Stops</Link>, read as they are now.
        </p>
      </div>

      <section className="stack-sm">
        <h2>The vehicle GPX files</h2>
        <div style={{ display: "grid", gap: "var(--space-3)", gridTemplateColumns: "repeat(auto-fit, minmax(16rem, 1fr))" }}>
          {VEHICLE_FILES.map((f) => (
            <a key={f.key} className="btn btn-primary" style={big} href={vehicleFileHref(f)}>
              {f.label}: download the GPX (V {VEHICLE_ROUTE_VERSION})
            </a>
          ))}
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          Each file is one track for the whole day, with that day&rsquo;s stops as waypoints. On the iPad: tap a file, then open it in OsmAnd and choose Navigate by track.
        </p>
        {VERSION_NOTE && <p style={{ margin: 0 }}>{VERSION_NOTE}</p>}
      </section>

      {[1, 2].map((day) => {
        const legs = allLegs.filter((l) => l.day === day);
        const dayStops = stops.filter((s) => s.day === day);
        const dots: MapDot[] = [
          ...legs
            .filter((l) => l.partAt)
            .map((l) => ({ lat: l.partAt![0], lon: l.partAt![1], text: l.n, title: `Place ${l.n}: ${l.title}`, lines: [l.carMiles ? `Car: ${l.carMiles} mi${l.carMin ? `, ${l.carMin} min` : ""}` : "", `Riders alone: ${l.alone}`].filter(Boolean), filled: true, href: l.maps, hrefLabel: "Google Maps" })),
          ...dayStops.map((s) => ({ lat: s.lat, lon: s.lon, text: String(s.n), title: `Stop ${s.n}: ${s.name}`, lines: [`Mile ${s.mile.toFixed(1)} · ${s.arrive} to ${s.depart}`], href: mapsTo(s.lat, s.lon), hrefLabel: "Google Maps to this stop" })),
        ];
        return (
          <section key={day} className="stack">
            <h2>
              Day {day}: {DAY_TITLES[day]}
            </h2>
            <p className="small" style={{ margin: 0 }}>
              <span style={swatch("--color-red")} />
              vehicles <span style={{ ...swatch("--color-fg"), opacity: 0.45, marginLeft: "1em" }} />
              bikes
              {day === 2 && (
                <>
                  {" "}
                  <span style={{ ...swatch("--color-red", true), marginLeft: "1em" }} />
                  vehicles by A
                </>
              )}
              <span className="muted"> · filled dots are the places they part, open dots the stops. Tap a dot for its Maps button.</span>
            </p>
            {day === 2 && (
              <p style={{ margin: 0 }}>
                <b>Two ways into Leeds.</b> {DAY2_AB_LINE}
              </p>
            )}
            <LinesMap lines={lines[day]} dots={dots} />

            <h3>
              Where the cars and bikes part: {day === 1 ? "eight" : "seven"} places
            </h3>
            <ul className="list">
              {legs.map((l) => (
                <LegCard key={l.n} l={l} />
              ))}
            </ul>

            <h3>The stops, in order</h3>
            {dayStops.length === 0 ? (
              <p className="small muted">No stops in the plan for this day.</p>
            ) : (
              <ul className="list">
                {dayStops.map((s) => (
                  <StopCard key={s.n} s={s} />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function LegCard({ l }: { l: Leg }) {
  return (
    <li className="card stack-sm" id={`place-${l.day}-${l.n}`}>
      <div>
        <span className="stop-n">{l.n}</span> <b>{l.title}</b>
      </div>
      <div className="small stack-sm">
        <p style={{ margin: 0 }}>
          <b>Part:</b> {l.part}
        </p>
        <p style={{ margin: 0 }}>
          <b>Car&rsquo;s roads:</b> {l.car}
        </p>
        <p style={{ margin: 0 }}>
          <b>Meet:</b> {l.meet}
        </p>
        <p style={{ margin: 0 }}>
          <b>Car:</b> {l.carMiles ? `${l.carMiles} mi` : "no figure"}
          {l.carMin ? `, ${l.carMin} min with no traffic` : ""} · <b>Riders alone:</b> {l.alone}
        </p>
        {l.note && (
          <p className="muted" style={{ margin: 0 }}>
            {l.note}
          </p>
        )}
      </div>
      <a className="btn btn-primary" style={big} href={l.maps} target="_blank" rel="noopener">
        {l.mapsLabel ?? `Google Maps: place ${l.n}, to where they meet`}
      </a>
    </li>
  );
}

function StopCard({ s }: { s: VehicleStop }) {
  return (
    <li className="card" style={{ display: "grid", gridTemplateColumns: "1fr minmax(11rem, 16rem)", gap: "var(--space-3)", alignItems: "center" }}>
      <div>
        <span className="stop-n">{s.n}</span> <b>{s.name}</b>
        <br />
        <span className="small muted">
          Mile {s.mile.toFixed(1)} · {s.arrive} to {s.depart} · {s.durMin} min{s.pinned ? " · at its pin" : " · at its mile on the line"}
        </span>
      </div>
      <a className="btn" style={{ minHeight: "56px", textAlign: "center" }} href={mapsTo(s.lat, s.lon)} target="_blank" rel="noopener">
        Google Maps to stop {s.n}
      </a>
    </li>
  );
}
