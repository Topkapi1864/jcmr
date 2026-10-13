import Link from "next/link";
import { db, ready, schema } from "@/db/client";
import { requireAdmin } from "@/lib/auth";
import { savePerson } from "../actions";
import type { Person } from "@/db/schema";

function PersonForm({ p }: { p?: Person }) {
  return (
    <form action={savePerson} className="card stack-sm">
      <input type="hidden" name="id" value={p?.id ?? 0} />
      <div className="form-inline">
        <label className="field">
          <span>Full name</span>
          <input type="text" name="name" defaultValue={p?.name ?? ""} required />
        </label>
        <label className="field">
          <span>Short name (shown on the board; must match the CSV)</span>
          <input type="text" name="shortName" defaultValue={p?.shortName ?? ""} required />
        </label>
      </div>
      <div className="form-inline">
        <label className="field">
          <span>Site access (not their role on the ride)</span>
          <select name="role" defaultValue={p?.role ?? "crew"}>
            <option value="crew">member — sign in, board, own details</option>
            <option value="admin">admin — settings, everyone&rsquo;s details</option>
          </select>
        </label>
        <label className="field">
          <span>Email (optional; never shown)</span>
          <input type="email" name="email" defaultValue={p?.email ?? ""} />
        </label>
        <label className="field">
          <span>Sort</span>
          <input type="number" name="sortOrder" defaultValue={p?.sortOrder ?? 100} />
        </label>
      </div>
      <label className="row small">
        <input type="checkbox" name="active" defaultChecked={p ? p.active : true} /> active (appears on the sign-in list)
      </label>
      <button className="btn btn-sm btn-primary" type="submit">
        {p ? "Save" : "Add person"}
      </button>
    </form>
  );
}

export default async function PeoplePage() {
  await requireAdmin();
  await ready();
  const people = await db.select().from(schema.people).orderBy(schema.people.sortOrder, schema.people.shortName).all();
  return (
    <div className="stack" style={{ maxWidth: "44rem" }}>
      <Link href="/crew/admin" className="small">
        ← Admin
      </Link>
      <h1>People</h1>
      <p className="muted small">
        Who can sign in and what they can change. Admins: {people.filter((p) => p.role === "admin").map((p) => p.shortName).join(", ")}. Everyone else is a member.
        Roles on the ride (rider, driver, first aider…) live in <Link href="/crew/people">Crew</Link>, not here.
      </p>
      {people.map((p) => (
        <PersonForm key={p.id} p={p} />
      ))}
      <h2>Add someone</h2>
      <PersonForm />
    </div>
  );
}
