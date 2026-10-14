import Link from "next/link";
import { db, ready, schema } from "@/db/client";
import { STOP_KINDS } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { gpxExists } from "@/lib/gpx";
import { deleteStop, importRoadbookStops, saveRouteDay, saveStop } from "../actions";

export default async function RouteAdminPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  await ready();
  const days = await db.select().from(schema.routeDays).orderBy(schema.routeDays.day).all();
  const stops = await db.select().from(schema.routeStops).orderBy(schema.routeStops.dayId, schema.routeStops.sortOrder).all();

  return (
    <div className="stack" style={{ maxWidth: "48rem" }}>
      <Link href="/crew/admin" className="small">
        ← Admin
      </Link>
      <h1>Route</h1>
      {sp.saved && <p className="notice">Saved.{sp.imported != null && ` ${sp.imported} stop${sp.imported === "1" ? "" : "s"} added from the roadbook.`}</p>}
      <form action={importRoadbookStops} className="card row-between" style={{ alignItems: "center", gap: "var(--space-3)" }}>
        <span className="small">
          <b>Import Simon&rsquo;s roadbook stops</b> — the six rendezvous points (miles 38 / 76 / 111 and 37 / 73 / 96) and each day&rsquo;s distance and climbing from the GPX. Safe to run again; existing stops are kept.
        </span>
        <button className="btn btn-sm btn-primary" type="submit">
          Import
        </button>
      </form>
      <p className="small">
        Timings live in <Link href="/crew/route">Crew → Route</Link>; saving a plan there fills the planned times below.
      </p>
      <p className="muted small">
        The GPX files live in the repo at <code>content/route/day1.gpx</code> and <code>day2.gpx</code> (Simon&rsquo;s 5 Oct version). Planned times are optional; the
        public page hides the time column until any stop has one.
      </p>
      {days.map((d) => (
        <section key={d.id} className="stack-sm">
          <form action={saveRouteDay} className="card stack-sm">
            <input type="hidden" name="id" value={d.id} />
            <h2>
              Day {d.day} <span className="small muted">— GPX file {gpxExists(d.day) ? "present ✓" : "missing"}</span>
            </h2>
            <label className="field">
              <span>Label</span>
              <input type="text" name="label" defaultValue={d.label} required />
            </label>
            <div className="form-inline">
              <label className="field">
                <span>Start</span>
                <input type="text" name="startLabel" defaultValue={d.startLabel} required />
              </label>
              <label className="field">
                <span>End</span>
                <input type="text" name="endLabel" defaultValue={d.endLabel} required />
              </label>
            </div>
            <div className="form-inline">
              <label className="field">
                <span>Miles</span>
                <input type="number" name="miles" step="0.1" defaultValue={d.miles ?? ""} />
              </label>
              <label className="field">
                <span>Feet of climbing</span>
                <input type="number" name="feet" defaultValue={d.feet ?? ""} />
              </label>
              <label className="field" style={{ flex: "2 1 16rem" }}>
                <span>Strava route URL</span>
                <input type="url" name="stravaUrl" defaultValue={d.stravaUrl ?? ""} />
              </label>
            </div>
            <button className="btn btn-sm btn-primary" type="submit">
              Save day {d.day}
            </button>
          </form>
          <h3>Stops</h3>
          {stops
            .filter((s) => s.dayId === d.id)
            .map((s) => (
              <StopForm key={s.id} dayId={d.id} s={s} />
            ))}
          <StopForm dayId={d.id} />
        </section>
      ))}
    </div>
  );
}

function StopForm({ dayId, s }: { dayId: number; s?: typeof schema.routeStops.$inferSelect }) {
  return (
    <div className="card stack-sm">
      <form action={saveStop} className="form-inline">
        <input type="hidden" name="id" value={s?.id ?? 0} />
        <input type="hidden" name="dayId" value={dayId} />
        <label className="field" style={{ flex: "0 0 4rem" }}>
          <span>Order</span>
          <input type="number" name="sortOrder" defaultValue={s?.sortOrder ?? 50} />
        </label>
        <label className="field" style={{ flex: "2 1 12rem" }}>
          <span>Name</span>
          <input type="text" name="name" defaultValue={s?.name ?? ""} required placeholder={s ? "" : "New stop"} />
        </label>
        <label className="field" style={{ flex: "0 0 5rem" }}>
          <span>Mile</span>
          <input type="number" name="approxMile" step="0.1" defaultValue={s?.approxMile ?? ""} />
        </label>
        <label className="field" style={{ flex: "0 0 7rem" }}>
          <span>Kind</span>
          <select name="kind" defaultValue={s?.kind ?? "short"}>
            {STOP_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ flex: "0 0 6rem" }}>
          <span>Time</span>
          <input type="text" name="plannedTime" defaultValue={s?.plannedTime ?? ""} placeholder="14:30" />
        </label>
        <label className="field" style={{ flex: "2 1 10rem" }}>
          <span>Notes</span>
          <input type="text" name="notes" defaultValue={s?.notes ?? ""} />
        </label>
        <button className="btn btn-sm" type="submit">
          {s ? "Save" : "Add stop"}
        </button>
      </form>
      {s && (
        <form action={deleteStop}>
          <input type="hidden" name="id" value={s.id} />
          <button className="btn btn-sm btn-quiet btn-danger" type="submit">
            Remove
          </button>
        </form>
      )}
    </div>
  );
}
