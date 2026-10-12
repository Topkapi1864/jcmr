import { db, ready, schema } from "@/db/client";
import { PublicShell } from "@/components/shells";
import { Holding } from "@/components/holding";
import { gate, publicMetadata } from "@/lib/public";
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
  await ready();
  const riders = await db.select().from(schema.riders).orderBy(schema.riders.sortOrder).all();

  return (
    <PublicShell preview={g.preview} liveActive={g.liveActive}>
      <header className="section">
        <div className="dates">14–15 November 2026 · 240 miles</div>
        <h1 className="page-title">The riders</h1>
        <p className="prose">Four of us, riding as one.</p>
      </header>
      <div className="rider-cards mt-4">
        {riders.map((r) => (
          <article key={r.id} className="card rider-card">
            {r.photoAsset ? <img className="avatar" src={r.photoAsset} alt="" /> : <div className="avatar" aria-hidden="true">{initials(r.displayName)}</div>}
            <div style={{ minWidth: 0 }}>
              <h3 style={{ fontFamily: "inherit", fontSize: "var(--text-md)", margin: "0 0 2px" }}>{r.displayName}</h3>
              {r.bioMd ? <div className="prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(r.bioMd) }} /> : <p className="muted small">Bio to come.</p>}
              {r.stravaUrl && (
                <p className="small mono" style={{ margin: 0 }}>
                  <a href={r.stravaUrl} target="_blank" rel="noopener">
                    On Strava →
                  </a>
                </p>
              )}
            </div>
          </article>
        ))}
      </div>
    </PublicShell>
  );
}
