"use client";

import { useRouter } from "next/navigation";

/** Jump to someone else's job list. */
export function PersonPicker({ people, current, night }: { people: { id: number; label: string }[]; current: number; night: string }) {
  const router = useRouter();
  return (
    <select className="btn btn-sm" aria-label="Whose list" value={current} onChange={(e) => router.push(`/crew/jobs/${e.target.value}?night=${night}`)}>
      {people.map((p) => (
        <option key={p.id} value={p.id}>
          {p.label}
        </option>
      ))}
    </select>
  );
}
