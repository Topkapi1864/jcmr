import { eq } from "drizzle-orm";
import { db, ready, schema } from "@/db/client";
import { PublicShell } from "@/components/shells";
import { Holding } from "@/components/holding";
import { gate, publicMetadata } from "@/lib/public";
import { JUSTGIVING_URL } from "@/lib/settings";
import { renderMarkdown } from "@/lib/util";

export const dynamic = "force-dynamic";
export const generateMetadata = () => publicMetadata("Mum");

export default async function MumPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const g = await gate(await searchParams);
  if (g.holding) return <Holding />;
  await ready();
  const story = (await db.select().from(schema.content).where(eq(schema.content.key, "mum_story_md")).get())?.md ?? "";
  const photo = await db.select().from(schema.assets).where(eq(schema.assets.kind, "mum_photo")).get();

  return (
    <PublicShell preview={g.preview} liveActive={g.liveActive}>
      <article className="stack">
        <header className="section">
          <div className="dates">25 July 1945 – 15 November 2024</div>
          <h1 className="page-title">Janet Channon</h1>
        </header>
        {photo?.path && <img className="mum-photo" src={photo.path} alt="Janet Channon" />}
        <div className="prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(story) }} />
        <div className="photo-grid" style={{ maxWidth: "48rem" }}>
          <img src="/photos/janet-beach.jpg" alt="Janet laughing by the sea" />
          <img src="/photos/janet-garden.jpg" alt="Janet in the garden" style={{ objectPosition: "50% 25%" }} />
          <img src="/photos/janet-wine.jpg" alt="Janet raising a glass" style={{ objectPosition: "50% 20%" }} />
        </div>
        <p>
          <a className="btn-donate btn-donate-big" href={JUSTGIVING_URL} target="_blank" rel="noopener">
            Give in her memory on JustGiving
          </a>
        </p>
      </article>
    </PublicShell>
  );
}
