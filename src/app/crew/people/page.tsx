import Link from "next/link";
import { AGREED, AGREED_LABELS } from "@/db/schema";
import { requireCrew } from "@/lib/auth";
import { crewMembers } from "@/lib/people";
import { quickCrewFlag } from "./actions";

export const dynamic = "force-dynamic";

function agreedBadge(a: string) {
  const cls = a === "yes" ? "badge-done" : a === "asked" ? "badge-in-progress" : a === "no" ? "badge-red" : "";
  return <span className={`badge ${cls}`}>{AGREED_LABELS[a as keyof typeof AGREED_LABELS] ?? a}</span>;
}

export default async function PeopleRoster() {
  const s = await requireCrew();
  const admin = s.role === "admin";
  const crew = await crewMembers();
  const support = crew.filter((p) => !p.isRider);
  const inCount = support.filter((p) => p.d.agreed === "yes").length;
  const briefed = support.filter((p) => p.d.briefed).length;
  const noMobile = crew.filter((p) => !p.d.mobile).length;

  return (
    <div className="stack">
      <div className="row-between">
        <h2 style={{ margin: 0 }}>Crew</h2>
        <div className="row">
          <Link className="btn btn-sm" href="/crew/sleeping">
            Sleeping
          </Link>
          <Link className="btn btn-sm btn-primary" href={`/crew/people/${s.pid}`}>
            My details
          </Link>
        </div>
      </div>
      <p className="muted small">
        The four riders and everyone supporting them. Riders aren&rsquo;t crew, so the crew questions don&rsquo;t apply to them. Tap a name for the full details — mobile, email, date of birth, skills, first aid, emergency contact. You
        can edit your own; admins can edit anyone&rsquo;s. Everything here is one record per person, so a change shows everywhere.
      </p>
      <div className="counts">
        <span>
          <b>{crew.length - support.length}</b> riders
        </span>
        <span>
          <b>{inCount}</b> of {support.length} crew confirmed
        </span>
        <span>
          <b>{briefed}</b> briefed
        </span>
        {noMobile > 0 && (
          <span>
            · <b className="red">{noMobile}</b> without a mobile number
          </span>
        )}
      </div>

      <div className="table-wrap">
        <table className="table" style={{ minWidth: 720 }}>
          <thead>
            <tr>
              <th>Who</th>
              <th>Role on the ride</th>
              <th>Agreed to be crew</th>
              <th>Briefed</th>
              <th>Mobile</th>
              <th>First aid</th>
            </tr>
          </thead>
          <tbody>
            {crew.map((p) => (
              <tr key={p.id} id={`p-${p.id}`} style={p.id === s.pid ? { background: "var(--color-bg-sunken)" } : undefined}>
                <td>
                  <Link href={`/crew/people/${p.id}`}>
                    <b>{p.name}</b>
                  </Link>
                  {p.d.availability && <div className="xs muted">{p.d.availability}</div>}
                </td>
                <td>{p.isRider ? <span className="badge">Rider</span> : p.d.crewRole || <span className="muted">—</span>}</td>
                <td>
                  {p.isRider ? <span className="muted">n/a</span> : agreedBadge(p.d.agreed)}
                  {admin && !p.isRider && p.d.agreed !== "yes" && (
                    <form action={quickCrewFlag} style={{ display: "inline", marginLeft: 6 }}>
                      <input type="hidden" name="personId" value={p.id} />
                      <input type="hidden" name="field" value="agreed" />
                      {AGREED.filter((a) => a !== p.d.agreed && a !== "unknown").map((a) => (
                        <button key={a} className="btn btn-sm btn-quiet" type="submit" name="value" value={a} title={AGREED_LABELS[a]}>
                          {a === "yes" ? "✓ in" : a === "asked" ? "asked" : "out"}
                        </button>
                      ))}
                    </form>
                  )}
                </td>
                <td>
                  {p.isRider ? <span className="muted">n/a</span> : p.d.briefed ? <span className="badge badge-done">Briefed</span> : <span className="muted">not yet</span>}
                  {admin && !p.isRider && (
                    <form action={quickCrewFlag} style={{ display: "inline", marginLeft: 6 }}>
                      <input type="hidden" name="personId" value={p.id} />
                      <input type="hidden" name="field" value="briefed" />
                      <button className="btn btn-sm btn-quiet" type="submit" name="value" value={p.d.briefed ? "0" : "1"}>
                        {p.d.briefed ? "undo" : "✓ briefed"}
                      </button>
                    </form>
                  )}
                </td>
                <td className="mono">{p.d.mobile ? <a href={`tel:${p.d.mobile.replace(/\s+/g, "")}`}>{p.d.mobile}</a> : <span className="red">?</span>}</td>
                <td>{p.d.firstAid || <span className="muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {admin && (
        <p className="muted small">
          Add or remove people, or change who is an admin, in <Link href="/crew/admin/people">Admin → People</Link>.
        </p>
      )}
    </div>
  );
}
