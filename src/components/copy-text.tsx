"use client";

import { useState } from "react";

/** A small "Copy" button for a piece of text — the tracking address, say. */
export function CopyText({ text, label = "Copy" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "done" | "fail">("idle");
  return (
    <button
      type="button"
      className="btn btn-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setState("done");
        } catch {
          setState("fail");
        }
        setTimeout(() => setState("idle"), 2000);
      }}
    >
      {state === "done" ? "Copied ✓" : state === "fail" ? "Select and copy it" : label}
    </button>
  );
}
