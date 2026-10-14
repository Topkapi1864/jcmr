import Link from "next/link";
import { requireCrew } from "@/lib/auth";
import { allItems, kitCounts, riderForPerson, ridersWithPeople } from "@/lib/kit";
import { KIT_CATEGORIES, KIT_CATEGORY_LABELS, KIT_STORAGE, KIT_STORAGE_LABELS, type KitItem } from "@/db/schema";
import { StatusBar } from "@/components/kit-sheet";

export const dynamic = "force-dynamic";

const ICON = { have: "✓", ordered: "…", need: "✕" } as const;
const WORD = { have: "Have", ordered: "Ordered", need: "Need" } as const;

export default async function KitHome({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireCrew();
  const sp = await searchParams;
  const riders = await ridersWithPeople();
  const items = await allItems();
  const mine = await riderForPerson(s.pid);
  const gapsOnly = sp.show === "gaps";

  // One row per item name across everyone's lists.
  const byName = new Map<string, { name: string; category: KitItem["category"]; cells: Map<number, KitItem> }>();
  for (const i of items) {
    const k = i.name.toLowerCase();
    const row = byName.get(k) ?? { name: i.name, category: i.category, cells: new Map() };
    row.cells.set(i.riderId, i);
    byName.set(k, row);
  }
  const matrix = [...byName.values()].filter((r) => !gapsOnly || [...r.cells.values()].some((c) => c.status !== "have"));
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

      <div className="kit-riders">
        {riders.map((r) => {
          const c = kitCounts(items.filter((i) => i.riderId === r.id));
          const pct = c.total ? Math.round((c.have / c.total) * 100) : 0;
          return (
            <Link key={r.id} href={`/crew/kit/${r.id}`} className="kit-rider" aria-current={mine?.id === r.id ? "true" : undefined}>
              <div className="row-between">
                <b>{r.displayName}</b>
                <span className="kit-pct-sm">{pct}%</span>
              </div>
              <StatusBar have={c.have} ordered={c.ordered} need={c.need} />
              <div className="kit-legend kit-legend-static xs">
                <span data-st="have">
                  <b>{c.have}</b> have
                </span>
                <span data-st="ordered">
                  <b>{c.ordered}</b> ordered
                </span>
                <span data-st="need">
                  <b>{c.need}</b> need
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      <section className="stack-sm">
        <div className="row-between">
          <h3 style={{ margin: 0 }}>Who has what</h3>
          <div className="seg" role="group" aria-label="Show">
            <Link href="/crew/kit" aria-pressed={!gapsOnly}>
              Everything
            </Link>
            <Link href="/crew/kit?show=gaps" aria-pressed={gapsOnly}>
              Only gaps
            </Link>
          </div>
        </div>
        <div className="kit-key xs muted">
          <span className="mx" data-st="have">
            ✓
          </span>{" "}
          have{" "}
          <span className="mx" data-st="ordered">
            …
          </span>{" "}
          ordered{" "}
          <span className="mx" data-st="need">
            ✕
          </span>{" "}
          need{" "}
          <span className="mx" data-st="none" /> not on their list
        </div>
        <div className="sheet-wrap">
          <table className="sheet matrix">
            <thead>
              <tr>
                <th className="sticky-2">Item</th>
                {riders.map((r) => (
                  <th key={r.id} className="mx-col">
                    <Link href={`/crew/kit/${r.id}`}>{r.displayName.split(" ")[0]}</Link>
                  </th>
                ))}
              </tr>
            </thead>
            {KIT_CATEGORIES.map((k) => {
              const g = matrix.filter((m) => m.category === k).sort((a, b) => a.name.localeCompare(b.name));
              if (!g.length) return null;
              return (
                <tbody key={k}>
                  <tr className="sheet-group">
                    <th colSpan={riders.length + 1}>
                      <span className="sheet-group-name">{KIT_CATEGORY_LABELS[k]}</span>
                    </th>
                  </tr>
                  {g.map((m) => (
                    <tr key={m.name}>
                      <td className="sticky-2 cell-text cell-name">{m.name}</td>
                      {riders.map((r) => {
                        const it = m.cells.get(r.id);
                        return (
                          <td key={r.id} className="mx-col">
                            {it ? (
                              <Link href={`/crew/kit/${r.id}#item-${it.id}`} className="mx" data-st={it.status} title={`${r.displayName}: ${WORD[it.status]}${it.qty > 1 ? ` × ${it.qty}` : ""}${it.notes ? ` — ${it.notes}` : ""}`}>
                                {ICON[it.status]}
                              </Link>
                            ) : (
                              <span className="mx" data-st="none" title={`Not on ${r.displayName}'s list`} />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              );
            })}
          </table>
        </div>
        {matrix.length === 0 && <p className="muted small">{gapsOnly ? "No gaps — everyone has everything on their lists." : "No one has a list yet."}</p>}
      </section>

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
