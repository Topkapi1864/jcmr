import { requireCrew } from "@/lib/auth";
import { byDue, counts, listItems } from "@/lib/items";
import { BoardHeader, DoneGroup, ItemList, readFilters } from "@/components/board";

export default async function DuePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireCrew();
  const filters = readFilters(await searchParams);
  const all = await listItems();
  const rows = await listItems(filters);
  const open = rows.filter((i) => i.status !== "done").sort(byDue);
  const overdue = open.filter((i) => i.overdue);
  const dated = open.filter((i) => !i.overdue && i.due);
  const undated = open.filter((i) => !i.due);
  const done = rows.filter((i) => i.status === "done");
  return (
    <div className="stack">
      <BoardHeader title="By due" counts={counts(all)} filters={filters} path="/crew/due" />
      {overdue.length > 0 && (
        <section>
          <h2 className="group-title">
            <span>Overdue</span>
            <span className="small muted">{overdue.length}</span>
          </h2>
          <ItemList items={overdue} me={s} />
        </section>
      )}
      <section>
        <h2 className="group-title">
          <span>Coming up</span>
          <span className="small muted">{dated.length}</span>
        </h2>
        <ItemList items={dated} me={s} empty="Nothing dated." />
      </section>
      {undated.length > 0 && (
        <section>
          <h2 className="group-title">
            <span>No date</span>
            <span className="small muted">{undated.length}</span>
          </h2>
          <ItemList items={undated} me={s} />
        </section>
      )}
      <DoneGroup items={done} me={s} />
    </div>
  );
}
