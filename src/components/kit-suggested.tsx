"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { addSuggestionToMine } from "@/app/crew/kit/actions";

type Status = "need" | "ordered" | "have";
export type SuggestionRow = {
  key: string;
  ref: { catalogueId?: number; itemId?: number };
  name: string;
  category: string;
  qty: number;
  storage: string;
  notes: string;
  source: string;
  links: { url: string; host: string; by: string }[];
  riders: { name: string; status: Status | null }[];
  mine: Status | null;
};

const STATUS_LABEL: Record<Status, string> = { need: "Need", ordered: "Ordered", have: "Have" };
const STATUS_ICON: Record<Status, string> = { need: "✕", ordered: "…", have: "✓" };

export function KitSuggested({
  rows: initial,
  categories,
  canAdd,
  myListHref,
}: {
  rows: SuggestionRow[];
  categories: { value: string; label: string }[];
  canAdd: boolean;
  myListHref: string | null;
}) {
  const [rows, setRows] = useState(initial);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [hideMine, setHideMine] = useState(false);
  const [linksOnly, setLinksOnly] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [, start] = useTransition();
  const catLabel = useMemo(() => new Map(categories.map((c) => [c.value, c.label])), [categories]);

  function add(r: SuggestionRow) {
    setBusy(r.key);
    start(async () => {
      const res = await addSuggestionToMine(r.ref);
      setBusy(null);
      if (res.ok) {
        setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, mine: res.item.status } : x)));
        setFlash({ kind: "ok", text: `${r.name} added to your list as Need` });
      } else setFlash({ kind: "err", text: res.error });
      setTimeout(() => setFlash(null), 3500);
    });
  }

  const needle = q.trim().toLowerCase();
  const shown = rows.filter(
    (r) =>
      (cat === "all" || r.category === cat) &&
      (!hideMine || !r.mine) &&
      (!linksOnly || r.links.length > 0) &&
      (!needle || `${r.name} ${r.notes} ${r.links.map((l) => l.host).join(" ")}`.toLowerCase().includes(needle)),
  );
  const onMine = rows.filter((r) => r.mine).length;
  const withLinks = rows.filter((r) => r.links.length).length;

  return (
    <div className="stack">
      <div className="kit-toolbar">
        <input type="search" className="kit-search" placeholder="Find…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a suggested item" />
        <select className="kit-group-select" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
          <option value="all">All categories</option>
          {categories
            .filter((c) => rows.some((r) => r.category === c.value))
            .map((c) => (
              <option key={c.value} value={c.value}>
                {c.label} ({rows.filter((r) => r.category === c.value).length})
              </option>
            ))}
        </select>
        <div className="seg" role="group" aria-label="Show">
          {canAdd && (
            <button type="button" aria-pressed={hideMine} onClick={() => setHideMine(!hideMine)}>
              Hide the {onMine} on my list
            </button>
          )}
          <button type="button" aria-pressed={linksOnly} onClick={() => setLinksOnly(!linksOnly)}>
            Only with links ({withLinks})
          </button>
        </div>
        <span className={`kit-flash ${flash?.kind ?? ""}`} role="status" aria-live="polite">
          {flash?.text}
          {flash?.kind === "ok" && myListHref && (
            <>
              {" "}
              · <Link href={myListHref}>open my list</Link>
            </>
          )}
        </span>
      </div>

      <div className="sheet-wrap">
        <table className="sheet sheet-suggest">
          <thead>
            <tr>
              <th className="sticky-1">{canAdd ? "My list" : ""}</th>
              <th className="sticky-2">Item</th>
              <th className="num">Qty</th>
              <th>Category</th>
              <th>Usually goes</th>
              <th>Note</th>
              <th>Links to study</th>
              <th>Riders</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.key} data-st={r.mine ?? undefined} data-mine={r.mine ? "yes" : undefined}>
                <td className="sticky-1 st-cell">
                  {r.mine ? (
                    <span className="st" data-st={r.mine} title="Already on your list">
                      <span aria-hidden="true">{STATUS_ICON[r.mine]}</span> {STATUS_LABEL[r.mine]}
                    </span>
                  ) : canAdd ? (
                    <button type="button" className="st st-add" onClick={() => add(r)} disabled={busy === r.key}>
                      {busy === r.key ? "Adding…" : "+ Add"}
                    </button>
                  ) : null}
                </td>
                <td className="sticky-2 cell-text cell-name">
                  {r.name}
                  {r.ref.itemId && r.source && <span className="xs muted"> · from {r.source}&rsquo;s list</span>}
                </td>
                <td className="num cell-text mono">{r.qty}</td>
                <td className="cell-text muted">{catLabel.get(r.category) ?? r.category}</td>
                <td className="cell-text muted">{r.storage || "—"}</td>
                <td className="cell-text muted small">{r.notes}</td>
                <td className="cell-text">
                  {r.links.length ? (
                    <span className="link-chips">
                      {r.links.map((l) => (
                        <a key={l.url} href={l.url} target="_blank" rel="noopener" className="link-chip" title={l.url}>
                          {l.host} ↗{l.by && <span className="muted"> · {l.by}</span>}
                        </a>
                      ))}
                    </span>
                  ) : (
                    <span className="faint xs">—</span>
                  )}
                </td>
                <td className="cell-text">
                  <span className="rider-dots">
                    {r.riders.map((x) => (
                      <span key={x.name} className="rider-dot" data-st={x.status ?? "none"} title={`${x.name}: ${x.status ? STATUS_LABEL[x.status] : "not on their list"}`}>
                        {x.name.slice(0, 2)}
                      </span>
                    ))}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {shown.length === 0 && <p className="muted small">Nothing matches.</p>}
    </div>
  );
}
