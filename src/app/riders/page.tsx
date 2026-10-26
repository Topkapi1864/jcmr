import { PublicShell } from "@/components/shells";
import { Holding } from "@/components/holding";
import { gate, publicMetadata } from "@/lib/public";
import { listRiders } from "@/lib/riders";
import { renderMarkdown } from "@/lib/util";

export const dynamic = "force-dynamic";
export const generateMetadata = () => publicMetadata("The riders");

const initials = (n: string) =>
  n
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export default async function RidersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const g = await gate(await searchParams);
  if (g.holding) return <Holding />;
  // sortOrder puts Gary and Simon first, so the 2×2 grid has the brothers on the top row.
  const riders = await listRiders();

  return (
    <PublicShell preview={g.preview} liveActive={g.liveActive}>
      <header className="section">
        <div className="dates">14–15 November 2026 · 240 miles</div>
        <h1 className="page-title">The riders</h1>
        <p className="prose">Four of us, riding as one.</p>
      </header>
      <div className="rider-grid mt-4">
        {riders.map((r) => (
          <article key={r.id} className="rider-profile">
            {r.photoAsset ? (
              <img className="rider-profile-photo" src={r.photoAsset} alt={r.displayName} />
            ) : (
              <div className="rider-profile-photo rider-profile-placeholder" aria-hidden="true">
                {initials(r.displayName)}
              </div>
            )}
            <div className="rider-profile-head">
              <h2>{r.displayName}</h2>
              {r.stravaUrl && (
                <a className="rider-profile-strava" href={r.stravaUrl} target="_blank" rel="noopener">
                  On Strava →
                </a>
              )}
            </div>
            <div className="rider-profile-bio">
              {r.bioMd ? <div dangerouslySetInnerHTML={{ __html: renderMarkdown(r.bioMd) }} /> : <p className="muted">Bio to come.</p>}
            </div>
          </article>
        ))}
      </div>
    </PublicShell>
  );
}
