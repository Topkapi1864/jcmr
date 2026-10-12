import Link from "next/link";
import { requireCrew } from "@/lib/auth";
import { byDue, counts, listItems } from "@/lib/items";
import { BoardHeader, DoneGroup, ItemList, StaleStrip, readFilters } from "@/components/board";
import { db, ready, schema } from "@/db/client";

type SP = Promise<Record<string, string | undefined>>;

export default async function MinePage({ searchParams }: { searchParams: SP }) {
  const s = await requireCrew();
  const sp = await searchParams;
  const filters = readFilters(sp);
  const all = await listItems();
  const c = counts(all);
  const filtered = await listItems(filters);
  const mine = filtered.filter((i) => i.ownerId === s.pid);
  const open = mine.filter((i) => i.status !== "done").sort(byDue);
  const done = mine.filter((i) => i.status === "done");
  await ready();
  const links = await db.select().from(schema.links).orderBy(schema.links.sortOrder, schema.links.id).all();

  return (
    <div className="stack">
      {sp.denied && <p className="error">That page is for admins.</p>}
      <BoardHeader title={`Mine — ${s.name}`} counts={c} filters={filters} path="/crew">
        <StaleStrip amber={c.amber} red={c.red} />
      </BoardHeader>
      <ItemList items={open} me={s} showOwner={false} empty="Nothing open with your name on it. Check the Stale view for what the board is waiting on." />
      <DoneGroup items={done} me={s} showOwner={false} />

      <section className="mt-6">
        <h2>Links</h2>
        {links.length === 0 ? (
          <p className="muted">No links yet{s.role === "admin" ? <> — <Link href="/crew/admin/links">add some</Link></> : null}.</p>
        ) : (
          <ul className="list">
            {links.map((l) => (
              <li key={l.id}>
                <a href={l.url} target="_blank" rel="noopener">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
      <Link href="/crew/items/new" className="btn btn-primary fab">
        + Add
      </Link>
    </div>
  );
}
