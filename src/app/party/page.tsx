import Link from "next/link";
import { PublicShell } from "@/components/shells";
import { Holding } from "@/components/holding";
import { gate, publicMetadata } from "@/lib/public";

export const dynamic = "force-dynamic";
export const generateMetadata = () => publicMetadata("The Destination Party");

const CEMETERY_MAP = "https://www.google.com/maps/search/?api=1&query=Yeadon+Cemetery%2C+Yeadon%2C+Leeds";
const CLUB_MAP = "https://www.google.com/maps/search/?api=1&query=Yeadon+Cricket+Club%2C+High+Street%2C+Yeadon+LS19+7TA";

// The finish and what follows it ("The party" in the top nav): the ride ends
// at Yeadon Cemetery, then everyone goes on to Yeadon Cricket Club, where
// Sarah hosts the reception from 3.30pm. The invitation is in Sarah's words.
export default async function PartyPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const g = await gate(await searchParams);
  if (g.holding) return <Holding />;

  return (
    <PublicShell preview={g.preview} liveActive={g.liveActive}>
      <header className="section">
        <div className="dates">Sunday 15 November 2026 · Yeadon</div>
        <h1 className="page-title">The Destination Party</h1>
        <p className="prose">
          The ride finishes at Yeadon Cemetery, where Mum is buried. From there we go on to Yeadon Cricket Club, where our sister Sarah is hosting the
          reception party from 3.30pm onwards.
        </p>
      </header>

      <div className="party-grid">
        <section className="card party-card" aria-labelledby="party-finish-heading">
          <img src="/photos/yeadon-cemetery.jpg" alt="Yeadon Cemetery: headstones on a grassy slope, with a row of trees along the top" />
          <div className="party-body">
            <div className="label">First · the finish</div>
            <h2 id="party-finish-heading">Yeadon Cemetery</h2>
            <p>
              The last of the 240 miles brings the four riders to Mum&rsquo;s grave, in the town she came from, on the second anniversary of losing her.
            </p>
            <p className="party-links">
              <Link href="/route">When they are due →</Link>
              <a href={CEMETERY_MAP} target="_blank" rel="noopener">
                Map ↗
              </a>
            </p>
          </div>
        </section>

        <section className="card party-card" aria-labelledby="party-club-heading">
          <img src="/photos/yeadon-cricket-club.jpg" alt="The pavilion at Yeadon Cricket Club, seen across the ground" />
          <div className="party-body">
            <div className="label">Then · the party</div>
            <h2 id="party-club-heading">Yeadon Cricket Club</h2>
            <p>Doors open from 3.30pm, with hot food and a licensed bar. Sarah is hosting.</p>
            <p className="party-links">
              <a href={CLUB_MAP} target="_blank" rel="noopener">
                Map ↗
              </a>
            </p>
          </div>
        </section>
      </div>

      <section className="section" aria-labelledby="party-words-heading">
        <h2 id="party-words-heading">From Sarah</h2>
        <blockquote className="party-words">
          The doors are open from 3.30pm onwards for food and a licensed bar, to commemorate our Mum on the second anniversary of losing her, and to
          welcome the riders and their support team on their completion of the most gruelling and challenging of bike rides, with some hot food and a
          lot of love.
        </blockquote>
      </section>

      <section className="section" aria-labelledby="party-details-heading">
        <h2 id="party-details-heading">The details</h2>
        <dl className="card card-lg party-details">
          <div>
            <dt className="label">When</dt>
            <dd>Sunday 15 November 2026, doors open from 3.30pm</dd>
          </div>
          <div>
            <dt className="label">Where</dt>
            <dd>
              Yeadon Cricket Club, High Street, Yeadon, Leeds LS19 7TA. The ground is behind the White Swan.{" "}
              <a href={CLUB_MAP} target="_blank" rel="noopener">
                Open the map ↗
              </a>
            </dd>
          </div>
          <div>
            <dt className="label">Food and drink</dt>
            <dd>Hot food and a licensed bar</dd>
          </div>
          <div>
            <dt className="label">Your host</dt>
            <dd>Sarah, our sister</dd>
          </div>
        </dl>
      </section>

      <p className="small muted party-credit">
        Photo of the pavilion: &copy; Betty Longbottom,{" "}
        <a href="https://www.geograph.org.uk/photo/2878332" target="_blank" rel="noopener">
          geograph.org.uk
        </a>
        , licensed under{" "}
        <a href="https://creativecommons.org/licenses/by-sa/2.0/" target="_blank" rel="noopener">
          CC BY-SA 2.0
        </a>
        .
      </p>
    </PublicShell>
  );
}
