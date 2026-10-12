import { db, ready, schema } from "@/db/client";
import { PublicShell } from "@/components/shells";
import { Holding } from "@/components/holding";
import { gate, publicMetadata } from "@/lib/public";
import { renderMarkdown } from "@/lib/util";

export const dynamic = "force-dynamic";
export const generateMetadata = () => publicMetadata("The riders");

export default async function RidersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const g = await gate(await searchParams);
  if (g.holding) return <Holding />;
  await ready();
  const riders = await db.select().from(schema.riders).orderBy(schema.riders.sortOrder).all();

  return (
    <PublicShell preview={g.preview} liveActive={g.liveActive}>
      <header className="hero" style={{ paddingBottom: 0 }}>
        <h1>The riders</h1>
        <p className="strap">Four of us, riding as one.</p>
      </header>
      <div className="rider-cards mt-4">
        {riders.map((r) => (
          <article key={r.id} className="card">
            {r.photoAsset ? <img className="rider-photo" src={r.photoAsset} alt={r.displayName} /> : <div className="rider-photo" aria-hidden="true" />}
            <h2>{r.displayName}</h2>
            {r.bioMd ? <div className="prose small" dangerouslySetInnerHTML={{ __html: renderMarkdown(r.bioMd) }} /> : <p className="muted small">Bio to come.</p>}
            {r.stravaUrl && (
              <p className="small">
                <a href={r.stravaUrl} target="_blank" rel="noopener">
                  On Strava →
                </a>
              </p>
            )}
          </article>
        ))}
      </div>
    </PublicShell>
  );
}
