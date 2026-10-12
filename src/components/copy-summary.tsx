"use client";

import { useState } from "react";

// "Copy weekly summary" — fetches the plain text and puts it on the clipboard.

export function CopySummary() {
  const [state, setState] = useState<"idle" | "busy" | "done" | "fail">("idle");
  return (
    <button
      type="button"
      className="btn btn-sm"
      disabled={state === "busy"}
      onClick={async () => {
        setState("busy");
        try {
          const res = await fetch("/crew/export.txt", { cache: "no-store" });
          const text = await res.text();
          await navigator.clipboard.writeText(text);
          setState("done");
        } catch {
          setState("fail");
          window.open("/crew/export.txt", "_blank");
        }
        setTimeout(() => setState("idle"), 2500);
      }}
    >
      {state === "done" ? "Copied ✓" : state === "fail" ? "Opened as text" : state === "busy" ? "…" : "Copy weekly summary"}
    </button>
  );
}
