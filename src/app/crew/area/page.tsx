import { AREAS, AREA_LABELS } from "@/db/schema";
import { requireCrew } from "@/lib/auth";
import { byDue, counts, listItems } from "@/lib/items";
import { BoardHeader, DoneGroup, ItemList, readFilters } from "@/components/board";

export default async function AreaPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireCrew();
  const filters = readFilters(await searchParams);
  const all = await listItems();
  const rows = await listItems(filters);
  return (
    <div className="stack">
      <BoardHeader title="By area" counts={counts(all)} filters={filters} path="/crew/area" />
      {AREAS.map((area) => {
        const g = rows.filter((i) => i.area === area);
        if (!g.length) return null;
        const open = g.filter((i) => i.status !== "done").sort(byDue);
        const done = g.filter((i) => i.status === "done");
        return (
          <section key={area}>
            <h2 className="group-title">
              <span>{AREA_LABELS[area]}</span>
              <span className="small muted">
                {open.length} open{done.length ? ` · ${done.length} done` : ""}
              </span>
            </h2>
            <ItemList items={open} me={s} empty="All done here." />
            <DoneGroup items={done} me={s} />
          </section>
        );
      })}
    </div>
  );
}
