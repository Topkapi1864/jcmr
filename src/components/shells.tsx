import Link from "next/link";
import { NavLink } from "./nav-link";
import { Lockup } from "./logo";
import { TabMore } from "./tab-more";
import { JUSTGIVING_URL } from "@/lib/constants";

// The three shells (spec §3.4), in the JCMR identity (design handoff v1).

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
  hero,
}: {
  children: React.ReactNode;
  preview?: boolean;
  liveActive?: boolean;
  hero?: React.ReactNode;
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
      <header className="pub-header">
        <div className="container">
          <Link href="/" className="lockup" aria-label="JCMR home">
            <Lockup />
          </Link>
          <nav className="pub-nav" aria-label="Site">
            {PUBLIC_NAV.map((n) => (
              <NavLink key={n.href} href={n.href}>
                {n.label}
              </NavLink>
            ))}
            {liveActive && <NavLink href="/live">Live</NavLink>}
          </nav>
          <a className="btn-donate" href={JUSTGIVING_URL} target="_blank" rel="noopener">
            Donate
          </a>
        </div>
      </header>
      {hero}
      <main className="pub-main">
        <div className="container">{children}</div>
      </main>
      <footer className="pub-footer">
        <div className="container">
          <div className="memorial-line">In memory of Janet Channon · 15 November 2024</div>
          <div>
            Royal British Legion, registered charity 219279 (England and Wales) and SC054446 (Scotland) · <Link href="/crew">Crew</Link>
          </div>
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
  { href: "/crew/people", label: "Crew" },
  { href: "/crew/kit", label: "Kit" },
  { href: "/crew/sleeping", label: "Sleeping" },
  { href: "/crew/vehicles", label: "Vehicles" },
  { href: "/crew/route", label: "Route" },
  { href: "/crew/live", label: "Live" },
];
// Phone tab bar: four fixed tabs, then "More" for every section.
const TAB_FEATURED = ["/crew", "/crew/kit", "/crew/people", "/crew/route"];
const SECTION_ROOTS = ["/crew/admin", "/crew/people", "/crew/kit", "/crew/sleeping", "/crew/vehicles", "/crew/route"];

export function CrewShell({
  children,
  name,
  isAdmin,
}: {
  children: React.ReactNode;
  name: string;
  isAdmin: boolean;
}) {
  const nav = isAdmin ? [...CREW_NAV, { href: "/crew/admin", label: "Admin" }] : CREW_NAV;
  return (
    <div data-shell="crew" className="crew">
      <nav className="rail" aria-label="Crew">
        <div className="rail-top">
          <Lockup onDark size="lg" />
          <div className="label">Crew · 14–15 Nov 2026</div>
        </div>
        <div className="rail-nav">
          {nav.map((n) => (
            <NavLink key={n.href} href={n.href} exact={!SECTION_ROOTS.includes(n.href)}>
              {n.label}
            </NavLink>
          ))}
        </div>
        <div className="rail-foot">
          <img src="/photos/janet-garden.jpg" alt="Janet" />
          <div>
            <div className="for">For Janet</div>
            <div className="date">15 November 2024</div>
          </div>
        </div>
      </nav>
      <div className="crew-main">
        <header className="crew-head">
          <div>
            <h1>JCMR crew</h1>
            <div className="sub">The job board — one owner, a due date, what it&rsquo;s waiting on.</div>
          </div>
          <form action="/crew/signout" method="post" className="crew-who">
            <span className="name">{name}</span>
            <button className="btn btn-sm" type="submit">
              Sign out
            </button>
          </form>
        </header>
        <main className="crew-body">{children}</main>
      </div>
      <nav className="tabbar" aria-label="Crew">
        {TAB_FEATURED.map((h) => CREW_NAV.find((n) => n.href === h)!).map((n) => (
          <NavLink key={n.href} href={n.href} exact={!SECTION_ROOTS.includes(n.href)}>
            {n.label}
          </NavLink>
        ))}
        <TabMore items={nav} featured={TAB_FEATURED} />
      </nav>
    </div>
  );
}

export function TvShell({ children }: { children: React.ReactNode }) {
  return <div data-shell="tv">{children}</div>;
}
