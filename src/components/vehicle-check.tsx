"use client";

import { useOptimistic, useTransition } from "react";
import { tickChecklist } from "@/app/crew/vehicles/actions";

/** One tick box on a vehicle's checklist — saves as you tap, no page reload. */
export function VehicleCheck({ id, checked, label }: { id: number; checked: boolean; label: string }) {
  const [pending, start] = useTransition();
  const [on, setOn] = useOptimistic(checked);
  return (
    <input
      type="checkbox"
      className="veh-tick"
      aria-label={`${label} — packed`}
      checked={on}
      data-pending={pending || undefined}
      onChange={(e) => {
        const next = e.target.checked;
        start(async () => {
          setOn(next);
          await tickChecklist(id, next);
        });
      }}
    />
  );
}
