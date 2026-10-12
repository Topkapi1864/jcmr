import Link from "next/link";
import { requireCrew } from "@/lib/auth";
import { allItems, kitCounts, riderForPerson, ridersWithPeople } from "@/lib/kit";
import { KIT_STORAGE, KIT_STORAGE_LABELS } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function KitHome() {
  const s = await requireCrew();
  const riders = await ridersWithPeople();
  const items = await allItems();
  const mine = await riderForPerson(s.pid);

  const byStorage = KIT_STORAGE.map((k) => ({ key: k, label: KIT_STORAGE_LABELS[k], n: items.filter((i) => i.storage === k).length })).filter((x) => x.n > 0);

  return (
    <div className="stack">
      <div className="row-between">
        <h2 style={{ margin: 0 }}>Kit</h2>
        <div className="row">
          <Link className="btn btn-sm" href="/crew/kit/suggested">
            Suggested list
          </Link>
          <Link className="btn btn-sm" href="/crew/kit/storage">
            By storage
          </Link>
          {mine && (
            <Link className="btn btn-sm btn-primary" href={`/crew/kit/${mine.id}`}>
              My list
            </Link>
          )}
        </div>
      </div>
      <p className="muted small">
        One list per rider: how many, whether you have it, have ordered it or still need it, and where it will be stored on the day. Add from the suggested list or add your own.
      </p>
      <div className="tiles">
        {riders.map((r) => {
          const c = kitCounts(items.filter((i) => i.riderId === r.id));
          return (
            <Link key={r.id} href={`/crew/kit/${r.id}`} className="tile">
              <span className="eyebrow">{c.total} items</span>
              <h2>{r.displayName}</h2>
              <p>
                <span className="badge badge-done">{c.have} have</span> <span className="badge badge-in-progress">{c.ordered} ordered</span>{" "}
                <span className="badge badge-red">{c.need} need</span>
                {c.unstored > 0 && <> · {c.unstored} with no home yet</>}
              </p>
            </Link>
          );
        })}
      </div>
      {byStorage.length > 0 && (
        <section className="card">
          <div className="label">Where it all goes</div>
          <ul className="list small" style={{ marginTop: 8 }}>
            {byStorage.map((x) => (
              <li key={x.key}>
                <Link href={`/crew/kit/storage#${x.key || "undecided"}`}>{x.label}</Link> · {x.n} items
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
