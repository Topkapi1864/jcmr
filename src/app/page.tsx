import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, ready, schema } from "@/db/client";
import { PublicShell } from "@/components/shells";
import { Holding } from "@/components/holding";
import { Badge } from "@/components/logo";
import { FollowLive, Updates } from "@/components/follow-live";
import { gate, publicMetadata } from "@/lib/public";
import { getSetting, JUSTGIVING_URL } from "@/lib/settings";
import { renderMarkdown } from "@/lib/util";
import { livePayload } from "@/lib/live";
import { fmtPounds } from "@/lib/donate";

export const dynamic = "force-dynamic";
export const generateMetadata = () => publicMetadata();

const initials = (n: string) =>
  n
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const g = await gate(await searchParams);
  if (g.holding) return <Holding />;
  const strap = await getSetting("site.strapline");
  await ready();
  const content = Object.fromEntries((await db.select().from(schema.content).all()).map((c) => [c.key, c.md]));
  const intro = content.home_intro_md ?? "";
  const words = (content.family_words_md ?? "").trim();
  const riders = await db.select().from(schema.riders).orderBy(schema.riders.sortOrder).all();
  const live = await livePayload();
  const total = live.total;
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
      <section className="section" id="live">
        <FollowLive initial={live} />
      </section>

      <section className="section">
        <h2>The riders</h2>
        <div className="rider-cards">
          {riders.map((r) => {
            const lr = live.riders.find((x) => x.id === r.id);
            return (
              <article key={r.id} className="card rider-card" style={{ alignItems: "center" }}>
                {r.photoAsset ? <img className="avatar" src={r.photoAsset} alt="" /> : <div className="avatar" aria-hidden="true">{initials(r.displayName)}</div>}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 16 }}>{r.displayName}</div>
                  {lr?.bio && <div className="small muted" style={{ marginTop: 2 }}>{lr.bio}</div>}
                  <div className="mono xs" style={{ marginTop: 6, color: "var(--color-link)" }}>
                    {lr?.link ? (
                      <a href={lr.link} target="_blank" rel="noopener">
                        Live map ↗
                      </a>
                    ) : (
                      <Link href="/riders">About {r.displayName.split(" ")[0]} →</Link>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="section two-col">
        <div>
          <h2 style={{ marginBottom: 6 }}>Updates from the crew</h2>
          <Updates initial={live} />
        </div>
        <div className="donate-card" id="donate">
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

      <section className="section" style={{ paddingTop: 36 }}>
        <h2>Janet</h2>
        <div className="photo-grid">
          <img src="/photos/janet-beach.jpg" alt="Janet laughing by the sea" />
          <img src="/photos/janet-garden.jpg" alt="Janet in the garden" style={{ objectPosition: "50% 25%" }} />
          <img src="/photos/janet-wine.jpg" alt="Janet raising a glass" style={{ objectPosition: "50% 20%" }} />
          <div className="family-words">
            <div className="label">Family&rsquo;s words</div>
            {words ? (
              <div className="words prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(words) }} />
            ) : (
              <div className="words muted">
                Janet Channon, 1945–2024. <Link href="/mum">Read about Mum →</Link>
              </div>
            )}
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
