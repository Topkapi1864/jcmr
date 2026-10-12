import Link from "next/link";
import { NavLink } from "./nav-link";
import { JUSTGIVING_URL } from "@/lib/constants";

// The three shells (spec §3.4). Design drops in here: header, footer, nav.

const PUBLIC_NAV = [
  { href: "/mum", label: "Mum" },
  { href: "/riders", label: "The riders" },
  { href: "/route", label: "The route" },
  { href: "/donate", label: "Give" },
];

export function PublicShell({
  children,
  preview,
  liveActive,
}: {
  children: React.ReactNode;
  preview?: boolean;
  liveActive?: boolean;
}) {
  return (
    <div data-shell="public">
      {preview && (
        <div className="preview-banner">
          <div className="container row-between">
            <span>
              Crew preview — the public still sees the holding page. <Link href="/?holding=1">See the holding page</Link>
            </span>
            <Link href="/crew">Back to the board</Link>
          </div>
        </div>
      )}
      <header className="shell-header">
        <div className="container">
          <Link href="/" className="brand">
            JCMR
          </Link>
          <nav className="nav" aria-label="Site">
            {PUBLIC_NAV.map((n) => (
              <NavLink key={n.href} href={n.href}>
                {n.label}
              </NavLink>
            ))}
            {liveActive && <NavLink href="/live">Live</NavLink>}
          </nav>
          <a className="btn btn-primary btn-sm" href={JUSTGIVING_URL} target="_blank" rel="noopener">
            Give on JustGiving
          </a>
        </div>
      </header>
      <main className="shell-main">
        <div className="container">{children}</div>
      </main>
      <footer className="shell-footer">
        <div className="container row-between">
          <span>The Janet Channon Memorial Ride · 14–15 November 2026</span>
          <span>
            In memory of Janet Channon, 1945–2024 · <a href={JUSTGIVING_URL}>Royal British Legion</a>
          </span>
        </div>
      </footer>
    </div>
  );
}

const CREW_NAV = [
  { href: "/crew", label: "Mine" },
  { href: "/crew/stale", label: "Stale" },
  { href: "/crew/area", label: "By area" },
  { href: "/crew/owner", label: "By owner" },
  { href: "/crew/due", label: "By due" },
  { href: "/crew/live", label: "Live" },
];

export function CrewShell({
  children,
  name,
  isAdmin,
}: {
  children: React.ReactNode;
  name: string;
  isAdmin: boolean;
}) {
  return (
    <div data-shell="crew">
      <header className="shell-header">
        <div className="container">
          <Link href="/crew" className="brand">
            JCMR crew
          </Link>
          <nav className="nav" aria-label="Crew">
            {CREW_NAV.map((n) => (
              <NavLink key={n.href} href={n.href}>
                {n.label}
              </NavLink>
            ))}
            {isAdmin && (
              <NavLink href="/crew/admin" exact={false}>
                Admin
              </NavLink>
            )}
          </nav>
          <form action="/crew/signout" method="post" className="row">
            <span className="small muted">{name}</span>
            <button className="btn btn-sm btn-quiet" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="shell-main">
        <div className="container">{children}</div>
      </main>
    </div>
  );
}

export function TvShell({ children }: { children: React.ReactNode }) {
  return <div data-shell="tv">{children}</div>;
}
