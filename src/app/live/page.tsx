import { PublicShell } from "@/components/shells";
import { Holding } from "@/components/holding";
import { gate, publicMetadata } from "@/lib/public";
import { livePayload } from "@/lib/live";
import { FollowLive, Updates } from "@/components/follow-live";
import { JUSTGIVING_URL } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const generateMetadata = () => publicMetadata("Live");

export default async function LivePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const g = await gate(await searchParams);
  if (g.holding) return <Holding />;
  const initial = await livePayload();
  const pounds = initial.total.amount === null ? "—" : "£" + initial.total.amount.toLocaleString("en-GB");
  return (
    <PublicShell preview={g.preview} liveActive={g.liveActive}>
      <div className="stack section">
        <FollowLive initial={initial} showLinks />
        <section className="two-col">
          <div>
            <h2 style={{ marginBottom: 6 }}>Messages from the crew</h2>
            <Updates initial={initial} fold={12} />
          </div>
          <section className="donate-card">
            <div className="label">Raised so far</div>
            <div className="total" style={{ color: "var(--duck-egg)", margin: "8px 0 14px" }}>{pounds}</div>
            <a className="btn-donate btn-donate-big" href={JUSTGIVING_URL} target="_blank" rel="noopener">
              Give on JustGiving
            </a>
          </section>
        </section>
      </div>
    </PublicShell>
  );
}
