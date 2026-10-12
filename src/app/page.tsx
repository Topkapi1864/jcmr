import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, ready, schema } from "@/db/client";
import { PublicShell } from "@/components/shells";
import { Holding } from "@/components/holding";
import { Badge } from "@/components/logo";
import { gate, publicMetadata } from "@/lib/public";
import { getSetting, JUSTGIVING_URL } from "@/lib/settings";
import { renderMarkdown } from "@/lib/util";
import { getDonateTotal, fmtPounds } from "@/lib/donate";

export const dynamic = "force-dynamic";
export const generateMetadata = () => publicMetadata();

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const g = await gate(await searchParams);
  if (g.holding) return <Holding />;
  const strap = await getSetting("site.strapline");
  await ready();
  const intro = (await db.select().from(schema.content).where(eq(schema.content.key, "home_intro_md")).get())?.md ?? "";
  const riders = await db.select().from(schema.riders).orderBy(schema.riders.sortOrder).all();
  const total = await getDonateTotal();
  const ridersLine = riders.map((r) => r.displayName).join(", ").replace(/, ([^,]*)$/, " and $1");

  const hero = (
    <section className="hero-band">
      <div className="container">
        <div className="hero-photo">
          <img src="/photos/janet-kitchen.jpg" alt="Janet in her kitchen, bringing two mugs of tea" />
          <Badge className="hero-badge" />
        </div>
        <div>
          <div className="eyebrow">14–15 November 2026 · Barnes to Yeadon · 240 miles</div>
          <h1>{strap}</h1>
          {intro ? <div className="lede" dangerouslySetInnerHTML={{ __html: renderMarkdown(intro) }} /> : null}
          {ridersLine && <p className="riders-line">{ridersLine}.</p>}
        </div>
      </div>
    </section>
  );

  return (
    <PublicShell preview={g.preview} liveActive={g.liveActive} hero={hero}>
      {g.liveActive && (
        <Link href="/live" className="live-strip">
          <span>They&rsquo;re riding now — follow live</span>
          <span>→</span>
        </Link>
      )}

      <section className="section">
        <nav className="tiles" aria-label="Sections">
          <Link href="/mum" className="tile">
            <span className="eyebrow">Mum</span>
            <h2>Janet Channon</h2>
            <p>1945–2024, and why we&rsquo;re riding</p>
          </Link>
          <Link href="/riders" className="tile">
            <span className="eyebrow">Who</span>
            <h2>The riders</h2>
            <p>Four of us, riding as one</p>
          </Link>
          <Link href="/route" className="tile">
            <span className="eyebrow">Where</span>
            <h2>The route</h2>
            <p>London to Yorkshire, two days</p>
          </Link>
          <Link href="/donate" className="tile">
            <span className="eyebrow">Give</span>
            <h2>Royal British Legion</h2>
            <p>{total.amount !== null ? `${fmtPounds(total.amount)} raised so far` : "Every pound goes to the Legion"}</p>
          </Link>
        </nav>
      </section>

      <section className="section two-col">
        <div>
          <h2>Janet</h2>
          <div className="photo-grid">
            <img src="/photos/janet-beach.jpg" alt="Janet laughing by the sea" />
            <img src="/photos/janet-garden.jpg" alt="Janet in the garden" style={{ objectPosition: "50% 25%" }} />
            <img src="/photos/janet-wine.jpg" alt="Janet raising a glass" style={{ objectPosition: "50% 20%" }} />
          </div>
        </div>
        <div className="donate-card">
          <div className="label">In Janet&rsquo;s name</div>
          <h2>Donate to the Royal British Legion</h2>
          <p>Every mile is for Mum, and every pound goes to the Legion. The ride finishes at her grave in Yeadon on 15 November, two years on.</p>
          <a className="btn-donate btn-donate-big" href={JUSTGIVING_URL} target="_blank" rel="noopener">
            Give on JustGiving
          </a>
          <div className="fine">
            {total.amount !== null && <>{fmtPounds(total.amount)} raised so far{total.target ? ` of ${fmtPounds(total.target)}` : ""}. </>}
            Royal British Legion is a registered charity, 219279 (England and Wales) and SC054446 (Scotland).
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
