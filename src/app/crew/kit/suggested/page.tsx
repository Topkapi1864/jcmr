import Link from "next/link";
import { KIT_CATEGORIES, KIT_CATEGORY_LABELS, KIT_STORAGE, KIT_STORAGE_LABELS, type KitCatalogueRow } from "@/db/schema";
import { requireCrew } from "@/lib/auth";
import { catalogue, riderForPerson } from "@/lib/kit";
import { saveSuggested } from "../actions";
import { KitImportForm } from "./import-form";

export const dynamic = "force-dynamic";

function RowForm({ r }: { r?: KitCatalogueRow }) {
  return (
    <form action={saveSuggested} className="form-inline" style={{ padding: "8px 0", borderTop: "1px solid var(--color-border)" }}>
      <input type="hidden" name="id" value={r?.id ?? 0} />
      <label className="field" style={{ flex: "2 1 12rem" }}>
        <span>Item</span>
        <input type="text" name="name" defaultValue={r?.name ?? ""} required placeholder={r ? "" : "New suggested item"} />
      </label>
      <label className="field" style={{ flex: "0 0 4.5rem" }}>
        <span>Qty</span>
        <input type="number" name="qty" defaultValue={r?.suggestedQty ?? 1} min={0} />
      </label>
      <label className="field" style={{ flex: "0 0 9rem" }}>
        <span>Category</span>
        <select name="category" defaultValue={r?.category ?? "other"}>
          {KIT_CATEGORIES.map((k) => (
            <option key={k} value={k}>
              {KIT_CATEGORY_LABELS[k]}
            </option>
          ))}
        </select>
      </label>
      <label className="field" style={{ flex: "0 0 9rem" }}>
        <span>Usually goes</span>
        <select name="carriedIn" defaultValue={r?.carriedIn ?? ""}>
          {KIT_STORAGE.map((k) => (
            <option key={k} value={k}>
              {KIT_STORAGE_LABELS[k]}
            </option>
          ))}
        </select>
      </label>
      <label className="field" style={{ flex: "2 1 10rem" }}>
        <span>Note</span>
        <input type="text" name="notes" defaultValue={r?.notes ?? ""} />
      </label>
      <label className="field" style={{ flex: "1 1 7rem" }}>
        <span>Source</span>
        <input type="text" name="source" defaultValue={r?.source ?? ""} placeholder="Zwiff 10 Oct" />
      </label>
      {r && (
        <label className="field" style={{ flex: "0 0 auto" }}>
          <span>Shown</span>
          <select name="active" defaultValue={r.active ? "on" : "off"}>
            <option value="on">yes</option>
            <option value="off">retired</option>
          </select>
        </label>
      )}
      <button className="btn btn-sm" type="submit">
        {r ? "Save" : "Add"}
      </button>
    </form>
  );
}

export default async function SuggestedPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireCrew();
  const sp = await searchParams;
  const admin = s.role === "admin";
  const rows = await catalogue(admin);
  const mine = await riderForPerson(s.pid);

  return (
    <div className="stack">
      <div>
        <Link href="/crew/kit" className="small">
          ← Kit
        </Link>
      </div>
      <div className="row-between">
        <h2 style={{ margin: 0 }}>Suggested kit list</h2>
        {mine && (
          <Link className="btn btn-sm btn-primary" href={`/crew/kit/${mine.id}?suggest=1`}>
            Add items to my list
          </Link>
        )}
      </div>
      <p className="muted small">
        {rows.filter((r) => r.active).length} items. Riders add from here to their own lists.
        {admin ? " Admins edit in place, add at the foot, or import a CSV (Fiona's route for things mentioned in the groups)." : ""}
      </p>
      {sp.saved && <p className="notice">Saved.</p>}

      {KIT_CATEGORIES.map((k) => {
        const g = rows.filter((r) => r.category === k);
        if (!g.length) return null;
        return (
          <section key={k}>
            <h3 className="group-title">
              <span>{KIT_CATEGORY_LABELS[k]}</span>
              <span className="small muted">{g.length}</span>
            </h3>
            {admin ? (
              g.map((r) => <RowForm key={r.id} r={r} />)
            ) : (
              <ul className="list">
                {g.map((r) => (
                  <li key={r.id} className="item-card">
                    <div className="title">
                      {r.name} <span className="mono muted">× {r.suggestedQty}</span>
                    </div>
                    <div className="meta">
                      {r.carriedIn && <span className="badge">{KIT_STORAGE_LABELS[r.carriedIn]}</span>}
                      {r.notes && <span>{r.notes}</span>}
                      {r.source && <span className="faint">· {r.source}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      {admin && (
        <>
          <section className="card">
            <h3>Add a suggested item</h3>
            <RowForm />
          </section>
          <section className="card stack-sm">
            <h3>Import CSV</h3>
            <p className="muted small">
              Suggested list: <code>name,category,qty,carried_in,notes,source</code> — categories {KIT_CATEGORIES.join(" · ")}; carried_in one of{" "}
              {KIT_STORAGE.filter(Boolean).join(" · ")}. Re-running updates by name. Riders&rsquo; lists:{" "}
              <code>rider,name,category,qty,status,storage,notes,link</code> (status need / ordered / have).
            </p>
            <KitImportForm />
          </section>
        </>
      )}
    </div>
  );
}
