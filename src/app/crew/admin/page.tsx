import Link from "next/link";
import { desc } from "drizzle-orm";
import { db, ready, schema } from "@/db/client";
import { requireAdmin } from "@/lib/auth";
import { getAllSettings, isPublicLive } from "@/lib/settings";
import { fmtWhen } from "@/lib/time";
import { refreshDonateTotal, revokeReadToken, rotateReadToken, saveSettings, setPublicLive } from "./actions";

export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const settings = await getAllSettings();
  const live = await isPublicLive();
  const envOverride = process.env.PUBLIC_LIVE === "true" || process.env.PUBLIC_LIVE === "false";
  await ready();
  const log = await db.select().from(schema.audit).orderBy(desc(schema.audit.id)).limit(40).all();
  const riders = await db.select().from(schema.riders).orderBy(schema.riders.sortOrder).all();
  const cached = settings["donate.total_cached"] ? (JSON.parse(settings["donate.total_cached"]) as { amount: number }) : null;

  return (
    <div className="stack" style={{ maxWidth: "44rem" }}>
      <h1>Admin</h1>
      <nav className="row">
        <Link className="btn btn-sm" href="/crew/admin/people">
          People
        </Link>
        <Link className="btn btn-sm" href="/crew/admin/links">
          Links
        </Link>
        <Link className="btn btn-sm" href="/crew/admin/content">
          Content
        </Link>
        <Link className="btn btn-sm" href="/crew/admin/route">
          Route
        </Link>
        <Link className="btn btn-sm" href="/crew/admin/import">
          Import CSV
        </Link>
        <a className="btn btn-sm" href="/crew/admin/board.csv">
          Download board as CSV
        </a>
        <a className="btn btn-sm" href="/crew/admin/backup.json">
          Download full backup
        </a>
      </nav>
      {sp.saved && <p className="notice">Saved.</p>}
      {sp.refreshed === "1" && <p className="notice">Total refreshed from JustGiving.</p>}
      {sp.refreshed === "0" && <p className="error">Could not read the total from JustGiving just now. The cached figure stands; type an override if you need the number on screen.</p>}

      <section className="card stack-sm">
        <h2>The dark switch</h2>
        <p>
          The public site is <b>{live ? "LIVE — the world can see it" : "dark — the world sees the holding page"}</b>.
          {envOverride && <span className="muted"> (Fixed by the PUBLIC_LIVE environment variable; the switch below has no effect until it is removed.)</span>}
        </p>
        <form action={setPublicLive} className="row">
          <input type="hidden" name="live" value={live ? "false" : "true"} />
          <button className={`btn ${live ? "btn-danger" : "btn-primary"}`} type="submit" disabled={envOverride}>
            {live ? "Switch OFF — back to the holding page" : "Switch ON — announce the site"}
          </button>
          <Link href="/" className="small">
            Preview the public pages
          </Link>
        </form>
      </section>

      <section className="card stack-sm">
        <h2>Fiona&rsquo;s read door</h2>
        {sp.token ? (
          <div className="notice stack-sm">
            <p>
              <b>New token — shown once.</b> Give Fiona these URLs:
            </p>
            <code style={{ wordBreak: "break-all" }}>/api/board/{sp.token}.json</code>
            <code style={{ wordBreak: "break-all" }}>/api/board/{sp.token}.csv</code>
          </div>
        ) : (
          <p className="muted">{settings["read_door.token_hash"] ? "A token is set." : "No token yet — the door is closed."}</p>
        )}
        <div className="row">
          <form action={rotateReadToken}>
            <button className="btn" type="submit">
              {settings["read_door.token_hash"] ? "Rotate token" : "Create token"}
            </button>
          </form>
          {settings["read_door.token_hash"] && (
            <form action={revokeReadToken}>
              <button className="btn btn-danger" type="submit">
                Revoke
              </button>
            </form>
          )}
        </div>
      </section>

      <section className="card stack-sm">
        <h2>Settings</h2>
        <form action={saveSettings} className="stack-sm">
          <label className="field">
            <span>Strapline (home page)</span>
            <input type="text" name="site.strapline" defaultValue={settings["site.strapline"]} />
          </label>
          <label className="field">
            <span>Start label on the route page (open question 6)</span>
            <input type="text" name="route.start_label" defaultValue={settings["route.start_label"]} />
          </label>
          <div className="form-inline">
            <label className="field">
              <span>Tracker mode</span>
              <select name="tracker.mode" defaultValue={settings["tracker.mode"]}>
                <option value="single">single — one feed, the others as buttons</option>
                <option value="all">all — four buttons</option>
              </select>
            </label>
            <label className="field">
              <span>Primary rider (single mode)</span>
              <select name="tracker.primary_rider" defaultValue={settings["tracker.primary_rider"]}>
                <option value="">—</option>
                {riders.map((r) => (
                  <option key={r.id} value={String(r.id)}>
                    {r.displayName}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            <span>Donate total override (whole pounds; blank = use the fetched figure)</span>
            <input type="text" name="donate.total_override" defaultValue={settings["donate.total_override"]} inputMode="numeric" />
          </label>
          <p className="small muted">
            Fetched total: {cached ? `£${cached.amount.toLocaleString("en-GB")}` : "none yet"}
            {settings["donate.total_cached_at"] && ` at ${fmtWhen(settings["donate.total_cached_at"])}`} · Embed verdict: {settings["donate.embed_verdict"] || "not tested"}
          </p>
          <button className="btn btn-primary" type="submit">
            Save settings
          </button>
        </form>
        <form action={refreshDonateTotal}>
          <button className="btn btn-sm" type="submit">
            Refresh total from JustGiving now
          </button>
        </form>
      </section>

      <section className="stack-sm">
        <h2>Journal</h2>
        <ul className="list history">
          {log.map((e) => (
            <li key={e.id}>
              {fmtWhen(e.at)} · {e.actor} · {e.action}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
