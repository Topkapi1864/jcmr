import Link from "next/link";
import { PublicShell } from "@/components/shells";
import { Holding } from "@/components/holding";
import { GivingChart } from "@/components/giving-chart";
import { gate, publicMetadata } from "@/lib/public";
import { JUSTGIVING_URL } from "@/lib/settings";
import { fmtPounds, getDonateTotal, getDonations, PAGE_OPENED } from "@/lib/donate";
import { fmtTime, londonDate, TZ } from "@/lib/time";

export const dynamic = "force-dynamic";
export const generateMetadata = () => publicMetadata("Charity");

const DEFAULT_TARGET = 5000;
const fmtDate = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short" }).format(new Date(iso));

export default async function DonatePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const g = await gate(await searchParams);
  if (g.holding) return <Holding />;
  const [total, feed] = await Promise.all([getDonateTotal(), getDonations()]);
  const target = total.target ?? DEFAULT_TARGET;
  const gifts = feed.donations;
  const amount = total.amount ?? gifts.reduce((n, d) => n + (d.amount ?? 0), 0);
  const words = [...gifts].reverse().filter((d) => d.message).slice(0, 4);
  const count = total.count ?? gifts.length;

  return (
    <PublicShell preview={g.preview} liveActive={g.liveActive}>
      <header className="section">
        <div className="dates">In Janet’s name</div>
        <h1 className="page-title">Charity</h1>
        <p className="prose">
          We are riding for the Royal British Legion, in Mum&rsquo;s name. Every gift goes straight to them through JustGiving, and your message sits on
          the donor wall there.
        </p>
      </header>

      <div className="give-grid">
        <section className="charity-card" aria-labelledby="charity-heading">
          <a className="charity-logo" href="https://www.britishlegion.org.uk" target="_blank" rel="noopener" aria-label="The Royal British Legion website">
            <img src="/charity/rbl-logo.png" alt="The Royal British Legion" />
          </a>
          <h2 id="charity-heading">The Royal British Legion</h2>
          <div className="prose">
            <p>
              The Legion has looked after the Armed Forces community since 1921: serving men and women, veterans and their families, with practical help,
              money advice, care homes and friendship, and the Poppy Appeal every November. The ride finishes on 15 November, a week after Remembrance
              Sunday.
            </p>
            <div className="charity-why">
              <p>
                Mum and Dad both served in the Royal Navy before they had children, and the Forces stayed part of the family&rsquo;s story ever after. On
                her last Remembrance Sunday Mum sat up in bed, wearing her poppy, to watch the service at the Cenotaph. When we decided to do something
                in her memory, there was only ever one charity.
              </p>
              <p>
                <Link href="/mum">Read Mum&rsquo;s story →</Link>
              </p>
            </div>
          </div>
          <div className="charity-numbers">Registered charity 219279 (England and Wales) and SC054446 (Scotland)</div>
        </section>

        <div className="stack">
          <a className="btn-donate btn-donate-big" href={JUSTGIVING_URL} target="_blank" rel="noopener" style={{ width: "100%" }}>
            Give on JustGiving
          </a>
          <section className="card card-lg">
            <div className="label">Raised so far</div>
            <div className="total">{fmtPounds(amount)}</div>
            <div className="small muted">
              {`of a ${fmtPounds(target)} target`}
              {count ? ` · ${count} gifts` : ""}
              {total.fetchedAt ? ` · as of ${fmtTime(total.fetchedAt)}` : ""}
            </div>
          </section>
          <p className="small muted">
            Gift Aid adds 25p to every pound from a UK taxpayer, at no cost to you. Prefer the full page, the messages and the total straight from the
            source?{" "}
            <a href={JUSTGIVING_URL} target="_blank" rel="noopener">
              Open the JustGiving page
            </a>
            .
          </p>
        </div>
      </div>

      <section className="section" aria-labelledby="chart-heading">
        <h2 id="chart-heading">Gift by gift</h2>
        <p className="prose">
          Every gift since the page opened, each one stacked on the last. Hover a block to see who gave and when.
        </p>
        <GivingChart total={amount} target={target} donations={gifts} opened={PAGE_OPENED} today={londonDate()} />
      </section>

      {words.length > 0 && (
        <section className="section" aria-labelledby="words-heading">
          <h2 id="words-heading">Latest words from the wall</h2>
          <div className="give-words">
            {words.map((d, i) => (
              <article key={i} className="card give-word">
                <blockquote>{d.message}</blockquote>
                <div className="who small muted">
                  <span>{d.name}</span>
                  <span className="mono">
                    {d.amount !== null ? fmtPounds(d.amount) + " · " : ""}
                    {fmtDate(d.at)}
                  </span>
                </div>
              </article>
            ))}
          </div>
          <p className="small muted" style={{ marginTop: 12 }}>
            All {count} messages are on{" "}
            <a href={JUSTGIVING_URL} target="_blank" rel="noopener">
              the JustGiving page
            </a>
            .
          </p>
        </section>
      )}
    </PublicShell>
  );
}
