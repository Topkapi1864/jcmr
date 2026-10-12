import { requireCrew } from "@/lib/auth";
import { byDue, counts, groupBy, listItems } from "@/lib/items";
import { BoardHeader, DoneGroup, ItemList, readFilters } from "@/components/board";

export default async function OwnerPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireCrew();
  const filters = readFilters(await searchParams);
  const all = await listItems();
  const rows = await listItems(filters);
  const groups = [...groupBy(rows, (r) => r.owner.shortName).entries()].sort((a, b) => a[0].localeCompare(b[0]));
  return (
    <div className="stack">
      <BoardHeader title="By owner" counts={counts(all)} filters={filters} path="/crew/owner" />
      {groups.map(([name, g]) => {
        const open = g.filter((i) => i.status !== "done").sort(byDue);
        const done = g.filter((i) => i.status === "done");
        const stale = open.filter((i) => i.staleLevel !== "none").length;
        return (
          <section key={name}>
            <h2 className="group-title">
              <span>{name}</span>
              <span className="small muted">
                {open.length} open{stale ? ` · ${stale} stale` : ""}
                {done.length ? ` · ${done.length} done` : ""}
              </span>
            </h2>
            <ItemList items={open} me={s} showOwner={false} empty="Nothing open." />
            <DoneGroup items={done} me={s} showOwner={false} />
          </section>
        );
      })}
    </div>
  );
}
