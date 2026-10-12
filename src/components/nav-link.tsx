"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, children, exact = true }: { href: string; children: React.ReactNode; exact?: boolean }) {
  const path = usePathname();
  const current = exact ? path === href : path === href || path.startsWith(href + "/");
  return (
    <Link href={href} aria-current={current ? "page" : undefined}>
      {children}
    </Link>
  );
}
