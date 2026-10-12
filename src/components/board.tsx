import Link from "next/link";
import { AREAS, AREA_LABELS, STATUSES, STATUS_LABELS, type Status } from "@/db/schema";
import type { ItemRow, Filters } from "@/lib/items";
import { fmtDay } from "@/lib/time";
import { DoneButton } from "./done-button";
import { CopySummary } from "./copy-summary";
import { NavLink } from "./nav-link";

const VIEWS = [
  { href: "/crew", label: "Mine" },
  { href: "/crew/stale", label: "Stale" },
  { href: "/crew/area", label: "By area" },
  { href: "/crew/owner", label: "By owner" },
  { href: "/crew/due", label: "By due" },
];

export function StatusBadge({ status }: { status: Status }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABELS[status]}</span>;
}

export function ItemCard({ item, me, showOwner = true }: { item: ItemRow; me: { pid: number; name: string; role: string }; showOwner?: boolean }) {
  const mine = me.role === "admin" || item.ownerId === me.pid || item.createdBy === me.name;
  return (
    <li className="item-card" data-stale={item.staleLevel} data-status={item.status}>
      <Link className="title" href={`/crew/items/${item.id}`}>
        {item.title}
      </Link>
      <div className="meta">
        <StatusBadge status={item.status} />
        <span className="badge">{AREA_LABELS[item.area]}</span>
        {showOwner && <span>{item.owner.shortName}</span>}
        {item.due && (
          <span className={item.overdue ? "badge badge-overdue" : undefined}>
            due {fmtDay(item.due)}
            {item.overdue ? " · overdue" : ""}
          </span>
        )}
        {item.latestNote && (
          <span className="faint" title={item.latestNote.text}>
            · {item.latestNote.author}: {item.latestNote.text.length > 60 ? item.latestNote.text.slice(0, 60) + "…" : item.latestNote.text}
          </span>
        )}
      </div>
      {item.waitingOn && item.status !== "done" && (
        <div className="waiting">
          waiting on {item.status === "blocked" ? <b>{item.waitingOn}</b> : item.waitingOn}
        </div>
      )}
      <div className="side">
        {item.status !== "done" && (
          <span className="stale-count" data-stale={item.staleLevel} title="days since anyone touched this">
            {item.staleDays}d
          </span>
        )}
        {item.status !== "done" && mine && <DoneButton id={item.id} />}
      </div>
    </li>
  );
}

export function ItemList({ items, me, showOwner = true, empty = "Nothing here." }: { items: ItemRow[]; me: { pid: number; name: string; role: string }; showOwner?: boolean; empty?: string }) {
  if (!items.length) return <p className="muted">{empty}</p>;
  return (
    <ul className="list">
      {items.map((i) => (
        <ItemCard key={i.id} item={i} me={me} showOwner={showOwner} />
      ))}
    </ul>
  );
}

export function DoneGroup({ items, me, showOwner = true }: { items: ItemRow[]; me: { pid: number; name: string; role: string }; showOwner?: boolean }) {
  if (!items.length) return null;
  return (
    <details className="done-group">
      <summary>
        {items.length} done — show
      </summary>
      <ItemList items={items} me={me} showOwner={showOwner} />
    </details>
  );
}

export function Counts({ c }: { c: { open: number; "in-progress": number; blocked: number; done: number; amber: number; red: number } }) {
  return (
    <div className="counts">
      <span>
        <b>{c.open}</b> open
      </span>
      <span>
        <b>{c["in-progress"]}</b> in progress
      </span>
      <span>
        <b>{c.blocked}</b> blocked
      </span>
      <span>
        <b>{c.done}</b> done
      </span>
      <span>
        · stale <b className="amber">{c.amber}</b> 4+ / <b className="red">{c.red}</b> 7+
      </span>
    </div>
  );
}

export function StaleStrip({ amber, red }: { amber: number; red: number }) {
  const level = red > 0 ? "red" : amber > 0 ? "amber" : "none";
  return (
    <Link href="/crew/stale" className="stale-strip" data-level={level}>
      <span>
        Stale across the board: <b>{amber}</b> amber · <b>{red}</b> red
      </span>
      <span>→</span>
    </Link>
  );
}

/** GET form; the page reads the query. */
export function FilterBar({ filters, path }: { filters: Filters; path: string }) {
  return (
    <form method="get" action={path} className="filters">
      <input type="search" name="q" defaultValue={filters.q ?? ""} placeholder="Search items" aria-label="Search" style={{ width: "auto", minHeight: 38, borderRadius: "var(--radius-pill)", padding: "0 14px", flex: "1 1 10rem" }} />
      <select name="status" defaultValue={filters.status ?? ""} aria-label="Status">
        <option value="">Any status</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      <select name="area" defaultValue={filters.area ?? ""} aria-label="Area">
        <option value="">Any area</option>
        {AREAS.map((a) => (
          <option key={a} value={a}>
            {AREA_LABELS[a]}
          </option>
        ))}
      </select>
      <label className="row small">
        <input type="checkbox" name="hideDone" value="1" defaultChecked={!!filters.hideDone} /> hide done
      </label>
      <button className="btn btn-sm" type="submit">
        Filter
      </button>
      {(filters.status || filters.area || filters.hideDone || filters.q) && (
        <Link href={path} className="small">
          clear
        </Link>
      )}
    </form>
  );
}

export function BoardHeader({ title, counts, filters, path, children }: { title: string; counts: React.ComponentProps<typeof Counts>["c"]; filters: Filters; path: string; children?: React.ReactNode }) {
  return (
    <div className="stack-sm">
      <nav className="views" aria-label="Views">
        {VIEWS.map((v) => (
          <NavLink key={v.href} href={v.href}>
            {v.label}
          </NavLink>
        ))}
      </nav>
      <div className="row-between">
        <h2 style={{ margin: 0 }}>{title}</h2>
        <div className="row">
          <CopySummary />
          <Link href="/crew/items/new" className="btn btn-primary btn-sm">
            + Add item
          </Link>
        </div>
      </div>
      <Counts c={counts} />
      {children}
      <FilterBar filters={filters} path={path} />
    </div>
  );
}

export function readFilters(sp: Record<string, string | undefined>): Filters {
  const status = (sp.status ?? "") as Status | "";
  return {
    status: STATUSES.includes(status as Status) ? status : "",
    area: AREAS.includes((sp.area ?? "") as (typeof AREAS)[number]) ? (sp.area as (typeof AREAS)[number]) : "",
    hideDone: sp.hideDone === "1",
    q: (sp.q ?? "").slice(0, 80),
  };
}
