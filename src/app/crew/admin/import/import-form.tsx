"use client";

import { useActionState } from "react";
import { importCsv } from "../actions";

export function ImportForm() {
  const [state, action, pending] = useActionState(importCsv, undefined);
  return (
    <form action={action} className="stack-sm">
      <label className="field">
        <span>Choose a CSV file</span>
        <input type="file" name="file" accept=".csv,text/csv" />
      </label>
      <label className="field">
        <span>…or paste it</span>
        <textarea name="csv" rows={10} placeholder="title,area,owner,due,status,waiting_on,note,last_touched,source" />
      </label>
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Importing…" : "Import"}
      </button>
      {state && "error" in state && <p className="error">{state.error}</p>}
      {state && "imported" in state && (
        <div className="notice stack-sm">
          <p>
            Imported <b>{state.imported}</b>, updated <b>{state.updated}</b>, rejected <b>{state.rejected.length}</b>.
          </p>
          {state.rejected.length > 0 && (
            <ul className="list small">
              {state.rejected.map((r, i) => (
                <li key={i}>
                  Row {r.row}: {r.reason} — {r.title}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
