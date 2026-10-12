import { db, ready, schema } from "@/db/client";
import { PublicShell } from "@/components/shells";
import { Holding } from "@/components/holding";
import { gate, publicMetadata } from "@/lib/public";
import { getSetting } from "@/lib/settings";
import { gpxExists } from "@/lib/gpx";
import { RouteMap } from "@/components/route-map";

export const dynamic = "force-dynamic";
export const generateMetadata = () => publicMetadata("The route");

const KIND_LABEL: Record<string, string> = { short: "stop", long: "long stop", lunch: "lunch", overnight: "overnight", finish: "finish" };

export default async function RoutePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const g = await gate(await searchParams);
  if (g.holding) return <Holding />;
  await ready();
  const days = await db.select().from(schema.routeDays).orderBy(schema.routeDays.day).all();
  const stops = await db.select().from(schema.routeStops).orderBy(schema.routeStops.dayId, schema.routeStops.sortOrder).all();
  const startLabel = await getSetting("route.start_label");
  const anyTimes = stops.some((s) => !!s.plannedTime);
  const gpx = { 1: gpxExists(1), 2: gpxExists(2) };
  const anyGpx = gpx[1] || gpx[2];

  return (
    <PublicShell preview={g.preview} liveActive={g.liveActive}>
      <header className="section">
        <div className="dates">Saturday 14 – Sunday 15 November 2026</div>
        <h1 className="page-title">The route</h1>
        <p className="prose">
          {startLabel} to Yeadon Cemetery — about 240 miles over two days, the finish on the second anniversary.
        </p>
      </header>
      {anyGpx ? (
        <div className="map mt-4">
          <RouteMap />
        </div>
      ) : (
        <p className="muted mt-4">The map will appear here once the final route files are in.</p>
      )}
      <div className="stack mt-6">
        {days.map((d) => {
          const ds = stops.filter((s) => s.dayId === d.id);
          return (
            <section key={d.id} className="card card-lg day-block">
              <h2>{d.label}</h2>
              <p className="muted" style={{ margin: 0 }}>
                {d.day === 1 ? startLabel : d.startLabel} → {d.endLabel}
              </p>
              <div className="day-stats">
                {d.miles && (
                  <span>
                    <b>{Math.round(d.miles)}</b> miles
                  </span>
                )}
                {d.feet && (
                  <span>
                    <b>{d.feet.toLocaleString("en-GB")}</b> ft of climbing
                  </span>
                )}
              </div>
              <p className="row small" style={{ margin: 0 }}>
                {d.stravaUrl && (
                  <a href={d.stravaUrl} target="_blank" rel="noopener">
                    Route on Strava →
                  </a>
                )}
                {gpx[d.day as 1 | 2] && <a href={`/api/route-geo?day=${d.day}&format=gpx`}>Download GPX</a>}
              </p>
              {ds.length > 0 && (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Stop</th>
                        <th>Mile</th>
                        <th>Kind</th>
                        {anyTimes && <th>Planned</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {ds.map((s) => (
                        <tr key={s.id}>
                          <td>
                            {s.name}
                            {s.notes && <div className="xs muted">{s.notes}</div>}
                          </td>
                          <td>{s.approxMile ?? ""}</td>
                          <td>{KIND_LABEL[s.kind]}</td>
                          {anyTimes && <td>{s.plannedTime ?? ""}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </PublicShell>
  );
}
