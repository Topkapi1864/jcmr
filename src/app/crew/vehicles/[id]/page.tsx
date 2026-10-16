import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { KIT_STATUS_LABELS, KIT_STORAGE, KIT_STORAGE_LABELS, SEATS, SEAT_LABELS, VEHICLE_PALETTE, type VehicleCrewRow } from "@/db/schema";
import { activePeople, requireCrew } from "@/lib/auth";
import { allItems, ridersWithPeople } from "@/lib/kit";
import { ago, fmtWhen } from "@/lib/time";
import { allAssignments, checklist, getVehicle, isCustomColour, listVehicles, pointIndex, positionsFor, routePoints, vehicleColour, type RoutePoint } from "@/lib/vehicles";
import { VehicleMap } from "@/components/vehicle-map";
import { VehiclePhotoInput } from "@/components/vehicle-photo-input";
import { VehicleCheck } from "@/components/vehicle-check";
import {
  addChecklist,
  clearVehiclePositions,
  deleteVehicleCrew,
  pasteLocation,
  resetVehicleChecklist,
  rotateVehicleToken,
  saveChecklistItem,
  saveVehicleCrew,
  saveVehicleDetails,
  setVehicleRetired,
} from "../actions";

export const dynamic = "force-dynamic";

type Person = { id: number; shortName: string; name: string };

function Text({ value, empty }: { value: string; empty: string }) {
  return value.trim() ? <div className="veh-text">{value}</div> : <p className="muted small" style={{ margin: 0 }}>{empty}</p>;
}

function PointSelect({ name, points, value, end }: { name: string; points: RoutePoint[]; value: string; end?: boolean }) {
  const list = end ? points.slice(1) : points.slice(0, -1);
  return (
    <select name={name} defaultValue={value}>
      {list.map((p) => (
        <option key={p.key} value={p.key}>
          {p.label}
        </option>
      ))}
    </select>
  );
}

function CrewForm({ vehicleId, row, people, points, others }: { vehicleId: number; row?: VehicleCrewRow; people: Person[]; points: RoutePoint[]; others: { id: number; name: string }[] }) {
  return (
    <form action={saveVehicleCrew} className="stack-sm">
      <input type="hidden" name="vehicleId" value={vehicleId} />
      {row && <input type="hidden" name="id" value={row.id} />}
      <div className="form-inline">
        <label className="field" style={{ flex: "2 1 10rem" }}>
          <span>Who</span>
          <select name="personId" defaultValue={row?.personId ?? ""} required>
            <option value="" disabled>
              — pick someone
            </option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ flex: "1 1 8rem" }}>
          <span>Seat</span>
          <select name="seat" defaultValue={row?.seat ?? "passenger"}>
            {SEATS.map((s) => (
              <option key={s} value={s}>
                {SEAT_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="form-inline">
        <label className="field" style={{ flex: "1 1 12rem" }}>
          <span>From</span>
          <PointSelect name="fromPoint" points={points} value={row?.fromPoint ?? points[0]?.key ?? "day:1"} />
        </label>
        <label className="field" style={{ flex: "1 1 12rem" }}>
          <span>Until</span>
          <PointSelect name="untilPoint" points={points} value={row?.untilPoint ?? "end"} end />
        </label>
      </div>
      <label className="field">
        <span>Note</span>
        <input type="text" name="note" maxLength={200} defaultValue={row?.note ?? ""} placeholder="swaps with Adam at lunch, joins at Loughborough…" />
      </label>
      {row && others.length > 0 && (
        <label className="field">
          <span>Move to another vehicle</span>
          <select name="moveTo" defaultValue="">
            <option value="">— stay in this one</option>
            {others.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="row">
        <button className="btn btn-sm btn-primary" type="submit">
          {row ? "Save" : "Add to this vehicle"}
        </button>
      </div>
    </form>
  );
}

export default async function VehiclePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireCrew();
  const admin = s.role === "admin";
  const { id } = await params;
  const sp = await searchParams;
  const v = await getVehicle(Number(id));
  if (!v) notFound();
  const colour = vehicleColour(v.colour);
  const all = await listVehicles();
  const others = all.filter((o) => o.id !== v.id);
  const people = (await activePeople()).filter((p) => p.shortName !== "Fiona");
  const nameOf = (pid: number) => people.find((p) => p.id === pid)?.name ?? "?";
  const points = await routePoints();
  const label = (key: string, fallback: "start" | "end") => points[pointIndex(points, key, fallback)]?.label ?? key;
  const crew = (await allAssignments())
    .filter((r) => r.vehicleId === v.id)
    .sort((a, b) => pointIndex(points, a.fromPoint, "start") - pointIndex(points, b.fromPoint, "start") || (a.seat === "driver" ? -1 : 1));
  const items = await checklist(v.id);
  const done = items.filter((i) => i.checked).length;
  const kit = v.kitStorage ? (await allItems()).filter((i) => i.storage === v.kitStorage) : [];
  const riders = kit.length ? await ridersWithPeople() : [];
  const trail = (await positionsFor([v.id], 1)).get(v.id) ?? [];
  const last = trail.at(-1);
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "the-site";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const pingUrl = `${proto}://${host}/api/vehicles/ping/${v.token}`;
  const photoUrl = v.hasPhoto ? `/api/vehicles/photo/${v.id}?v=${encodeURIComponent(v.updatedAt)}` : null;

  return (
    <div className="stack veh-page" style={{ "--vc": colour } as React.CSSProperties}>
      <div className="row-between">
        <Link href="/crew/vehicles" className="small">
          ← Vehicles
        </Link>
        <nav className="row veh-strip-mini" aria-label="Other vehicles">
          {all.map((o) => (
            <Link
              key={o.id}
              href={`/crew/vehicles/${o.id}`}
              className="veh-chip"
              aria-current={o.id === v.id ? "page" : undefined}
              style={{ "--vc": vehicleColour(o.colour) } as React.CSSProperties}
            >
              <span className="veh-dot" />
              {o.name}
            </Link>
          ))}
        </nav>
      </div>

      <header className="veh-hero">
        {photoUrl ? <img src={photoUrl} alt={`The ${v.name}`} className="veh-hero-photo" /> : <div className="veh-hero-photo veh-card-nophoto">Photo to come</div>}
        <div className="veh-hero-text">
          <span className="eyebrow">{v.active ? "Vehicle" : "Retired vehicle"}</span>
          <h2 style={{ margin: "4px 0" }}>{v.name}</h2>
          <div>
            {v.make || <span className="muted">Type not set</span>}
            {" · "}
            {v.registration ? <span className="veh-reg">{v.registration}</span> : <span className="muted">no registration yet</span>}
          </div>
          <nav className="row small" style={{ marginTop: 10 }}>
            <a href="#about">About</a>
            <a href="#crew">Crew</a>
            <a href="#checklist">Checklist</a>
            <a href="#location">Location</a>
          </nav>
        </div>
      </header>

      {sp.saved && <p className="notice">Saved.</p>}
      {sp.new && <p className="notice">Added. Fill in the details below — open &ldquo;Edit details&rdquo;.</p>}

      {/* ---- About ---- */}
      <section id="about" className="stack-sm">
        <div className="veh-two">
          <div className="card stack-sm">
            <h3 className="veh-h">Role</h3>
            <Text value={v.role} empty="What this vehicle is for — open Edit details to write it." />
          </div>
          <div className="card stack-sm">
            <h3 className="veh-h">Driving strategy</h3>
            <Text value={v.strategy} empty="How it is driven on the day — where it sits relative to the riders, where it waits." />
          </div>
        </div>
        <div className="card stack-sm">
          <h3 className="veh-h">What&rsquo;s in it</h3>
          <Text value={v.contents} empty="Notes on what this vehicle carries. The tick-list is under Checklist." />
        </div>
        <details className="card">
          <summary className="veh-summary">Edit details</summary>
          <form action={saveVehicleDetails} className="stack-sm" style={{ marginTop: 12 }}>
            <input type="hidden" name="id" value={v.id} />
            <div className="form-inline">
              <label className="field" style={{ flex: "2 1 12rem" }}>
                <span>Name</span>
                <input type="text" name="name" required maxLength={60} defaultValue={v.name} />
              </label>
              <label className="field" style={{ flex: "0 1 6rem" }}>
                <span>Order</span>
                <input type="number" name="sortOrder" defaultValue={v.sortOrder} min={0} max={999} />
              </label>
            </div>
            <div className="form-inline">
              <label className="field" style={{ flex: "2 1 12rem" }}>
                <span>Type of vehicle</span>
                <input type="text" name="make" maxLength={80} defaultValue={v.make} placeholder="VW Transporter T6 · Swift six-berth motorhome" />
              </label>
              <label className="field" style={{ flex: "1 1 8rem" }}>
                <span>Registration</span>
                <input type="text" name="registration" maxLength={16} defaultValue={v.registration} placeholder="AB12 CDE" className="mono" style={{ textTransform: "uppercase" }} />
              </label>
            </div>
            <fieldset className="veh-swatches">
              <legend className="small">Colour</legend>
              {VEHICLE_PALETTE.map((c, i) => (
                <label key={c} className="veh-swatch" style={{ "--vc": `var(--vehicle-${c})` } as React.CSSProperties}>
                  <input type="radio" name="colour" value={c} defaultChecked={v.colour === c} />
                  <span className="sr-only">Colour {i + 1}</span>
                </label>
              ))}
              <label className="veh-swatch-custom small">
                <input type="radio" name="colour" value="custom" defaultChecked={isCustomColour(v.colour)} /> Your own:
                <input type="color" name="colourCustom" defaultValue={isCustomColour(v.colour) ? v.colour : undefined} aria-label="Pick your own colour" />
              </label>
            </fieldset>
            <label className="field">
              <span>Role</span>
              <textarea name="role" rows={4} maxLength={4000} defaultValue={v.role} />
            </label>
            <label className="field">
              <span>Driving strategy</span>
              <textarea name="strategy" rows={5} maxLength={4000} defaultValue={v.strategy} />
            </label>
            <label className="field">
              <span>What&rsquo;s in it (notes)</span>
              <textarea name="contents" rows={4} maxLength={4000} defaultValue={v.contents} />
            </label>
            <label className="field">
              <span>Riders&rsquo; kit packed in it</span>
              <select name="kitStorage" defaultValue={v.kitStorage}>
                {KIT_STORAGE.filter((k) => k !== "bike" && k !== "bag" && k !== "home").map((k) => (
                  <option key={k} value={k}>
                    {k ? KIT_STORAGE_LABELS[k] : "— none"}
                  </option>
                ))}
              </select>
              <span className="xs muted">The &ldquo;Where it goes&rdquo; choice on the riders&rsquo; kit lists — those items then show on this page.</span>
            </label>
            <label className="field">
              <span>Tracker share link (optional)</span>
              <input type="url" name="trackerUrl" defaultValue={v.trackerUrl} placeholder="https://… the share link from a bought tracker's app" inputMode="url" />
            </label>
            <VehiclePhotoInput current={photoUrl} />
            <div className="row">
              <button className="btn btn-primary" type="submit">
                Save details
              </button>
            </div>
          </form>
          {admin && v.active && (
            <form action={setVehicleRetired} style={{ marginTop: 16 }}>
              <input type="hidden" name="id" value={v.id} />
              <input type="hidden" name="retire" value="1" />
              <button className="btn btn-sm btn-quiet" type="submit">
                Retire this vehicle
              </button>
            </form>
          )}
        </details>
        <p className="xs muted" style={{ margin: 0 }}>{v.updatedBy && v.updatedAt ? `Last changed by ${v.updatedBy}, ${fmtWhen(v.updatedAt)}` : ""}</p>
      </section>

      {/* ---- Crew ---- */}
      <section id="crew" className="stack-sm">
        <h3 className="group-title">
          <span>Crew</span>
          <span className="small muted">drivers and passengers</span>
        </h3>
        {sp.crew && <p className="notice">Saved.</p>}
        {crew.length === 0 ? (
          <p className="muted small">Nobody in this vehicle yet.</p>
        ) : (
          <ul className="veh-crew">
            {crew.map((r) => (
              <li key={r.id} className="card">
                <div className="row-between">
                  <div>
                    <span className="veh-seat" data-seat={r.seat}>
                      {SEAT_LABELS[r.seat]}
                    </span>{" "}
                    <b>{nameOf(r.personId)}</b>
                    <div className="small muted">
                      {r.fromPoint === points[0]?.key && r.untilPoint === "end" ? "The whole ride" : `${label(r.fromPoint, "start")} → ${label(r.untilPoint, "end")}`}
                      {r.note ? ` · ${r.note}` : ""}
                    </div>
                  </div>
                  <form action={deleteVehicleCrew}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="vehicleId" value={v.id} />
                    <button className="btn btn-sm btn-quiet" type="submit" aria-label={`Take ${nameOf(r.personId)} out of this vehicle`}>
                      Remove
                    </button>
                  </form>
                </div>
                <details style={{ marginTop: 6 }}>
                  <summary className="small veh-summary">Change</summary>
                  <div style={{ marginTop: 8 }}>
                    <CrewForm vehicleId={v.id} row={r} people={people} points={points} others={others.map((o) => ({ id: o.id, name: o.name }))} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
        <details className="card" open={crew.length === 0}>
          <summary className="veh-summary">Add someone to this vehicle</summary>
          <div style={{ marginTop: 10 }}>
            <CrewForm vehicleId={v.id} people={people} points={points} others={[]} />
          </div>
        </details>
        <p className="xs muted" style={{ margin: 0 }}>
          The From / Until points are the route&rsquo;s stops (Crew → Route). To show a swap, set the first row to &ldquo;until&rdquo; the stop where it happens, then add them to
          the other vehicle &ldquo;from&rdquo; that stop. <Link href="/crew/vehicles#who">See everyone, stop by stop</Link>.
        </p>
      </section>

      {/* ---- Checklist ---- */}
      <section id="checklist" className="stack-sm">
        <h3 className="group-title">
          <span>Checklist</span>
          <span className="small muted">
            {items.length ? `${done} of ${items.length} in the vehicle` : "nothing listed yet"}
          </span>
        </h3>
        {sp.added && <p className="notice">Added {sp.added}.</p>}
        {sp.reset && <p className="notice">All ticks cleared — ready to check again.</p>}
        {items.length > 0 && (
          <div className="veh-bar veh-bar-lg" role="progressbar" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={done}>
            <span style={{ width: `${(done / items.length) * 100}%` }} />
          </div>
        )}
        <ul className="veh-checklist">
          {items.map((i) => (
            <li key={i.id} data-checked={i.checked}>
              <VehicleCheck id={i.id} checked={i.checked} label={i.name} />
              <div className="veh-check-text">
                <span className="veh-check-name">
                  {i.qty > 1 && <span className="mono">{i.qty} × </span>}
                  {i.name}
                </span>
                {i.note && <span className="xs muted">{i.note}</span>}
                {i.checked && i.checkedBy && (
                  <span className="xs faint">
                    ✓ {i.checkedBy}, {fmtWhen(i.checkedAt)}
                  </span>
                )}
              </div>
              <details className="veh-check-edit">
                <summary aria-label={`Edit ${i.name}`}>▸</summary>
                <form action={saveChecklistItem} className="form-inline">
                  <input type="hidden" name="id" value={i.id} />
                  <input type="hidden" name="vehicleId" value={v.id} />
                  <input type="text" name="name" defaultValue={i.name} maxLength={120} required aria-label="Item" style={{ flex: "2 1 10rem" }} />
                  <input type="number" name="qty" defaultValue={i.qty} min={1} max={999} aria-label="Quantity" style={{ flex: "0 1 4.5rem" }} />
                  <input type="text" name="note" defaultValue={i.note} maxLength={200} placeholder="note" aria-label="Note" style={{ flex: "2 1 10rem" }} />
                  <button className="btn btn-sm" type="submit">
                    Save
                  </button>
                  <button className="btn btn-sm btn-quiet" type="submit" name="delete" value="1">
                    Delete
                  </button>
                </form>
              </details>
            </li>
          ))}
        </ul>
        <form action={addChecklist} className="card stack-sm">
          <input type="hidden" name="vehicleId" value={v.id} />
          <label className="field">
            <span>Add items — one per line</span>
            <textarea name="lines" rows={3} placeholder={"Track pump\n2 x Spare wheels\nFirst aid kit — the big green one"} required />
          </label>
          <div className="row-between">
            <span className="xs muted">&ldquo;2 x …&rdquo; sets a quantity, &ldquo;— …&rdquo; adds a note.</span>
            <button className="btn btn-sm btn-primary" type="submit">
              Add
            </button>
          </div>
        </form>
        {done > 0 && (
          <form action={resetVehicleChecklist}>
            <input type="hidden" name="vehicleId" value={v.id} />
            <button className="btn btn-sm btn-quiet" type="submit">
              Clear all ticks (to run the check again)
            </button>
          </form>
        )}

        {v.kitStorage && (
          <div className="stack-sm" style={{ marginTop: 8 }}>
            <h4 className="small" style={{ margin: 0 }}>
              Riders&rsquo; kit going in the {KIT_STORAGE_LABELS[v.kitStorage as (typeof KIT_STORAGE)[number]]}{" "}
              <span className="muted">· from the kit lists</span>
            </h4>
            {kit.length === 0 ? (
              <p className="xs muted" style={{ margin: 0 }}>
                Nothing yet — on a rider&rsquo;s kit list, set &ldquo;Where it goes&rdquo; to {KIT_STORAGE_LABELS[v.kitStorage as (typeof KIT_STORAGE)[number]]}.
              </p>
            ) : (
              <div className="table-wrap">
                <table className="table small">
                  <tbody>
                    {kit.map((k) => (
                      <tr key={k.id}>
                        <td>
                          <Link href={`/crew/kit/${k.riderId}#item-${k.id}`}>{k.name}</Link>
                        </td>
                        <td className="muted">{riders.find((r) => r.id === k.riderId)?.displayName.split(" ")[0]}</td>
                        <td className="mono">{k.qty}</td>
                        <td className={k.status === "have" ? undefined : "red"}>{KIT_STATUS_LABELS[k.status]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ---- Location ---- */}
      <section id="location" className="stack-sm">
        <h3 className="group-title">
          <span>Location</span>
          <span className="small muted">{last ? `last seen ${ago(last.at)}` : "no position yet"}</span>
        </h3>
        {sp.where === "ok" && <p className="notice">Location saved.</p>}
        {sp.where === "bad" && <p className="error">Couldn&rsquo;t find a location in that — paste a Google Maps link or &ldquo;53.86, -1.69&rdquo;.</p>}
        {sp.rotated && <p className="notice">New tracker address made — the old one no longer works. Put the new one into the tracker app.</p>}
        <VehicleMap vehicleId={v.id} />
        {last && (
          <p className="small muted" style={{ margin: 0 }}>
            {fmtWhen(last.at)} ·{" "}
            {last.source === "phone" ? `${last.by}'s phone` : last.source === "pasted" ? `pasted by ${last.by}` : "tracker"}
            {last.accuracy != null ? ` · ±${Math.round(last.accuracy)} m` : ""}
            {last.battery != null ? ` · battery ${Math.round(last.battery)}%` : ""} ·{" "}
            <a href={`https://www.google.com/maps/dir/?api=1&destination=${last.lat},${last.lng}`} target="_blank" rel="noopener">
              Directions to it
            </a>
          </p>
        )}
        <div className="veh-two">
          <div className="card stack-sm">
            <h4 className="veh-h">Share from a phone in the vehicle</h4>
            <p className="small muted" style={{ margin: 0 }}>
              Open this on the phone that travels in the {v.name}, signed in to the crew board. Keep it on a charger with the page open — phones stop sharing from a web page when
              the screen locks.
            </p>
            <Link className="btn btn-primary" href={`/crew/vehicles/${v.id}/share`}>
              Share this phone&rsquo;s location
            </Link>
          </div>
          <div className="card stack-sm">
            <h4 className="veh-h">Paste a location</h4>
            <p className="small muted" style={{ margin: 0 }}>
              From WhatsApp: tap a shared location, open it in Maps, copy the link, paste it here. A Google or Apple Maps link, or &ldquo;53.86, -1.69&rdquo;, all work.
            </p>
            <form action={pasteLocation} className="form-inline">
              <input type="hidden" name="vehicleId" value={v.id} />
              <input type="text" name="where" required placeholder="https://maps.google.com/?q=…" style={{ flex: "1 1 12rem" }} aria-label="Location link or coordinates" />
              <button className="btn btn-sm" type="submit">
                Set
              </button>
            </form>
          </div>
        </div>
        <details className="card">
          <summary className="veh-summary">Tracker app or a bought tracker</summary>
          <div className="stack-sm small" style={{ marginTop: 10 }}>
            {v.trackerUrl && (
              <p style={{ margin: 0 }}>
                Tracker&rsquo;s own share page:{" "}
                <a href={v.trackerUrl} target="_blank" rel="noopener">
                  open it
                </a>
              </p>
            )}
            <p style={{ margin: 0 }}>
              For tracking that keeps going with the screen off, put a phone in the vehicle running a free tracker app and point it at this vehicle&rsquo;s address:
            </p>
            <code className="veh-code">{pingUrl}</code>
            <ul className="list">
              <li>
                <b>Traccar Client</b> (iPhone and Android): Settings → Server URL = the address above. Location accuracy High, frequency 60 seconds.
              </li>
              <li>
                <b>OwnTracks</b>: Mode HTTP, URL = the address above.
              </li>
              <li>
                <b>GPSLogger</b> (Android): Log to custom URL = the address above followed by <code>?lat=%LAT&amp;lon=%LON&amp;acc=%ACC&amp;batt=%BATT</code>
              </li>
              <li>A bought GPS tracker usually reports to its maker&rsquo;s app instead — paste that app&rsquo;s share link into Edit details, and it shows here.</li>
            </ul>
            <p className="xs muted" style={{ margin: 0 }}>
              Anyone with this address can move the {v.name}&rsquo;s pin, so keep it to the crew. WhatsApp&rsquo;s live location can&rsquo;t be read by another app — use one of the
              above for a live pin, or paste a WhatsApp location when someone drops one.
            </p>
            {admin && (
              <div className="row">
                <form action={rotateVehicleToken}>
                  <input type="hidden" name="vehicleId" value={v.id} />
                  <button className="btn btn-sm btn-quiet" type="submit">
                    Make a new address
                  </button>
                </form>
                {trail.length > 0 && (
                  <form action={clearVehiclePositions}>
                    <input type="hidden" name="vehicleId" value={v.id} />
                    <button className="btn btn-sm btn-quiet" type="submit">
                      Clear the location trail
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        </details>
      </section>
    </div>
  );
}
