import Link from "next/link";
import { notFound } from "next/navigation";
import { AGREED, AGREED_LABELS, CREW_ROLE_SUGGESTIONS } from "@/db/schema";
import { requireCrew } from "@/lib/auth";
import { ageOnRide, canEditMember, crewMember } from "@/lib/people";
import { fmtWhen } from "@/lib/time";
import { saveCrewDetails } from "../actions";

export const dynamic = "force-dynamic";

function Row({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="row-between" style={{ padding: "6px 0", borderTop: "1px solid var(--color-border)", gap: 12 }}>
      <span className="label">{label}</span>
      <span className={mono ? "mono" : undefined} style={{ textAlign: "right", whiteSpace: "pre-wrap" }}>
        {value || <span className="muted">—</span>}
      </span>
    </div>
  );
}

export default async function PersonPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireCrew();
  const { id } = await params;
  const sp = await searchParams;
  const p = await crewMember(Number(id));
  if (!p) notFound();
  const editable = canEditMember(s, p.id);
  const d = p.d;
  const age = ageOnRide(d.dob);

  return (
    <div className="stack" style={{ maxWidth: "44rem" }}>
      <div>
        <Link href="/crew/people" className="small">
          ← Crew
        </Link>
      </div>
      <div className="row-between">
        <h2 style={{ margin: 0 }}>{p.name}</h2>
        <span className="small muted">{d.updatedAt ? `updated by ${d.updatedBy}, ${fmtWhen(d.updatedAt)}` : "nothing filled in yet"}</span>
      </div>
      {sp.saved && <p className="notice">Saved.</p>}

      <section className="card">
        <Row label="Role on the ride" value={d.crewRole} />
        <Row label="Agreed to be crew" value={AGREED_LABELS[d.agreed]} />
        <Row label="Briefed on the role" value={d.briefed ? "Yes" : "Not yet"} />
        <Row label="With us" value={d.availability} />
        <Row label="Mobile" value={d.mobile} mono />
        <Row label="Email" value={p.email} mono />
        <Row label="Date of birth" value={d.dob ? `${d.dob}${age !== null ? ` (${age} on the day)` : ""}` : ""} mono />
        <Row label="First aid" value={d.firstAid} />
        <Row label="Skills" value={d.skills} />
        <Row label="Vehicle" value={d.vehicle} />
        <Row label="Dietary" value={d.dietary} />
        <Row label="Emergency contact" value={[d.emergencyName, d.emergencyPhone].filter(Boolean).join(" · ")} />
        <Row label="Other" value={d.notes} />
      </section>

      {editable ? (
        <form action={saveCrewDetails} className="card stack-sm">
          <input type="hidden" name="personId" value={p.id} />
          <h3>{p.id === s.pid ? "Your details" : `Edit ${p.shortName}'s details`}</h3>
          <div className="form-inline">
            <label className="field" style={{ flex: "2 1 14rem" }}>
              <span>Role on the ride</span>
              <input type="text" name="crewRole" list="crew-roles" defaultValue={d.crewRole} placeholder="Leapfrog car driver" />
              <datalist id="crew-roles">
                {CREW_ROLE_SUGGESTIONS.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </label>
            <label className="field" style={{ flex: "1 1 10rem" }}>
              <span>Agreed to be crew</span>
              <select name="agreed" defaultValue={d.agreed}>
                {AGREED.map((a) => (
                  <option key={a} value={a}>
                    {AGREED_LABELS[a]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="row small">
            <input type="checkbox" name="briefed" defaultChecked={d.briefed} /> briefed on the role
          </label>
          <label className="field">
            <span>Which days are you with us?</span>
            <input type="text" name="availability" defaultValue={d.availability} placeholder="Fri evening to Sunday · Saturday only · finish in Yeadon" />
          </label>
          <div className="form-inline">
            <label className="field">
              <span>Mobile</span>
              <input type="tel" name="mobile" defaultValue={d.mobile} autoComplete="tel" placeholder="07…" />
            </label>
            <label className="field">
              <span>Email</span>
              <input type="email" name="email" defaultValue={p.email ?? ""} autoComplete="email" />
            </label>
            <label className="field" style={{ flex: "0 1 11rem" }}>
              <span>Date of birth</span>
              <input type="date" name="dob" defaultValue={d.dob} />
            </label>
          </div>
          <div className="form-inline">
            <label className="field">
              <span>First aid (cert and expiry)</span>
              <input type="text" name="firstAid" defaultValue={d.firstAid} placeholder="EFAW, expires Mar 2027 · none" />
            </label>
            <label className="field">
              <span>Vehicle you're bringing</span>
              <input type="text" name="vehicle" defaultValue={d.vehicle} placeholder="Estate with bike rack · none" />
            </label>
          </div>
          <label className="field">
            <span>Relevant skills</span>
            <input type="text" name="skills" defaultValue={d.skills} placeholder="Bike mechanic, drives a motorhome, photography, nurse…" />
          </label>
          <label className="field">
            <span>Dietary</span>
            <input type="text" name="dietary" defaultValue={d.dietary} placeholder="Vegetarian · nut allergy · none" />
          </label>
          <div className="form-inline">
            <label className="field">
              <span>Emergency contact — name</span>
              <input type="text" name="emergencyName" defaultValue={d.emergencyName} />
            </label>
            <label className="field">
              <span>Emergency contact — phone</span>
              <input type="tel" name="emergencyPhone" defaultValue={d.emergencyPhone} />
            </label>
          </div>
          <label className="field">
            <span>Anything else we should know</span>
            <textarea name="notes" defaultValue={d.notes} rows={3} />
          </label>
          <div>
            <button className="btn btn-primary" type="submit">
              Save
            </button>
          </div>
        </form>
      ) : (
        <p className="muted small">Only {p.shortName} (or an admin) can change these details.</p>
      )}
    </div>
  );
}
