import Link from "next/link";
import type { SleepingPlace } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { places } from "@/lib/sleeping";
import { saveSleepingPlace } from "../actions";

export const dynamic = "force-dynamic";

function RowForm({ r }: { r?: SleepingPlace }) {
  return (
    <form action={saveSleepingPlace} className="form-inline" style={{ padding: "8px 0", borderTop: "1px solid var(--color-border)" }}>
      <input type="hidden" name="id" value={r?.id ?? 0} />
      <label className="field" style={{ flex: "2 1 12rem" }}>
        <span>Place</span>
        <input type="text" name="name" defaultValue={r?.name ?? ""} required placeholder={r ? "" : "New place"} />
      </label>
      <label className="field" style={{ flex: "1 1 7rem" }}>
        <span>Town</span>
        <input type="text" name="town" defaultValue={r?.town ?? ""} placeholder="London" />
      </label>
      <label className="field" style={{ flex: "0 0 5rem" }}>
        <span>Beds</span>
        <input type="number" name="beds" defaultValue={r?.beds ?? ""} min={0} inputMode="numeric" placeholder="?" />
      </label>
      <label className="field" style={{ flex: "2 1 12rem" }}>
        <span>Note</span>
        <input type="text" name="notes" defaultValue={r?.notes ?? ""} />
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

export default async function SleepingPlacesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const rows = await places(true);
  return (
    <div className="stack">
      <div>
        <Link href="/crew/sleeping" className="small">
          ← Sleeping
        </Link>
      </div>
      <h2 style={{ margin: 0 }}>Places to sleep</h2>
      <p className="muted small">The list everyone picks from. Beds is a rough capacity — the per-night view goes red when more people are down for a place than it has beds. Retire a place rather than delete it.</p>
      {sp.saved && <p className="notice">Saved.</p>}
      <section>
        {rows.map((r) => (
          <RowForm key={r.id} r={r} />
        ))}
      </section>
      <section className="card">
        <h3>Add a place</h3>
        <RowForm />
      </section>
    </div>
  );
}
