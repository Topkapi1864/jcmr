import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, ready, schema } from "@/db/client";
import { PublicShell } from "@/components/shells";
import { Holding } from "@/components/holding";
import { gate, publicMetadata } from "@/lib/public";
import { getSetting } from "@/lib/settings";
import { renderMarkdown } from "@/lib/util";

export const dynamic = "force-dynamic";
export const generateMetadata = () => publicMetadata();

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const g = await gate(await searchParams);
  if (g.holding) return <Holding />;
  const strap = await getSetting("site.strapline");
  await ready();
  const intro = (await db.select().from(schema.content).where(eq(schema.content.key, "home_intro_md")).get())?.md ?? "";

  return (
    <PublicShell preview={g.preview} liveActive={g.liveActive}>
      {g.liveActive && (
        <Link href="/live" className="live-strip">
          <span>They&rsquo;re riding now — follow live</span>
          <span>→</span>
        </Link>
      )}
      <section className="hero">
        <p className="dates">Saturday 14 – Sunday 15 November 2026</p>
        <h1>The Janet Channon Memorial Ride</h1>
        <p className="strap">{strap}</p>
        {intro && <div className="prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(intro) }} />}
      </section>
      <nav className="tiles" aria-label="Sections">
        <Link href="/mum" className="tile">
          <h2>Mum</h2>
          <p>Janet Channon, 1945–2024</p>
        </Link>
        <Link href="/riders" className="tile">
          <h2>The riders</h2>
          <p>Four of us</p>
        </Link>
        <Link href="/route" className="tile">
          <h2>The route</h2>
          <p>London to Yorkshire, two days</p>
        </Link>
        <Link href="/donate" className="tile">
          <h2>Give</h2>
          <p>For the Royal British Legion</p>
        </Link>
      </nav>
    </PublicShell>
  );
}
