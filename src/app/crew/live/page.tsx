import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, ready, schema } from "@/db/client";
import { PROVIDERS } from "@/db/schema";
import { requireCrew } from "@/lib/auth";
import { fmtWhen } from "@/lib/time";
import { addTrackerLink, postStatus, toggleTrackerLink } from "./actions";

export default async function CrewLivePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireCrew();
  const sp = await searchParams;
  await ready();
  const riders = await db.select().from(schema.riders).orderBy(schema.riders.sortOrder).all();
  const links = await db
    .select({ link: schema.trackerLinks, rider: schema.riders })
    .from(schema.trackerLinks)
    .leftJoin(schema.riders, eq(schema.trackerLinks.riderId, schema.riders.id))
    .orderBy(desc(schema.trackerLinks.id))
    .limit(12)
    .all();
  const statuses = await db.select().from(schema.liveStatus).orderBy(desc(schema.liveStatus.id)).limit(8).all();

  return (
    <div className="stack" style={{ maxWidth: "36rem" }}>
      <h1>Live — the day&rsquo;s links and the status line</h1>
      {sp.posted && <p className="notice">Posted.</p>}
      <p className="small muted">
        What the public sees: <Link href="/live">/live</Link> · the Cricket Club screen: <Link href="/live/tv">/live/tv</Link>
      </p>

      <section className="card stack-sm">
        <h2>Post a status line</h2>
        <form action={postStatus} className="stack-sm">
          <label className="field">
            <span>What&rsquo;s happening (one line)</span>
            <input type="text" name="text" required autoFocus placeholder="All four together, lunch, leaving 14:50" maxLength={200} />
          </label>
          <div className="form-inline">
            <label className="field" style={{ flex: "2 1 10rem" }}>
              <span>Where (optional)</span>
              <input type="text" name="place" placeholder="Market Harborough" maxLength={80} />
            </label>
            <label className="field" style={{ flex: "0 1 8rem" }}>
              <span>Miles done (approx)</span>
              <input type="number" name="mile" min={0} max={400} step={0.5} inputMode="decimal" placeholder={statuses[0]?.mile != null ? String(statuses[0].mile) : "0"} />
            </label>
          </div>
          <p className="xs muted" style={{ margin: 0 }}>The miles figure drives the progress bar on the public page — the stop&rsquo;s mile from the route plan is close enough.</p>
          <button className="btn btn-primary" type="submit" style={{ width: "100%" }}>
            Post as {s.name}
          </button>
        </form>
        {statuses.length > 0 && (
          <ul className="list small muted">
            {statuses.map((st) => (
              <li key={st.id}>
                {fmtWhen(st.postedAt)} · {st.postedBy} · {st.mile != null ? `${st.mile} mi · ` : ""}{st.place ? `${st.place} — ` : ""}
                {st.text}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card stack-sm">
        <h2>Today&rsquo;s live-map link</h2>
        <p className="small muted">Paste the LiveTrack / Wahoo / Beacon link from the rider&rsquo;s phone. Yesterday&rsquo;s links can be switched off below.</p>
        <form action={addTrackerLink} className="stack-sm">
          <label className="field">
            <span>Link</span>
            <input type="url" name="url" required placeholder="https://livetrack.garmin.com/session/…" inputMode="url" />
          </label>
          <div className="form-inline">
            <label className="field">
              <span>Rider</span>
              <select name="riderId" defaultValue="">
                <option value="">—</option>
                {riders.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Provider</span>
              <select name="provider" defaultValue="garmin">
                {PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            <span>Label (optional)</span>
            <input type="text" name="label" placeholder="Gary's Edge" />
          </label>
          <button className="btn btn-primary" type="submit" style={{ width: "100%" }}>
            Save link
          </button>
        </form>
        {links.length > 0 && (
          <ul className="list">
            {links.map(({ link, rider }) => (
              <li key={link.id} className="row-between small">
                <span>
                  {link.active ? "● " : "○ "}
                  {link.label || rider?.displayName || link.provider} · {link.provider} · {fmtWhen(link.createdAt)} · {link.createdBy}
                  <br />
                  <a href={link.url} target="_blank" rel="noopener" className="xs" style={{ wordBreak: "break-all" }}>
                    {link.url}
                  </a>
                </span>
                <form action={toggleTrackerLink}>
                  <input type="hidden" name="id" value={link.id} />
                  <input type="hidden" name="active" value={link.active ? "0" : "1"} />
                  <button className="btn btn-sm" type="submit">
                    {link.active ? "Switch off" : "Switch on"}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
