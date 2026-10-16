import Link from "next/link";
import { SEAT_LABELS, VEHICLE_PALETTE } from "@/db/schema";
import { activePeople, requireCrew } from "@/lib/auth";
import { ago } from "@/lib/time";
import { allAssignments, assignmentWarnings, checklist, covers, legsOf, listVehicles, positionsFor, routePoints, seedVehicles, vehicleColour } from "@/lib/vehicles";
import { VehicleMap } from "@/components/vehicle-map";
import { addVehicle, setVehicleRetired } from "./actions";

export const dynamic = "force-dynamic";

export default async function VehiclesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireCrew();
  const sp = await searchParams;
  const admin = s.role === "admin";
  let all = await listVehicles(true);
  if (all.length === 0) {
    await seedVehicles();
    all = await listVehicles(true);
  }
  const vehicles = all.filter((v) => v.active);
  const retired = all.filter((v) => !v.active);
  const people = await activePeople();
  const nameOf = (pid: number) => people.find((p) => p.id === pid)?.shortName ?? "?";
  const rows = await allAssignments();
  const points = await routePoints();
  const legs = legsOf(points);
  const checks = await checklist();
  const pos = await positionsFor(
    vehicles.map((v) => v.id),
    1,
  );
  const byId = new Map(all.map((v) => [v.id, v]));
  const warnings = assignmentWarnings(
    points,
    rows.filter((r) => byId.get(r.vehicleId)?.active),
    vehicles.map((v) => v.id),
    nameOf,
    (id) => byId.get(id)?.name ?? "?",
  );

  // Who is in which vehicle on each leg — one row per person who is in any vehicle.
  const assigned = [...new Set(rows.filter((r) => byId.get(r.vehicleId)?.active).map((r) => r.personId))].sort(
    (a, b) => (people.find((p) => p.id === a)?.sortOrder ?? 999) - (people.find((p) => p.id === b)?.sortOrder ?? 999),
  );
  const unassigned = people.filter((p) => p.shortName !== "Fiona" && !assigned.includes(p.id));

  return (
    <div className="stack">
      <div className="row-between">
        <h2 style={{ margin: 0 }}>Vehicles</h2>
        <div className="row">
          <a className="btn btn-sm" href="#map">
            Map
          </a>
          <a className="btn btn-sm" href="#who">
            Who&rsquo;s in which
          </a>
        </div>
      </div>

      <nav className="veh-strip" aria-label="Vehicles">
        {vehicles.map((v) => (
          <Link key={v.id} href={`/crew/vehicles/${v.id}`} className="veh-chip" style={{ "--vc": vehicleColour(v.colour) } as React.CSSProperties}>
            <span className="veh-dot" />
            {v.name}
          </Link>
        ))}
      </nav>

      {sp.retired && <p className="notice">Vehicle retired — it&rsquo;s at the bottom of this page if you want it back.</p>}

      <div className="veh-cards">
        {vehicles.map((v) => {
          const vr = rows.filter((r) => r.vehicleId === v.id);
          const drivers = [...new Set(vr.filter((r) => r.seat === "driver").map((r) => nameOf(r.personId)))];
          const passengers = [...new Set(vr.filter((r) => r.seat === "passenger").map((r) => nameOf(r.personId)))];
          const cl = checks.filter((c) => c.vehicleId === v.id);
          const done = cl.filter((c) => c.checked).length;
          const last = pos.get(v.id)?.at(-1);
          return (
            <Link key={v.id} href={`/crew/vehicles/${v.id}`} className="veh-card" style={{ "--vc": vehicleColour(v.colour) } as React.CSSProperties}>
              {v.hasPhoto ? (
                <img className="veh-card-photo" src={`/api/vehicles/photo/${v.id}?v=${encodeURIComponent(v.updatedAt)}`} alt="" />
              ) : (
                <div className="veh-card-photo veh-card-nophoto">No photo yet</div>
              )}
              <div className="veh-card-body">
                <h3>{v.name}</h3>
                <div className="small muted">
                  {v.make || v.registration ? (
                    <>
                      {v.make}
                      {v.make && v.registration ? " · " : ""}
                      {v.registration && <span className="veh-reg">{v.registration}</span>}
                    </>
                  ) : (
                    "Type and registration not set"
                  )}
                </div>
                <dl className="veh-facts small">
                  <dt>{SEAT_LABELS.driver}</dt>
                  <dd className={drivers.length ? undefined : "red"}>{drivers.join(", ") || "None yet"}</dd>
                  <dt>Passengers</dt>
                  <dd className={passengers.length ? undefined : "muted"}>{passengers.join(", ") || "—"}</dd>
                  <dt>Checklist</dt>
                  <dd>
                    {cl.length ? (
                      <>
                        <span className="veh-bar" aria-hidden="true">
                          <span style={{ width: `${(done / cl.length) * 100}%` }} />
                        </span>{" "}
                        <span className="mono xs">
                          {done}/{cl.length}
                        </span>
                      </>
                    ) : (
                      <span className="muted">No items</span>
                    )}
                  </dd>
                  <dt>Seen</dt>
                  <dd className={last ? undefined : "muted"}>{last ? ago(last.at) : "No position yet"}</dd>
                </dl>
              </div>
            </Link>
          );
        })}
      </div>

      <section id="map" className="stack-sm">
        <h3 className="group-title">
          <span>Where they are</span>
          <span className="small muted">phones, trackers or a pasted location</span>
        </h3>
        <VehicleMap tall />
        <div className="veh-legend small">
          {vehicles.map((v) => (
            <span key={v.id} style={{ "--vc": vehicleColour(v.colour) } as React.CSSProperties}>
              <span className="veh-dot" /> {v.name}
            </span>
          ))}
        </div>
      </section>

      <section id="who" className="stack-sm">
        <h3 className="group-title">
          <span>Who&rsquo;s in which vehicle</span>
          <span className="small muted">stop by stop — set it on each vehicle&rsquo;s page</span>
        </h3>
        {warnings.length > 0 && (
          <ul className="veh-warn small">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
        {assigned.length === 0 ? (
          <p className="muted small">Nobody is in a vehicle yet. Open a vehicle and add its driver and passengers.</p>
        ) : (
          <div className="table-wrap">
            <table className="table veh-matrix">
              <thead>
                <tr>
                  <th>Who</th>
                  {legs.map((l) => (
                    <th key={l.index} title={`${l.from.label} → ${l.to.label}`}>
                      <span className="xs">{l.from.short}</span>
                      <br />
                      <span className="faint xs">→ {l.to.short}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {assigned.map((pid) => (
                  <tr key={pid}>
                    <td>
                      <Link href={`/crew/people/${pid}`}>{nameOf(pid)}</Link>
                    </td>
                    {legs.map((l) => {
                      const here = rows.filter((r) => r.personId === pid && byId.get(r.vehicleId)?.active && covers(points, r, l.index));
                      return (
                        <td key={l.index}>
                          {here.map((r) => {
                            const v = byId.get(r.vehicleId)!;
                            return (
                              <Link
                                key={r.id}
                                href={`/crew/vehicles/${v.id}#crew`}
                                className="veh-seat"
                                data-seat={r.seat}
                                title={`${v.name} — ${SEAT_LABELS[r.seat]}${r.note ? ` (${r.note})` : ""}`}
                                style={{ "--vc": vehicleColour(v.colour) } as React.CSSProperties}
                              >
                                {v.name.split(" ")[0]}
                                {r.seat === "driver" ? " ◆" : ""}
                              </Link>
                            );
                          })}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="xs muted" style={{ margin: 0 }}>
          ◆ driving. Each column is the stretch between two points on the route — the stops come from the route plan.
          {unassigned.length > 0 && <> Not in a vehicle yet: {unassigned.map((p) => p.shortName).join(", ")}.</>}
        </p>
      </section>

      {admin && (
        <section className="card stack-sm">
          <h3 style={{ margin: 0 }}>Add a vehicle</h3>
          <form action={addVehicle} className="stack-sm">
            <label className="field">
              <span>Name</span>
              <input type="text" name="name" required maxLength={60} placeholder="Second follow car" />
            </label>
            <fieldset className="veh-swatches">
              <legend className="small">Colour</legend>
              {VEHICLE_PALETTE.map((c, i) => (
                <label key={c} className="veh-swatch" style={{ "--vc": `var(--vehicle-${c})` } as React.CSSProperties}>
                  <input type="radio" name="colour" value={c} defaultChecked={i === vehicles.length % VEHICLE_PALETTE.length} />
                  <span className="sr-only">Colour {i + 1}</span>
                </label>
              ))}
            </fieldset>
            <div>
              <button className="btn btn-primary btn-sm" type="submit">
                Add and open it
              </button>
            </div>
          </form>
        </section>
      )}

      {admin && retired.length > 0 && (
        <section className="stack-sm">
          <h3 className="group-title">
            <span>Retired</span>
            <span className="small muted">{retired.length}</span>
          </h3>
          <ul className="list small">
            {retired.map((v) => (
              <li key={v.id} className="row-between">
                <span>{v.name}</span>
                <form action={setVehicleRetired}>
                  <input type="hidden" name="id" value={v.id} />
                  <input type="hidden" name="retire" value="0" />
                  <button className="btn btn-sm" type="submit">
                    Bring back
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
