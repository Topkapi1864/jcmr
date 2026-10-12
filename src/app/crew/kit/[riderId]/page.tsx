import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, ready, schema } from "@/db/client";
import { KIT_CATEGORIES, KIT_CATEGORY_LABELS, KIT_STATUSES, KIT_STATUS_LABELS, KIT_STORAGE, KIT_STORAGE_LABELS, type KitItem } from "@/db/schema";
import { requireCrew } from "@/lib/auth";
import { canEditRider, catalogue, itemsForRider, kitCounts } from "@/lib/kit";
import { fmtWhen } from "@/lib/time";
import { addSuggested, removeKitItem, saveKitItem, setKitStatus } from "../actions";

export const dynamic = "force-dynamic";

function ItemRow({ item, riderId, editable }: { item: KitItem; riderId: number; editable: boolean }) {
  return (
    <li id={`item-${item.id}`} className="item-card" data-status={item.status === "have" ? "done" : undefined} data-stale={item.status === "need" ? "red" : item.status === "ordered" ? "amber" : "none"}>
      <div className="title">
        {item.name} <span className="mono muted">× {item.qty}</span>
      </div>
      <div className="meta">
        <span className={`badge ${item.status === "have" ? "badge-done" : item.status === "ordered" ? "badge-in-progress" : "badge-red"}`}>{KIT_STATUS_LABELS[item.status]}</span>
        <span className="badge">{item.storage ? KIT_STORAGE_LABELS[item.storage] : "no home yet"}</span>
        {item.notes && <span>{item.notes}</span>}
        {item.link && (
          <a href={item.link} target="_blank" rel="noopener" className="xs">
            link ↗
          </a>
        )}
      </div>
      {editable ? (
        <details className="waiting">
          <summary className="small" style={{ cursor: "pointer", minHeight: 32, display: "flex", alignItems: "center" }}>
            Edit
          </summary>
          <form action={saveKitItem} className="stack-sm" style={{ marginTop: 8 }}>
            <input type="hidden" name="riderId" value={riderId} />
            <input type="hidden" name="id" value={item.id} />
            <div className="form-inline">
              <label className="field" style={{ flex: "2 1 12rem" }}>
                <span>Item</span>
                <input type="text" name="name" defaultValue={item.name} required />
              </label>
              <label className="field" style={{ flex: "0 0 5rem" }}>
                <span>How many</span>
                <input type="number" name="qty" defaultValue={item.qty} min={0} inputMode="numeric" />
              </label>
            </div>
            <div className="form-inline">
              <label className="field">
                <span>Status</span>
                <select name="status" defaultValue={item.status}>
                  {KIT_STATUSES.map((k) => (
                    <option key={k} value={k}>
                      {KIT_STATUS_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Where it goes</span>
                <select name="storage" defaultValue={item.storage}>
                  {KIT_STORAGE.map((k) => (
                    <option key={k} value={k}>
                      {KIT_STORAGE_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Category</span>
                <select name="category" defaultValue={item.category}>
                  {KIT_CATEGORIES.map((k) => (
                    <option key={k} value={k}>
                      {KIT_CATEGORY_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="field">
              <span>Note</span>
              <input type="text" name="notes" defaultValue={item.notes} />
            </label>
            <label className="field">
              <span>Link (optional)</span>
              <input type="url" name="link" defaultValue={item.link} placeholder="https://…" />
            </label>
            <div className="row">
              <button className="btn btn-sm btn-primary" type="submit">
                Save
              </button>
              <button className="btn btn-sm btn-quiet btn-danger" type="submit" formAction={removeKitItem}>
                Remove
              </button>
            </div>
          </form>
        </details>
      ) : (
        <div className="waiting xs muted">updated by {item.updatedBy}, {fmtWhen(item.updatedAt)}</div>
      )}
      <div className="side">
        {editable && (
          <form action={setKitStatus} className="row" style={{ justifyContent: "flex-end" }}>
            <input type="hidden" name="riderId" value={riderId} />
            <input type="hidden" name="id" value={item.id} />
            {KIT_STATUSES.filter((k) => k !== item.status).map((k) => (
              <button key={k} className="btn btn-sm" type="submit" name="status" value={k}>
                {k === "have" ? "✓ Have" : KIT_STATUS_LABELS[k]}
              </button>
            ))}
          </form>
        )}
      </div>
    </li>
  );
}

export default async function RiderKitPage({ params, searchParams }: { params: Promise<{ riderId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireCrew();
  const { riderId } = await params;
  const sp = await searchParams;
  await ready();
  const rider = await db.select().from(schema.riders).where(eq(schema.riders.id, Number(riderId))).get();
  if (!rider) notFound();
  const editable = canEditRider(s, rider);
  const items = await itemsForRider(rider.id);
  const c = kitCounts(items);
  const cat = await catalogue();
  const have = new Set(items.map((i) => i.name.toLowerCase()));
  const suggestions = cat.filter((x) => !have.has(x.name.toLowerCase()));
  const showSuggest = sp.suggest === "1";

  return (
    <div className="stack">
      <div>
        <Link href="/crew/kit" className="small">
          ← Kit
        </Link>
      </div>
      <div className="row-between">
        <h2 style={{ margin: 0 }}>{rider.displayName}&rsquo;s kit</h2>
        <div className="counts">
          <span>
            <b>{c.have}</b> have
          </span>
          <span>
            <b>{c.ordered}</b> ordered
          </span>
          <span>
            <b className="red">{c.need}</b> need
          </span>
          <span>
            · <b>{c.unstored}</b> no home yet
          </span>
        </div>
      </div>
      {!editable && <p className="muted small">This is {rider.displayName}&rsquo;s list — only they (or an admin) can change it.</p>}

      {editable && (
        <div className="row">
          <Link className="btn btn-sm" href={showSuggest ? `/crew/kit/${rider.id}` : `/crew/kit/${rider.id}?suggest=1`}>
            {showSuggest ? "Hide suggestions" : `Add from the suggested list (${suggestions.length} not on yours)`}
          </Link>
          <a className="btn btn-sm" href="#add-own">
            + Add your own item
          </a>
        </div>
      )}

      {editable && showSuggest && (
        <form action={addSuggested} className="card stack-sm">
          <input type="hidden" name="riderId" value={rider.id} />
          <div className="row-between">
            <h3 style={{ margin: 0 }}>Suggested items not on your list</h3>
            <button className="btn btn-sm btn-primary" type="submit">
              Add ticked items
            </button>
          </div>
          {KIT_CATEGORIES.map((k) => {
            const rows = suggestions.filter((x) => x.category === k);
            if (!rows.length) return null;
            return (
              <div key={k}>
                <div className="label" style={{ margin: "10px 0 4px" }}>
                  {KIT_CATEGORY_LABELS[k]}
                </div>
                {rows.map((x) => (
                  <label key={x.id} className="row small" style={{ minHeight: 36 }}>
                    <input type="checkbox" name="catalogueId" value={x.id} /> {x.name} <span className="mono muted">× {x.suggestedQty}</span>
                    {x.carriedIn && <span className="badge">{KIT_STORAGE_LABELS[x.carriedIn]}</span>}
                    {x.notes && <span className="muted">— {x.notes}</span>}
                  </label>
                ))}
              </div>
            );
          })}
          <button className="btn btn-sm btn-primary" type="submit">
            Add ticked items
          </button>
        </form>
      )}

      {KIT_CATEGORIES.map((k) => {
        const rows = items.filter((i) => i.category === k);
        if (!rows.length) return null;
        return (
          <section key={k}>
            <h3 className="group-title">
              <span>{KIT_CATEGORY_LABELS[k]}</span>
              <span className="small muted">{rows.length}</span>
            </h3>
            <ul className="list">
              {rows.map((i) => (
                <ItemRow key={i.id} item={i} riderId={rider.id} editable={editable} />
              ))}
            </ul>
          </section>
        );
      })}
      {items.length === 0 && <p className="muted">Nothing on this list yet.</p>}

      {editable && (
        <form id="add-own" action={saveKitItem} className="card stack-sm">
          <input type="hidden" name="riderId" value={rider.id} />
          <h3>Add your own item</h3>
          <div className="form-inline">
            <label className="field" style={{ flex: "2 1 12rem" }}>
              <span>Item</span>
              <input type="text" name="name" required placeholder="Spare brake pads" />
            </label>
            <label className="field" style={{ flex: "0 0 5rem" }}>
              <span>How many</span>
              <input type="number" name="qty" defaultValue={1} min={0} inputMode="numeric" />
            </label>
          </div>
          <div className="form-inline">
            <label className="field">
              <span>Status</span>
              <select name="status" defaultValue="need">
                {KIT_STATUSES.map((k) => (
                  <option key={k} value={k}>
                    {KIT_STATUS_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Where it goes</span>
              <select name="storage" defaultValue="">
                {KIT_STORAGE.map((k) => (
                  <option key={k} value={k}>
                    {KIT_STORAGE_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Category</span>
              <select name="category" defaultValue="other">
                {KIT_CATEGORIES.map((k) => (
                  <option key={k} value={k}>
                    {KIT_CATEGORY_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            <span>Note (optional)</span>
            <input type="text" name="notes" />
          </label>
          <label className="field">
            <span>Link (optional)</span>
            <input type="url" name="link" placeholder="https://…" />
          </label>
          <button className="btn btn-primary" type="submit">
            Add to my list
          </button>
        </form>
      )}
    </div>
  );
}
