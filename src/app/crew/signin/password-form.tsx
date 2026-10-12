"use client";

import { useActionState } from "react";
import { submitPassword } from "./actions";

export function PasswordForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(submitPassword, undefined);
  return (
    <form action={action} className="stack-sm">
      <input type="hidden" name="next" value={next} />
      <label className="field">
        <span>Crew password</span>
        <input type="password" name="password" autoComplete="current-password" autoFocus required />
      </label>
      {state?.error && <p className="error">{state.error}</p>}
      <button className="btn btn-primary" type="submit" disabled={pending} style={{ width: "100%" }}>
        {pending ? "Checking…" : "Continue"}
      </button>
    </form>
  );
}
