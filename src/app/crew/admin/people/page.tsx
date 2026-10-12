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
          <span>Role</span>
          <select name="role" defaultValue={p?.role ?? "crew"}>
            <option value="crew">crew</option>
            <option value="admin">admin</option>
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
      {people.map((p) => (
        <PersonForm key={p.id} p={p} />
      ))}
      <h2>Add someone</h2>
      <PersonForm />
    </div>
  );
}
