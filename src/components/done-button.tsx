"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markDoneAction, undoDoneAction } from "@/app/crew/actions";
import type { Status } from "@/db/schema";

// One tap to mark done; a minute to undo (spec §5.4).

export function DoneButton({ id, label = "Done" }: { id: number; label?: string }) {
  const [pending, start] = useTransition();
  const [undo, setUndo] = useState<{ previous: Status; until: number } | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), Math.max(0, undo.until - Date.now()));
    return () => clearTimeout(t);
  }, [undo]);

  return (
    <>
      <button
        className="btn btn-sm"
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await markDoneAction(id);
            setUndo({ previous: r.previous, until: Date.now() + 60_000 });
            router.refresh();
          })
        }
      >
        {pending ? "…" : `✓ ${label}`}
      </button>
      {undo && (
        <div className="toast" role="status">
          <span>Marked done.</span>
          <button
            type="button"
            onClick={() =>
              start(async () => {
                await undoDoneAction(id, undo.previous);
                setUndo(null);
                router.refresh();
              })
            }
          >
            Undo
          </button>
        </div>
      )}
    </>
  );
}
