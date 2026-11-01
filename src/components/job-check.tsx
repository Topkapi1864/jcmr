"use client";

import { useState, useTransition } from "react";
import { tickJob, saveJobItem } from "@/app/crew/jobs/actions";
import type { NightJob } from "@/db/schema";
import { fmtTime, fmtWhen } from "@/lib/time";

// A night's job list, with the count and bar kept in step as boxes are
// ticked. Ticks save one by one with no page reload; the list keeps its own
// state so a run of quick taps is never lost to a re-render in between.

export type JobRow = Pick<NightJob, "id" | "name" | "note" | "checked" | "checkedBy" | "checkedAt">;

export function JobsChecklist({
  jobs,
  editable,
  me,
  prefix = "",
  showBar = true,
  onlyUnticked = false,
  compact = false,
}: {
  jobs: JobRow[];
  editable: boolean;
  me: string;
  /** Put before each box's label, e.g. the person's name on the combined view. */
  prefix?: string;
  showBar?: boolean;
  onlyUnticked?: boolean;
  compact?: boolean;
}) {
  const [rows, setRows] = useState(jobs);
  const [pending, setPending] = useState<Set<number>>(new Set());
  const [, start] = useTransition();
  const done = rows.filter((r) => r.checked).length;
  const shown = onlyUnticked ? rows.filter((r) => !r.checked) : rows;

  function toggle(id: number, next: boolean) {
    const at = new Date().toISOString();
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, checked: next, checkedBy: next ? me : "", checkedAt: next ? at : "" } : r)));
    setPending((p) => new Set(p).add(id));
    start(async () => {
      const ok = await tickJob(id, next);
      if (!ok) setRows((rs) => rs.map((r) => (r.id === id ? { ...r, checked: !next } : r)));
      setPending((p) => {
        const q = new Set(p);
        q.delete(id);
        return q;
      });
    });
  }

  return (
    <>
      {showBar && rows.length > 0 && (
        <>
          <div className="row-between small muted">
            <span>{done === rows.length ? "All done ✓" : `${done} of ${rows.length} done`}</span>
          </div>
          <div className="veh-bar veh-bar-lg" role="progressbar" aria-valuemin={0} aria-valuemax={rows.length} aria-valuenow={done}>
            <span style={{ width: `${(done / rows.length) * 100}%` }} />
          </div>
        </>
      )}
      {shown.length === 0 ? (
        onlyUnticked && rows.length > 0 ? (
          <p className="small muted" style={{ margin: 0 }}>
            Everything ticked.
          </p>
        ) : null
      ) : (
        <ul className="veh-checklist jobs-list">
          {shown.map((j) => (
            <li key={j.id} data-checked={j.checked}>
              <input
                type="checkbox"
                className="veh-tick"
                aria-label={`${prefix}${j.name} — done`}
                checked={j.checked}
                disabled={!editable}
                data-pending={pending.has(j.id) || undefined}
                onChange={(e) => toggle(j.id, e.target.checked)}
              />
              <div className="veh-check-text">
                <span className="veh-check-name">{j.name}</span>
                {j.note && <span className="xs muted">{j.note}</span>}
                {j.checked && j.checkedBy && (
                  <span className="xs faint">
                    ✓ {j.checkedBy}, {compact ? fmtTime(j.checkedAt) : fmtWhen(j.checkedAt)}
                  </span>
                )}
              </div>
              {editable && !compact ? (
                <details className="veh-check-edit">
                  <summary aria-label={`Edit ${j.name}`}>▸</summary>
                  <form action={saveJobItem} className="form-inline">
                    <input type="hidden" name="id" value={j.id} />
                    <input type="text" name="name" defaultValue={j.name} maxLength={120} required aria-label="Job" style={{ flex: "2 1 10rem" }} />
                    <input type="text" name="note" defaultValue={j.note} maxLength={200} placeholder="note" aria-label="Note" style={{ flex: "2 1 10rem" }} />
                    <button className="btn btn-sm" type="submit">
                      Save
                    </button>
                    <button className="btn btn-sm btn-quiet" type="submit" name="delete" value="1">
                      Delete
                    </button>
                  </form>
                </details>
              ) : (
                <span />
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
