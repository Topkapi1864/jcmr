"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { KitItem } from "@/db/schema";
import { createKitItem, deleteKitItem, patchKitItem } from "@/app/crew/kit/actions";

type Status = KitItem["status"];
type Opt = { value: string; label: string };
type Labels = { categories: Opt[]; storage: Opt[] };

const STATUS_CYCLE: Status[] = ["need", "ordered", "have"];
const STATUS_LABEL: Record<Status, string> = { need: "Need", ordered: "Ordered", have: "Have" };
const STATUS_ICON: Record<Status, string> = { need: "✕", ordered: "…", have: "✓" };

type SortKey = "status" | "name" | "qty" | "category" | "storage" | "notes";
type GroupBy = "category" | "status" | "storage" | "none";

const COLS = ["status", "name", "qty", "category", "storage", "notes", "link"] as const;
type Col = (typeof COLS)[number];

/** Move focus to the same column one row up/down — Enter behaves like a spreadsheet. */
function moveFocus(root: HTMLElement | null, from: HTMLElement, d: number) {
  if (!root) return;
  const r = Number(from.dataset.r);
  const c = from.dataset.c;
  const next = root.querySelector<HTMLElement>(`[data-r="${r + d}"][data-c="${c}"]`) ?? (d > 0 ? root.querySelector<HTMLElement>(`[data-r="new"][data-c="${c === "status" ? "name" : c}"]`) : null);
  if (next) {
    next.focus();
    if (next instanceof HTMLInputElement) next.select();
  }
}

function TextCell({
  value,
  onCommit,
  disabled,
  r,
  c,
  type = "text",
  root,
  placeholder,
  className,
}: {
  value: string;
  onCommit: (v: string) => void;
  disabled: boolean;
  r: number;
  c: Col;
  type?: "text" | "number" | "url";
  root: React.RefObject<HTMLDivElement | null>;
  placeholder?: string;
  className?: string;
}) {
  const [v, setV] = useState(value);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setV(value);
  }, [value, focused]);
  return (
    <input
      className={`cell ${className ?? ""}`}
      type={type === "number" ? "number" : "text"}
      inputMode={type === "number" ? "numeric" : type === "url" ? "url" : undefined}
      min={type === "number" ? 0 : undefined}
      value={v}
      placeholder={placeholder}
      disabled={disabled}
      data-r={r}
      data-c={c}
      aria-label={c}
      onFocus={() => setFocused(true)}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        setFocused(false);
        if (v !== value) onCommit(v);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const el = e.currentTarget;
          el.blur();
          moveFocus(root.current, el, e.shiftKey ? -1 : 1);
        } else if (e.key === "Escape") {
          setV(value);
          requestAnimationFrame(() => e.currentTarget?.blur());
        } else if (e.key === "ArrowDown" && type !== "number") {
          e.preventDefault();
          moveFocus(root.current, e.currentTarget, 1);
        } else if (e.key === "ArrowUp" && type !== "number") {
          e.preventDefault();
          moveFocus(root.current, e.currentTarget, -1);
        }
      }}
    />
  );
}

function SelectCell({ value, options, onCommit, disabled, r, c }: { value: string; options: Opt[]; onCommit: (v: string) => void; disabled: boolean; r: number | "new"; c: Col }) {
  return (
    <select className="cell" value={value} disabled={disabled} data-r={r} data-c={c} aria-label={c} onChange={(e) => onCommit(e.target.value)} data-empty={value === "" ? "yes" : undefined}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function StatusBar({ have, ordered, need, big = false }: { have: number; ordered: number; need: number; big?: boolean }) {
  const total = have + ordered + need;
  if (!total) return <div className={`kit-bar ${big ? "kit-bar-big" : ""}`} data-empty="yes" />;
  return (
    <div className={`kit-bar ${big ? "kit-bar-big" : ""}`} role="img" aria-label={`${have} have, ${ordered} ordered, ${need} need`}>
      {have > 0 && <span data-st="have" style={{ flexGrow: have }} />}
      {ordered > 0 && <span data-st="ordered" style={{ flexGrow: ordered }} />}
      {need > 0 && <span data-st="need" style={{ flexGrow: need }} />}
    </div>
  );
}

function countOf(rows: KitItem[]) {
  const c = { have: 0, ordered: 0, need: 0 };
  for (const r of rows) c[r.status]++;
  return c;
}

export function KitSheet({ riderId, initial, editable, labels }: { riderId: number; initial: KitItem[]; editable: boolean; labels: Labels }) {
  const [rows, setRows] = useState<KitItem[]>(initial);
  const [filter, setFilter] = useState<"all" | Status | "missing">("all");
  const [q, setQ] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("category");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "status", dir: 1 });
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState<Set<number>>(new Set());
  const [, startTransition] = useTransition();
  const root = useRef<HTMLDivElement>(null);
  const pending = useRef(0);

  // Server re-renders (another tab, another rider) — take them unless we are mid-save.
  useEffect(() => {
    if (pending.current === 0) setRows(initial);
  }, [initial]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), flash.kind === "err" ? 6000 : 1600);
    return () => clearTimeout(t);
  }, [flash]);

  const catLabel = useMemo(() => new Map(labels.categories.map((o) => [o.value, o.label])), [labels]);
  const storeLabel = useMemo(() => new Map(labels.storage.map((o) => [o.value, o.label])), [labels]);

  function markBusy(id: number, on: boolean) {
    setBusy((b) => {
      const n = new Set(b);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  }

  function patch(id: number, p: Partial<KitItem>) {
    const before = rows.find((r) => r.id === id);
    if (!before) return;
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
    pending.current++;
    markBusy(id, true);
    startTransition(async () => {
      const res = await patchKitItem(id, p);
      pending.current--;
      markBusy(id, false);
      if (res.ok) {
        setRows((rs) => rs.map((r) => (r.id === id ? res.item : r)));
        setFlash({ kind: "ok", text: "Saved" });
      } else {
        setRows((rs) => rs.map((r) => (r.id === id ? before : r)));
        setFlash({ kind: "err", text: res.error });
      }
    });
  }

  function cycle(it: KitItem) {
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(it.status) + 1) % STATUS_CYCLE.length];
    patch(it.id, { status: next });
  }

  function remove(it: KitItem) {
    if (!confirm(`Remove "${it.name}" from the list?`)) return;
    setRows((rs) => rs.filter((r) => r.id !== it.id));
    pending.current++;
    startTransition(async () => {
      const res = await deleteKitItem(it.id);
      pending.current--;
      if (!res.ok) {
        setRows((rs) => [...rs, it]);
        setFlash({ kind: "err", text: res.error ?? "Could not remove" });
      } else setFlash({ kind: "ok", text: `Removed ${it.name}` });
    });
  }

  // ---- The add row ------------------------------------------------------
  const blank = { name: "", qty: "1", category: "other", storage: "", status: "need" as Status, notes: "", link: "" };
  const [draft, setDraft] = useState(blank);
  const addName = useRef<HTMLInputElement>(null);
  function add() {
    const name = draft.name.trim();
    if (!name) return;
    if (rows.some((r) => r.name.toLowerCase() === name.toLowerCase())) {
      setFlash({ kind: "err", text: `"${name}" is already on the list` });
      return;
    }
    const input = { ...draft, name, qty: Number(draft.qty) || 1 };
    setDraft({ ...blank, category: draft.category, storage: draft.storage });
    pending.current++;
    startTransition(async () => {
      const res = await createKitItem(riderId, input);
      pending.current--;
      if (res.ok) {
        setRows((rs) => [...rs, res.item]);
        setFlash({ kind: "ok", text: `Added ${res.item.name}` });
      } else setFlash({ kind: "err", text: res.error });
    });
    addName.current?.focus();
  }

  // ---- What's shown -----------------------------------------------------
  const all = countOf(rows);
  const needle = q.trim().toLowerCase();
  const shown = rows.filter((r) => {
    if (filter === "missing" && r.status === "have") return false;
    if (filter !== "all" && filter !== "missing" && r.status !== filter) return false;
    if (needle && !`${r.name} ${r.notes} ${catLabel.get(r.category)} ${storeLabel.get(r.storage)}`.toLowerCase().includes(needle)) return false;
    return true;
  });
  const statusRank = (s: Status) => STATUS_CYCLE.indexOf(s);
  const sorted = [...shown].sort((a, b) => {
    const k = sort.key;
    let d = 0;
    if (k === "status") d = statusRank(a.status) - statusRank(b.status);
    else if (k === "qty") d = a.qty - b.qty;
    else if (k === "category") d = labels.categories.findIndex((o) => o.value === a.category) - labels.categories.findIndex((o) => o.value === b.category);
    else if (k === "storage") d = labels.storage.findIndex((o) => o.value === a.storage) - labels.storage.findIndex((o) => o.value === b.storage);
    else d = String(a[k]).localeCompare(String(b[k]));
    return d * sort.dir || a.name.localeCompare(b.name);
  });

  const groups: { key: string; label: string; rows: KitItem[] }[] = [];
  if (groupBy === "none") groups.push({ key: "all", label: "", rows: sorted });
  else {
    const order = groupBy === "category" ? labels.categories.map((o) => o.value) : groupBy === "storage" ? labels.storage.map((o) => o.value) : STATUS_CYCLE;
    for (const k of order) {
      const g = sorted.filter((r) => (groupBy === "category" ? r.category : groupBy === "storage" ? r.storage : r.status) === k);
      if (g.length) groups.push({ key: k, label: groupBy === "category" ? catLabel.get(k) ?? k : groupBy === "storage" ? (k ? storeLabel.get(k) ?? k : "No home yet") : STATUS_LABEL[k as Status], rows: g });
    }
  }

  function header(k: SortKey, label: string, className?: string) {
    const on = sort.key === k;
    return (
      <th className={className} aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : undefined}>
        <button type="button" className="th-sort" onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? ((-s.dir) as 1 | -1) : 1 }))}>
          {label}
          <span aria-hidden="true">{on ? (sort.dir === 1 ? " ▲" : " ▼") : ""}</span>
        </button>
      </th>
    );
  }

  let r = 0;
  const pct = rows.length ? Math.round((all.have / rows.length) * 100) : 0;

  return (
    <div className="stack" ref={root}>
      <section className="kit-summary card">
        <div className="kit-summary-top">
          <div>
            <div className="kit-pct">
              {pct}
              <small>%</small>
            </div>
            <div className="xs muted">in hand</div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <StatusBar {...all} big />
            <div className="kit-legend">
              <button type="button" data-st="have" aria-pressed={filter === "have"} onClick={() => setFilter(filter === "have" ? "all" : "have")}>
                <b>{all.have}</b> have
              </button>
              <button type="button" data-st="ordered" aria-pressed={filter === "ordered"} onClick={() => setFilter(filter === "ordered" ? "all" : "ordered")}>
                <b>{all.ordered}</b> ordered
              </button>
              <button type="button" data-st="need" aria-pressed={filter === "need"} onClick={() => setFilter(filter === "need" ? "all" : "need")}>
                <b>{all.need}</b> still to get
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className="kit-toolbar">
        <div className="seg" role="group" aria-label="Show">
          {(
            [
              ["all", `All ${rows.length}`],
              ["missing", `Not yet in hand ${all.need + all.ordered}`],
              ["have", "Have"],
              ["ordered", "Ordered"],
              ["need", "Need"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {l}
            </button>
          ))}
        </div>
        <input type="search" className="kit-search" placeholder="Find…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find an item" />
        <label className="xs muted row" style={{ gap: 6 }}>
          Group
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} className="kit-group-select">
            <option value="category">by category</option>
            <option value="status">by status</option>
            <option value="storage">by where it goes</option>
            <option value="none">no groups</option>
          </select>
        </label>
        <span className={`kit-flash ${flash?.kind ?? ""}`} role="status" aria-live="polite">
          {flash?.text ?? (busy.size ? "Saving…" : "")}
        </span>
      </div>

      <div className="sheet-wrap">
        <table className="sheet">
          <colgroup>
            <col className="c-status" />
            <col className="c-name" />
            <col className="c-qty" />
            <col className="c-cat" />
            <col className="c-store" />
            <col className="c-notes" />
            <col className="c-link" />
            {editable && <col className="c-del" />}
          </colgroup>
          <thead>
            <tr>
              {header("status", "Status", "sticky-1")}
              {header("name", "Item", "sticky-2")}
              {header("qty", "Qty", "num")}
              {header("category", "Category")}
              {header("storage", "Where it goes")}
              {header("notes", "Note")}
              <th>Link</th>
              {editable && <th aria-label="Remove" />}
            </tr>
          </thead>
          {groups.map((g) => {
            const c = countOf(g.rows);
            return (
              <tbody key={g.key}>
                {groupBy !== "none" && (
                  <tr className="sheet-group">
                    <th colSpan={editable ? 8 : 7}>
                      <span className="sheet-group-name">{g.label}</span>
                      <span className="sheet-group-bar">
                        <StatusBar {...c} />
                      </span>
                      <span className="xs muted mono">
                        {c.have}/{g.rows.length}
                      </span>
                    </th>
                  </tr>
                )}
                {g.rows.map((it) => {
                  const ri = r++;
                  return (
                    <tr key={it.id} id={`item-${it.id}`} data-st={it.status} data-busy={busy.has(it.id) ? "yes" : undefined}>
                      <td className="sticky-1 st-cell">
                        <button
                          type="button"
                          className="st"
                          data-st={it.status}
                          data-r={ri}
                          data-c="status"
                          disabled={!editable}
                          onClick={() => cycle(it)}
                          title={editable ? "Click to change: Need → Ordered → Have" : STATUS_LABEL[it.status]}
                        >
                          <span aria-hidden="true">{STATUS_ICON[it.status]}</span> {STATUS_LABEL[it.status]}
                        </button>
                      </td>
                      <td className="sticky-2">
                        <TextCell value={it.name} disabled={!editable} r={ri} c="name" root={root} className="cell-name" onCommit={(v) => (v.trim() ? patch(it.id, { name: v }) : undefined)} />
                      </td>
                      <td className="num">
                        <TextCell value={String(it.qty)} type="number" disabled={!editable} r={ri} c="qty" root={root} onCommit={(v) => patch(it.id, { qty: Number(v) || 0 })} />
                      </td>
                      <td>
                        <SelectCell value={it.category} options={labels.categories} disabled={!editable} r={ri} c="category" onCommit={(v) => patch(it.id, { category: v as KitItem["category"] })} />
                      </td>
                      <td>
                        <SelectCell value={it.storage} options={labels.storage} disabled={!editable} r={ri} c="storage" onCommit={(v) => patch(it.id, { storage: v as KitItem["storage"] })} />
                      </td>
                      <td>
                        <TextCell value={it.notes} disabled={!editable} r={ri} c="notes" root={root} placeholder={editable ? "—" : ""} onCommit={(v) => patch(it.id, { notes: v })} />
                      </td>
                      <td className="link-cell">
                        {editable && <TextCell value={it.link} type="url" disabled={false} r={ri} c="link" root={root} placeholder="paste a link" onCommit={(v) => patch(it.id, { link: v })} />}
                        {it.link && (
                          <a href={it.link} target="_blank" rel="noopener" className="link-open" title={it.link}>
                            {editable ? "↗" : `${hostOf(it.link)} ↗`}
                          </a>
                        )}
                      </td>
                      {editable && (
                        <td className="del-cell">
                          <button type="button" className="row-del" onClick={() => remove(it)} aria-label={`Remove ${it.name}`} title="Remove">
                            ×
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            );
          })}
          {editable && (
            <tfoot>
              <tr className="sheet-add">
                <td className="sticky-1 st-cell">
                  <span className="st" data-st="need" data-ghost="yes">
                    <span aria-hidden="true">+</span> New
                  </span>
                </td>
                <td className="sticky-2">
                  <input
                    ref={addName}
                    className="cell cell-name"
                    value={draft.name}
                    placeholder="Type an item and press Enter…"
                    data-r="new"
                    data-c="name"
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        add();
                      }
                    }}
                  />
                </td>
                <td className="num">
                  <input className="cell" type="number" min={0} value={draft.qty} data-r="new" data-c="qty" onChange={(e) => setDraft({ ...draft, qty: e.target.value })} onKeyDown={(e) => e.key === "Enter" && add()} aria-label="qty" />
                </td>
                <td>
                  <SelectCell value={draft.category} options={labels.categories} disabled={false} r="new" c="category" onCommit={(v) => setDraft({ ...draft, category: v })} />
                </td>
                <td>
                  <SelectCell value={draft.storage} options={labels.storage} disabled={false} r="new" c="storage" onCommit={(v) => setDraft({ ...draft, storage: v })} />
                </td>
                <td>
                  <input className="cell" value={draft.notes} placeholder="note" data-r="new" data-c="notes" onChange={(e) => setDraft({ ...draft, notes: e.target.value })} onKeyDown={(e) => e.key === "Enter" && add()} aria-label="note" />
                </td>
                <td>
                  <input className="cell" value={draft.link} placeholder="link" data-r="new" data-c="link" onChange={(e) => setDraft({ ...draft, link: e.target.value })} onKeyDown={(e) => e.key === "Enter" && add()} aria-label="link" />
                </td>
                <td className="del-cell">
                  <button type="button" className="btn btn-sm btn-primary" onClick={add} disabled={!draft.name.trim()}>
                    Add
                  </button>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {shown.length === 0 && rows.length > 0 && <p className="muted small">Nothing matches — clear the filter or search.</p>}
      {rows.length === 0 && <p className="muted small">Nothing on this list yet{editable ? " — type in the bottom row, or add from the suggested list." : "."}</p>}
      {editable && <p className="xs muted">Click a cell to edit — it saves as you leave it. Enter moves down a row; Esc undoes the cell. Click the status to step it Need → Ordered → Have.</p>}
    </div>
  );
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "link";
  }
}
