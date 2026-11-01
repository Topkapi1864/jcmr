import Link from "next/link";
import { JOB_NIGHTS, type JobNight } from "@/db/schema";
import { requireCrew } from "@/lib/auth";
import { asNight, everyonesJobs, NIGHT_DATES, NIGHT_LABELS } from "@/lib/jobs";
import { JobsChecklist } from "@/components/job-check";

export const dynamic = "force-dynamic";

/** Everyone's lists for one night, side by side — the crew chief's check that
 *  everything is done. Admins can tick from here; everyone else can look. */
export default async function EveryonesJobsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireCrew();
  const sp = await searchParams;
  const night: JobNight = asNight(sp.night);
  const showAll = sp.show === "all";
  const { people, cells } = await everyonesJobs();
  const isAdmin = s.role === "admin";

  const rows = people.map((p) => cells.get(`${p.id}:${night}`)!);
  const withLists = rows.filter((r) => r.total > 0);
  const noList = rows.filter((r) => r.total === 0);
  const total = withLists.reduce((n, r) => n + r.total, 0);
  const done = withLists.reduce((n, r) => n + r.done, 0);
  const left = total - done;
  const allDone = withLists.length > 0 && left === 0;

  return (
    <div className="stack">
      <div className="row-between" style={{ alignItems: "start", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h1 style={{ margin: 0 }}>Everyone&apos;s jobs</h1>
          <p className="small muted" style={{ margin: "4px 0 0" }}>
            Each rider&apos;s and crew member&apos;s list for the night, together. {isAdmin ? "You can tick for anyone from here." : "Tick your own on"}{" "}
            {!isAdmin && <Link href="/crew/jobs">My jobs</Link>}
          </p>
        </div>
        <Link className="btn btn-sm" href="/crew/jobs">
          My jobs
        </Link>
      </div>

      <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <div className="seg" role="tablist" aria-label="JobNight">
          {JOB_NIGHTS.map((n) => {
            const rs = people.map((p) => cells.get(`${p.id}:${n}`)!).filter((r) => r.total > 0);
            const t = rs.reduce((a, r) => a + r.total, 0);
            const d = rs.reduce((a, r) => a + r.done, 0);
            return (
              <Link key={n} href={`?night=${n}${showAll ? "&show=all" : ""}`} aria-current={n === night ? "page" : undefined} role="tab">
                {NIGHT_LABELS[n]}
                <span className="xs muted" style={{ marginLeft: 6 }}>
                  {t ? `${d}/${t}` : "—"}
                </span>
              </Link>
            );
          })}
        </div>
        <div className="seg" aria-label="Show">
          <Link href={`?night=${night}`} aria-current={!showAll ? "page" : undefined}>
            Still to do
          </Link>
          <Link href={`?night=${night}&show=all`} aria-current={showAll ? "page" : undefined}>
            Everything
          </Link>
        </div>
      </div>

      <section className="card stack-sm">
        <div className="row-between">
          <h2 style={{ margin: 0 }}>
            {NIGHT_LABELS[night]} <span className="small muted">· {NIGHT_DATES[night]}</span>
          </h2>
          <span className={allDone ? "badge badge-done" : left > 0 ? "badge badge-amber" : "badge"}>
            {withLists.length === 0 ? "No lists yet" : allDone ? "All done ✓" : `${left} still to do`}
          </span>
        </div>
        {total > 0 && (
          <div className="veh-bar veh-bar-lg" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
            <span style={{ width: `${(done / total) * 100}%` }} />
          </div>
        )}
        <p className="small muted" style={{ margin: 0 }}>
          {withLists.length} of {people.length} people have a list · {done} of {total} jobs done
          {noList.length > 0 && (
            <>
              {" "}
              · no list yet: {noList.map((r) => r.person.shortName).join(", ")}
            </>
          )}
        </p>
      </section>

      {withLists.length === 0 ? (
        <p className="muted">Nobody has made a {NIGHT_LABELS[night]} list yet. Each person starts theirs from <Link href="/crew/jobs">My jobs</Link>.</p>
      ) : (
        <div className="jobs-grid">
          {withLists.map((r) => {
            const finished = r.done === r.total;
            return (
              <section key={r.person.id} className="card stack-sm jobs-cell" data-done={finished}>
                <div className="row-between">
                  <h3 style={{ margin: 0 }}>
                    <Link href={`/crew/jobs/${r.person.id}?night=${night}`}>{r.person.shortName}</Link>{" "}
                    <span className="xs muted">{r.person.isRider ? "rider" : r.person.d.crewRole || "crew"}</span>
                  </h3>
                  <span className={finished ? "badge badge-done" : "badge"}>
                    {finished ? "Done ✓" : `${r.done}/${r.total}`}
                  </span>
                </div>
                <div className="veh-bar veh-bar-lg" role="progressbar" aria-valuemin={0} aria-valuemax={r.total} aria-valuenow={r.done}>
                  <span style={{ width: `${(r.done / r.total) * 100}%` }} />
                </div>
                <JobsChecklist jobs={r.jobs} editable={isAdmin || r.person.id === s.pid} me={s.name} prefix={`${r.person.shortName}: `} showBar={false} onlyUnticked={!showAll} compact />
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
