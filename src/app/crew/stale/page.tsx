import { requireCrew } from "@/lib/auth";
import { byStale, counts, listItems, STALE_AMBER, STALE_RED } from "@/lib/items";
import { BoardHeader, ItemList, readFilters } from "@/components/board";

export default async function StalePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireCrew();
  const filters = readFilters(await searchParams);
  const all = await listItems();
  const rows = (await listItems(filters)).filter((i) => i.status !== "done").sort(byStale);
  return (
    <div className="stack">
      <BoardHeader title="Stale" counts={counts(all)} filters={filters} path="/crew/stale">
        <p className="muted small">
          Every item not done, longest since anyone touched it first. Amber at {STALE_AMBER} days, red at {STALE_RED}. A note counts as a touch.
        </p>
      </BoardHeader>
      <ItemList items={rows} me={s} empty="Nothing open. That can't be right — add the things that are." />
    </div>
  );
}
