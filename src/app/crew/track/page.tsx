import Link from "next/link";
import { requireCrew } from "@/lib/auth";
import { crewMembers } from "@/lib/people";
import { FRESH_MS, trackerTokenFor, trackingFeed, trackingPublic } from "@/lib/tracking";
import { ago } from "@/lib/time";
import { VehicleMap } from "@/components/vehicle-map";
import { TrackerSetup } from "@/components/tracker-setup";
import { setPublicTracking } from "./actions";
import { trackUrlBase } from "@/lib/track-url";

export const dynamic = "force-dynamic";

export default async function TrackPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireCrew();
  const sp = await searchParams;
  const me = (await crewMembers()).find((p) => p.id === s.pid);
  const feed = await trackingFeed({ trail: 1 });
  const isPublic = await trackingPublic();
  const base = await trackUrlBase();
  const myUrl = me ? base + (await trackerTokenFor(me.id)) : null;
  const now = Date.now();

  const people = [...feed.people].sort((a, b) => Number(b.isRider) - Number(a.isRider) || (b.last ? Date.parse(b.last.at) : 0) - (a.last ? Date.parse(a.last.at) : 0) || a.name.localeCompare(b.name));
  const live = people.filter((p) => p.last && now - Date.parse(p.last.at) <= FRESH_MS).length;

  return (
    <div className="stack">
      <div className="row-between" style={{ alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ margin: 0 }}>Tracking</h1>
        <span className="small muted">
          {live} of {people.length} phones live · {feed.vehicles.filter((v) => v.last).length} vehicle{feed.vehicles.filter((v) => v.last).length === 1 ? "" : "s"} placed
        </span>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Everyone&rsquo;s phone and every vehicle on one map, from the OwnTracks app on each phone. Riders are the dark discs, crew the light ones, vehicles the coloured letters. The public{" "}
        <Link href="/live">live page</Link> shows the riders only{isPublic ? "" : " (switched off until you turn it on below)"}.
      </p>

      <VehicleMap tall />

      {myUrl && me ? (
        <TrackerSetup url={myUrl} name={me.shortName} personId={me.id} isSelf sp={sp} />
      ) : (
        <p className="muted small">You are signed in as {s.name}, who is not on the crew list, so there is no phone to set up.</p>
      )}

      <section className="card stack-sm">
        <h2>Everyone</h2>
        <table className="track-table">
          <thead>
            <tr>
              <th>Who</th>
              <th>Last seen</th>
              <th>Where</th>
              <th>Battery</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => {
              const age = p.last ? now - Date.parse(p.last.at) : null;
              const cls = age === null ? "track-none" : age <= FRESH_MS ? "track-live" : "track-stale";
              return (
                <tr key={p.id}>
                  <td>
                    <span className="track-dot" style={{ "--vc": p.colour } as React.CSSProperties} />
                    {p.name} <span className="xs muted">{p.isRider ? "rider" : "crew"}</span>
                  </td>
                  <td className={cls}>{p.last ? ago(p.last.at) : p.hasToken ? "nothing yet" : "not set up"}</td>
                  <td className="small">
                    {p.last ? (
                      <>
                        {p.mile != null ? `mile ${p.mile}` : "off the route"}
                        {p.last.speed != null && p.last.speed > 0.5 ? ` · ${Math.round(p.last.speed * 2.237)} mph` : ""}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="small">{p.last?.battery != null ? `${Math.round(p.last.battery)}%` : "—"}</td>
                  <td className="small">
                    {(s.role === "admin" || p.id === s.pid) && (
                      <Link href={p.id === s.pid ? "/crew/track#setup" : `/crew/track/${p.id}`}>{p.id === s.pid ? "Mine" : "Set up"}</Link>
                    )}
                  </td>
                </tr>
              );
            })}
            {feed.vehicles.map((v) => {
              const age = v.last ? now - Date.parse(v.last.at) : null;
              const cls = age === null ? "track-none" : age <= FRESH_MS ? "track-live" : "track-stale";
              return (
                <tr key={`v${v.id}`}>
                  <td>
                    <span className="track-dot" style={{ "--vc": v.colour } as React.CSSProperties} />
                    {v.name} <span className="xs muted">vehicle</span>
                  </td>
                  <td className={cls}>{v.last ? ago(v.last.at) : "nothing yet"}</td>
                  <td className="small">{v.last?.speed != null && v.last.speed > 0.5 ? `${Math.round(v.last.speed * 2.237)} mph` : v.last ? "stopped" : "—"}</td>
                  <td className="small">{v.last?.battery != null ? `${Math.round(v.last.battery)}%` : "—"}</td>
                  <td className="small">
                    <Link href={`/crew/vehicles/${v.id}#location`}>Set up</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="xs muted" style={{ margin: 0 }}>
          Live means a fix in the last {Math.round(FRESH_MS / 60_000)} minutes. {s.role === "admin" ? "Set up opens that person’s address and steps, so you can send them." : "An admin can open anyone’s set-up page to help them."} Vehicles are set up from their own
          page under Vehicles → Location, with the same kind of address.
        </p>
      </section>

      {s.role === "admin" && (
        <section className="card stack-sm">
          <h2>The public map</h2>
          <p className="small muted" style={{ margin: 0 }}>
            {isPublic
              ? "The riders’ phones are showing on the public live page and the home page. Crew and vehicles never show publicly."
              : "The riders’ phones are not showing publicly yet; crew sessions see them on the public pages as a preview. Turn it on on the morning of the ride — or now, if you are happy for anyone to see where the riders are."}
          </p>
          <form action={setPublicTracking}>
            <input type="hidden" name="on" value={isPublic ? "0" : "1"} />
            <button className={`btn ${isPublic ? "" : "btn-primary"}`} type="submit">
              {isPublic ? "Hide the riders from the public map" : "Show the riders on the public map"}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
