import Link from "next/link";
import { requireCrew } from "@/lib/auth";
import { fmtHm } from "@/lib/plan";
import { listSpots, matchSpots, plannedKey, plannedLabel, plannedStops, spotPhotoUrl, type PlannedStop, type SpotLite } from "@/lib/stops";
import { SPOT_KIND_LABEL, streetViewUrl } from "@/lib/stop-place";
import { StopsMap } from "@/components/stops-map";
import { deploySpotAction, undeploySpotAction } from "./actions";

export const dynamic = "force-dynamic";

function offText(off: number | null) {
  if (off == null) return "";
  if (off < 0.06) return "on the route";
  return off < 1 ? `${Math.round(off * 1760)} yards off the route` : `${off.toFixed(1)} miles off the route`;
}

export default async function CrewStopsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireCrew();
  const sp = await searchParams;
  const [{ days }, spots] = await Promise.all([plannedStops(), listSpots()]);
  const all = days.flatMap((d) => d.stops);
  const matched = matchSpots(all, spots);
  const matchedIds = new Set([...matched.values()].flat().map((s) => s.id));
  const extras = spots.filter((s) => !matchedIds.has(s.id));
  const scouted = all.filter((p) => matched.has(plannedKey(p))).length;

  return (
    <div className="stack" style={{ maxWidth: "52rem" }}>
      <div>
        <h1>Stops: the real places</h1>
        <p className="small muted" style={{ margin: 0 }}>
          The plan in <Link href="/crew/route">Route</Link> puts a stop every hour and a longer one every three hours, at a mile on the road. This is where we pin the actual places: a lay-by,
          a car park, somewhere the motorhome and the crew chief car can both pull in. Find them on Street View or the map, pin them, add pictures. When one is right, <b>Make this the stop</b>:
          it replaces the nearest planned stop and the timetable is worked out from its real mile. The pins and pictures are crew only; a longer stop made real shows on the public timetable
          by its name, as Simon&rsquo;s rendezvous did.
        </p>
      </div>
      {sp.removed && <p className="notice">Removed.</p>}
      {sp.deployed && <p className="notice">Done: it is the stop now{sp.replaced ? `, in place of the ${sp.replaced}` : ""}. The timetable in Route has been worked out again from its mile.</p>}
      {sp.undeployed && <p className="notice">Taken out of the plan. The plan&rsquo;s own stop is back.</p>}
      {sp.deployErr && <p className="error">{sp.deployErr}</p>}

      <p className="small" style={{ margin: 0 }}>
        <b>
          {scouted} of {all.length}
        </b>{" "}
        planned stops have a spot pinned{spots.length ? ` · ${spots.length} spot${spots.length === 1 ? "" : "s"} in all` : ""}.{" "}
        <Link href="/crew/stops/new" className="btn btn-sm">
          Pin a spot
        </Link>
      </p>

      <StopsMap
        tall
        spots={spots.map((s) => ({ id: s.id, name: s.name, kind: s.kind, lat: s.lat, lon: s.lon, day: s.day, mile: s.mile, photo: s.firstPhoto ? spotPhotoUrl(s.firstPhoto) : null }))}
        planned={all.map((p) => ({
          key: String(plannedKey(p)),
          day: p.day,
          n: p.n,
          label: plannedLabel(p),
          lat: p.lat,
          lon: p.lon,
          mile: p.mile,
          time: fmtHm(p.arrive),
          scouted: matched.has(plannedKey(p)),
          findHref: `/crew/stops/new?day=${p.day}&n=${p.n}`,
        }))}
      />
      <p className="xs muted" style={{ margin: 0 }}>
        Numbered dots are the planned stops (filled once a spot is pinned for them); pins are the spots. Teal pins are 60 min stops, amber the longer ones. The satellite view is top right.
      </p>

      {days.map((d) => (
        <section key={d.day} className="stack-sm">
          <h2>
            Day {d.day} <span className="small muted">· {d.miles.toFixed(0)} miles</span>
          </h2>
          <ul className="list">
            {d.stops.map((p) => {
              const here = matched.get(plannedKey(p)) ?? [];
              return (
                <li key={p.n} className="card stack-sm stop-row" data-kind={p.kind}>
                  <div className="row-between" style={{ alignItems: "baseline", gap: "var(--space-2)", flexWrap: "wrap" }}>
                    <span>
                      <span className="stop-n">{p.n}</span> <b>{plannedLabel(p)}</b>
                      {p.key?.startsWith("spot:") && (
                        <>
                          {" "}
                          <span className="badge badge-done">real place</span>
                        </>
                      )}
                      <span className="small muted">
                        {" "}
                        · mile {p.mile.toFixed(0)}
                        {p.town ? `, near ${p.town}` : ""} · planned {fmtHm(p.arrive)}
                        {p.durMin ? `, ${p.durMin} min` : ""}
                        {p.dark ? " · dark" : ""}
                      </span>
                    </span>
                    <span className="small">
                      <a href={streetViewUrl(p)} target="_blank" rel="noopener">
                        Street View here
                      </a>
                      {" · "}
                      <Link href={`/crew/stops/new?day=${p.day}&n=${p.n}`}>{here.length ? "Pin another" : "Pin a spot"}</Link>
                    </span>
                  </div>
                  {here.length === 0 ? <p className="xs muted" style={{ margin: 0 }}>No spot pinned yet.</p> : here.map((s) => <SpotLine key={s.id} s={s} planned={p} />)}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {extras.length > 0 && (
        <section className="stack-sm">
          <h2>Other spots</h2>
          <p className="small muted" style={{ margin: 0 }}>
            Pinned, but not within 8 miles of a planned stop (or well off the route).
          </p>
          <ul className="list">
            {extras.map((s) => (
              <li key={s.id} className="card">
                <SpotLine s={s} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function SpotLine({ s, planned }: { s: SpotLite; planned?: PlannedStop }) {
  const isIt = planned?.key === `spot:${s.id}`;
  const delta = planned && !isIt && s.mile != null ? s.mile - planned.mile : null;
  return (
    <div className="spot-line-wrap" id={`spot-${s.id}`}>
      <SpotLink s={s} delta={delta} />
      {s.mile != null && (
        <form action={s.inPlan ? undeploySpotAction : deploySpotAction}>
          <input type="hidden" name="id" value={s.id} />
          <input type="hidden" name="back" value="list" />
          {s.inPlan ? (
            <button className="btn btn-sm btn-quiet" type="submit">
              Take out of the plan
            </button>
          ) : (
            <button className="btn btn-sm btn-primary" type="submit">
              Make this the stop
            </button>
          )}
        </form>
      )}
    </div>
  );
}

function SpotLink({ s, delta }: { s: SpotLite; delta: number | null }) {
  return (
    <Link href={`/crew/stops/${s.id}`} className="spot-line">
      {s.firstPhoto ? <img src={spotPhotoUrl(s.firstPhoto)} alt="" /> : <span className="spot-line-nophoto">no picture</span>}
      <span>
        <b>{s.name}</b> <span className="badge">{SPOT_KIND_LABEL[s.kind] ?? s.kind}</span>
        {s.inPlan && <span className="badge badge-done">the stop</span>}
        <br />
        <span className="small muted">
          Day {s.day}
          {s.mile != null ? `, mile ${s.mile.toFixed(1)}` : ""}
          {delta != null && Math.abs(delta) >= 0.5 ? ` (${Math.abs(delta).toFixed(1)} mi ${delta > 0 ? "later" : "earlier"} than planned)` : ""}
          {s.offMi != null ? ` · ${offText(s.offMi)}` : ""}
          {s.photos ? ` · ${s.photos} picture${s.photos === 1 ? "" : "s"}` : ""} · {s.updatedBy ?? s.createdBy}
        </span>
        {s.notes && <span className="spot-line-notes small">{s.notes.split("\n")[0].slice(0, 140)}</span>}
      </span>
    </Link>
  );
}
