import Link from "next/link";
import { NavLink } from "@/components/nav-link";

export const VIEWS = [
  { href: "/mum/album/wall", label: "The wall", blurb: "Every photograph at once, in the order she lived them." },
  { href: "/mum/album/mosaic", label: "The mosaic", blurb: "One portrait made of all of them. Hover or tap a tile to see which one." },
  { href: "/mum/album/years", label: "The years", blurb: "Year by year, from the first scans to the last summer." },
  { href: "/mum/album/people", label: "Her people", blurb: "The faces that keep turning up beside her, found by the computer, unnamed." },
  { href: "/mum/album/moments", label: "The moments", blurb: "Christmases, birthdays, holidays, the garden, the table." },
  { href: "/mum/album/laughing", label: "Laughing", blurb: "Only the ones where she is laughing." },
  { href: "/mum/album/colours", label: "The colours", blurb: "The whole album sorted by colour, and the palette of her life." },
  { href: "/mum/album/cameras", label: "The cameras", blurb: "Scans, a Leica, a BlackBerry, twelve iPhones and a folding Samsung." },
  { href: "/mum/album/miles", label: "Every mile", blurb: "Her life laid along the route: the earliest pictures in London, the last in Yeadon." },
];

export function AlbumNav() {
  return (
    <nav className="album-nav" aria-label="Album views">
      <Link href="/mum/album" className="album-nav-home">
        The album
      </Link>
      {VIEWS.map((v) => (
        <NavLink key={v.href} href={v.href}>
          {v.label}
        </NavLink>
      ))}
    </nav>
  );
}

export function AlbumHeader({ title, count, children }: { title: string; count?: number; children?: React.ReactNode }) {
  return (
    <header className="section album-head">
      <div className="dates">Janet Channon · 1945 – 2024{count != null ? ` · ${count.toLocaleString("en-GB")} photographs` : ""}</div>
      <h1 className="page-title">{title}</h1>
      {children}
    </header>
  );
}
