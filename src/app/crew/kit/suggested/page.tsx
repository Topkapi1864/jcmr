import Link from "next/link";
import { KIT_CATEGORIES, KIT_CATEGORY_LABELS, KIT_STORAGE, KIT_STORAGE_LABELS, type KitCatalogueRow } from "@/db/schema";
import { requireCrew } from "@/lib/auth";
import { allItems, catalogue, linksForCatalogue, riderForPerson, riderOnlySuggestions, ridersWithPeople } from "@/lib/kit";
import { KitSuggested, type SuggestionRow } from "@/components/kit-suggested";
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
      <label className="field" style={{ flex: "2 1 12rem" }}>
        <span>Link(s)</span>
        <input type="text" name="link" defaultValue={r?.link ?? ""} placeholder="https://… (several: separate with spaces)" />
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
  const editing = admin && sp.edit === "1";
  const rows = await catalogue(editing);
  const mine = await riderForPerson(s.pid);
  const riders = await ridersWithPeople();
  const items = await allItems();
  const links = await linksForCatalogue(rows);
  const extra = editing ? [] : await riderOnlySuggestions(rows);

  const statusFor = (riderId: number, name: string) => items.find((i) => i.riderId === riderId && i.name.toLowerCase() === name.toLowerCase())?.status ?? null;
  const ridersFor = (name: string) => riders.map((r) => ({ name: r.displayName.split(" ")[0], status: statusFor(r.id, name) }));
  const order = new Map<string, number>(KIT_CATEGORIES.map((k, i) => [k, i]));

  const table: SuggestionRow[] = [
    ...rows.map((r) => ({
      key: `c${r.id}`,
      ref: { catalogueId: r.id },
      name: r.name,
      category: r.category,
      qty: r.suggestedQty,
      storage: r.carriedIn ? KIT_STORAGE_LABELS[r.carriedIn] : "",
      notes: r.notes,
      source: r.source,
      links: links.get(r.id) ?? [],
      riders: ridersFor(r.name),
      mine: mine ? statusFor(mine.id, r.name) : null,
    })),
    ...extra.map((x) => ({
      key: `i${x.itemId}`,
      ref: { itemId: x.itemId },
      name: x.name,
      category: x.category,
      qty: x.qty,
      storage: x.storage ? KIT_STORAGE_LABELS[x.storage] : "",
      notes: x.notes,
      source: x.by,
      links: x.link ? [{ url: x.link, host: hostOf(x.link), by: x.by }] : [],
      riders: ridersFor(x.name),
      mine: mine ? statusFor(mine.id, x.name) : null,
    })),
  ].sort((a, b) => (order.get(a.category) ?? 99) - (order.get(b.category) ?? 99));

  return (
    <div className="stack">
      <div className="row-between">
        <Link href="/crew/kit" className="small">
          ← Kit
        </Link>
        {admin && (
          <Link className="btn btn-sm btn-quiet" href={editing ? "/crew/kit/suggested" : "/crew/kit/suggested?edit=1"}>
            {editing ? "Done editing" : "Edit the suggested list"}
          </Link>
        )}
      </div>
      <div className="row-between">
        <h2 style={{ margin: 0 }}>Suggested kit</h2>
        {mine && (
          <Link className="btn btn-sm btn-primary" href={`/crew/kit/${mine.id}`}>
            My list →
          </Link>
        )}
      </div>
      <p className="muted small">
        {table.length} items — the long list plus anything a rider has put on their own list. Open the links to study them; <b>+ Add</b> puts an item straight onto your list as <i>Need</i>. The coloured
        letters show who already has it.
      </p>
      {sp.saved && <p className="notice">Saved.</p>}

      {!editing && (
        <KitSuggested
          rows={table}
          categories={KIT_CATEGORIES.map((k) => ({ value: k, label: KIT_CATEGORY_LABELS[k] }))}
          canAdd={!!mine}
          myListHref={mine ? `/crew/kit/${mine.id}` : null}
        />
      )}

      {editing &&
        KIT_CATEGORIES.map((k) => {
          const g = rows.filter((r) => r.category === k);
          if (!g.length) return null;
          return (
            <section key={k}>
              <h3 className="group-title">
                <span>{KIT_CATEGORY_LABELS[k]}</span>
                <span className="small muted">{g.length}</span>
              </h3>
              {g.map((r) => (
                <RowForm key={r.id} r={r} />
              ))}
            </section>
          );
        })}

      {editing && (
        <>
          <section className="card">
            <h3>Add a suggested item</h3>
            <RowForm />
          </section>
          <section className="card stack-sm">
            <h3>Import CSV</h3>
            <p className="muted small">
              Suggested list: <code>name,category,qty,carried_in,notes,source,link</code> — categories {KIT_CATEGORIES.join(" · ")}; carried_in one of{" "}
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

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "link";
  }
}
