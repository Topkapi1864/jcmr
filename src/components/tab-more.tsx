"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/** The phone tab bar's "More": every crew section, so nothing is rail-only. */
export function TabMore({ items, featured }: { items: { href: string; label: string }[]; featured: string[] }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open]);
  const here = (h: string) => (h === "/crew" ? path === h : path === h || path.startsWith(h + "/"));
  const onOther = items.some((i) => !featured.includes(i.href) && here(i.href));

  return (
    <>
      <button type="button" className="tab-more-btn" aria-expanded={open} aria-current={onOther && !open ? "page" : undefined} onClick={() => setOpen(!open)}>
        <span aria-hidden="true">☰</span> More
      </button>
      {open && (
        <>
          <div className="tab-more-scrim" onClick={() => setOpen(false)} />
          <nav className="tab-more-sheet" aria-label="All crew sections">
            {items.map((i) => (
              <Link key={i.href} href={i.href} aria-current={here(i.href) ? "page" : undefined} onClick={() => setOpen(false)}>
                {i.label}
              </Link>
            ))}
          </nav>
        </>
      )}
    </>
  );
}
