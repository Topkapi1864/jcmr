import Link from "next/link";
import { JOB_NIGHTS, type JobNight } from "@/db/schema";
import type { Session } from "@/lib/session";
import { canEditJobs, jobsFor, NIGHT_DATES, NIGHT_LABELS, STANDARD_JOBS } from "@/lib/jobs";
import { crewMembers, type CrewMember } from "@/lib/people";
import { possessive } from "@/lib/util";
import { JobsChecklist } from "@/components/job-check";
import { PersonPicker } from "@/components/person-picker";
import { addJobs, addStandardJobs, copyNightJobs, resetNightJobs, saveJobItem } from "@/app/crew/jobs/actions";

/** One person's job lists for both nights, with the picked night open. */
export async function JobsList({ s, who, night, sp }: { s: Session; who: CrewMember; night: JobNight; sp: Record<string, string | undefined> }) {
  const all = await jobsFor(who.id);
  const jobs = all.filter((j) => j.night === night);
  const done = jobs.filter((j) => j.checked).length;
  const other: JobNight = night === "fri" ? "sat" : "fri";
  const otherCount = all.filter((j) => j.night === other).length;
  const mine = who.id === s.pid;
  const editable = canEditJobs(s, who.id);
  const people = await crewMembers();
  const standard = STANDARD_JOBS[who.isRider ? "rider" : "crew"];
  const notice = sp.added
    ? Number(sp.added) > 0
      ? `Added ${sp.added}.`
      : "Nothing new to add — everything on that list is already here."
    : sp.saved
      ? "Saved."
      : sp.deleted
        ? "Deleted."
        : sp.reset
          ? "All unticked."
          : null;

  return (
    <div className="stack" style={{ maxWidth: "40rem" }}>
      <div className="row-between" style={{ alignItems: "start", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h1 style={{ margin: 0 }}>{mine ? "My jobs" : `${possessive(who.shortName)} jobs`}</h1>
          <p className="small muted" style={{ margin: "4px 0 0" }}>
            What to get done the night before each day. Tick as you go; the crew chief sees everyone&apos;s lists on <Link href="/crew/jobs/everyone">Everyone</Link>.
          </p>
        </div>
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          <Link className="btn btn-sm" href="/crew/jobs/everyone">
            Everyone
          </Link>
          <PersonPicker people={people.map((p) => ({ id: p.id, label: `${p.shortName}${p.isRider ? " (rider)" : ""}` }))} current={who.id} night={night} />
        </div>
      </div>

      <div className="seg" role="tablist" aria-label="JobNight">
        {JOB_NIGHTS.map((n) => {
          const count = all.filter((j) => j.night === n).length;
          const ticked = all.filter((j) => j.night === n && j.checked).length;
          return (
            <Link key={n} href={`?night=${n}`} aria-current={n === night ? "page" : undefined} role="tab">
              {NIGHT_LABELS[n]}
              <span className="xs muted" style={{ marginLeft: 6 }}>
                {count ? `${ticked}/${count}` : "—"}
              </span>
            </Link>
          );
        })}
      </div>

      {notice && <p className="notice">{notice}</p>}
      {sp.denied && <p className="error">That list is not yours to change.</p>}

      <section className="stack-sm">
        <div className="row-between">
          <h2 style={{ margin: 0 }}>
            {NIGHT_LABELS[night]} <span className="small muted">· {NIGHT_DATES[night]}</span>
          </h2>
        </div>
        {jobs.length === 0 ? (
          <div className="card stack-sm">
            <p className="muted" style={{ margin: 0 }}>
              Nothing on the list yet.
            </p>
            {editable && (
              <>
                <form action={addStandardJobs}>
                  <input type="hidden" name="personId" value={who.id} />
                  <input type="hidden" name="night" value={night} />
                  <button className="btn btn-primary" type="submit">
                    Start with the usual {who.isRider ? "rider" : "crew"} list ({standard.length} jobs)
                  </button>
                </form>
                <details>
                  <summary className="small muted">What is on it</summary>
                  <ul className="small" style={{ margin: "6px 0 0", paddingLeft: "1.2em" }}>
                    {standard.map((j) => (
                      <li key={j}>{j}</li>
                    ))}
                  </ul>
                </details>
                {otherCount > 0 && (
                  <form action={copyNightJobs}>
                    <input type="hidden" name="personId" value={who.id} />
                    <input type="hidden" name="night" value={other} />
                    <button className="btn btn-sm" type="submit">
                      Copy the {NIGHT_LABELS[other]} list here ({otherCount})
                    </button>
                  </form>
                )}
              </>
            )}
          </div>
        ) : (
          <JobsChecklist jobs={jobs} editable={editable} me={s.name} />
        )}
      </section>

      {editable && (
        <section className="stack-sm">
          <form action={addJobs} className="card stack-sm">
            <input type="hidden" name="personId" value={who.id} />
            <input type="hidden" name="night" value={night} />
            <label className="field">
              <span>Add jobs — one per line</span>
              <textarea name="lines" rows={3} placeholder={"Charge lights\nCharge cycling computer\nPump tyres — 90 psi"} required />
            </label>
            <p className="xs muted" style={{ margin: 0 }}>
              A dash after the job keeps a note with it. Jobs already on the list are skipped.
            </p>
            <button className="btn btn-primary" type="submit">
              Add to {NIGHT_LABELS[night]}
            </button>
          </form>
          {jobs.length > 0 && (
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              <form action={addStandardJobs}>
                <input type="hidden" name="personId" value={who.id} />
                <input type="hidden" name="night" value={night} />
                <button className="btn btn-sm" type="submit">
                  Add the usual {who.isRider ? "rider" : "crew"} list
                </button>
              </form>
              <form action={copyNightJobs}>
                <input type="hidden" name="personId" value={who.id} />
                <input type="hidden" name="night" value={night} />
                <button className="btn btn-sm" type="submit">
                  Copy to {NIGHT_LABELS[other]}
                </button>
              </form>
              {done > 0 && (
                <form action={resetNightJobs}>
                  <input type="hidden" name="personId" value={who.id} />
                  <input type="hidden" name="night" value={night} />
                  <button className="btn btn-sm btn-quiet" type="submit">
                    Untick all
                  </button>
                </form>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
