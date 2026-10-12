import Link from "next/link";
import { db, ready, schema } from "@/db/client";
import { requireAdmin } from "@/lib/auth";
import { deleteLink, saveLink } from "../actions";

export default async function LinksPage() {
  await requireAdmin();
  await ready();
  const links = await db.select().from(schema.links).orderBy(schema.links.sortOrder, schema.links.id).all();
  return (
    <div className="stack" style={{ maxWidth: "44rem" }}>
      <Link href="/crew/admin" className="small">
        ← Admin
      </Link>
      <h1>Links</h1>
      <p className="muted small">Shown at the foot of the crew board. Links only — the site stores no documents.</p>
      {links.map((l) => (
        <div key={l.id} className="card stack-sm">
          <form action={saveLink} className="form-inline">
            <input type="hidden" name="id" value={l.id} />
            <label className="field">
              <span>Label</span>
              <input type="text" name="label" defaultValue={l.label} required />
            </label>
            <label className="field" style={{ flex: "2 1 16rem" }}>
              <span>URL</span>
              <input type="url" name="url" defaultValue={l.url} placeholder="https://…" />
            </label>
            <label className="field" style={{ flex: "0 0 5rem" }}>
              <span>Sort</span>
              <input type="number" name="sortOrder" defaultValue={l.sortOrder} />
            </label>
            <button className="btn btn-sm" type="submit">
              Save
            </button>
          </form>
          <form action={deleteLink}>
            <input type="hidden" name="id" value={l.id} />
            <button className="btn btn-sm btn-quiet btn-danger" type="submit">
              Remove
            </button>
          </form>
        </div>
      ))}
      <h2>Add a link</h2>
      <form action={saveLink} className="card form-inline">
        <input type="hidden" name="id" value={0} />
        <label className="field">
          <span>Label</span>
          <input type="text" name="label" required />
        </label>
        <label className="field" style={{ flex: "2 1 16rem" }}>
          <span>URL</span>
          <input type="url" name="url" placeholder="https://…" />
        </label>
        <label className="field" style={{ flex: "0 0 5rem" }}>
          <span>Sort</span>
          <input type="number" name="sortOrder" defaultValue={links.length} />
        </label>
        <button className="btn btn-sm btn-primary" type="submit">
          Add
        </button>
      </form>
    </div>
  );
}
