import Link from "next/link";
import { KIT_STORAGE, KIT_STORAGE_LABELS, KIT_STATUS_LABELS } from "@/db/schema";
import { requireCrew } from "@/lib/auth";
import { allItems, ridersWithPeople } from "@/lib/kit";

export const dynamic = "force-dynamic";

// The packing view: every rider's items grouped by where they will live on the day.
export default async function StoragePage() {
  await requireCrew();
  const riders = await ridersWithPeople();
  const items = await allItems();
  const name = (id: number) => riders.find((r) => r.id === id)?.displayName.split(" ")[0] ?? "?";
  return (
    <div className="stack">
      <div>
        <Link href="/crew/kit" className="small">
          ← Kit
        </Link>
      </div>
      <h2 style={{ margin: 0 }}>Kit by where it goes</h2>
      <p className="muted small">What ends up in each vehicle and bag, across all four riders. Items with no home yet are listed first.</p>
      {[...KIT_STORAGE].map((k) => {
        const rows = items.filter((i) => i.storage === k);
        if (!rows.length) return null;
        return (
          <section key={k || "undecided"} id={k || "undecided"}>
            <h3 className="group-title">
              <span>{KIT_STORAGE_LABELS[k]}</span>
              <span className="small muted">{rows.length}</span>
            </h3>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Who</th>
                    <th>Qty</th>
                    <th>Status</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((i) => (
                    <tr key={i.id}>
                      <td>
                        <Link href={`/crew/kit/${i.riderId}#item-${i.id}`}>{i.name}</Link>
                      </td>
                      <td>{name(i.riderId)}</td>
                      <td className="mono">{i.qty}</td>
                      <td>{KIT_STATUS_LABELS[i.status]}</td>
                      <td className="muted">{i.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
