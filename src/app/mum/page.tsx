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
        <header className="hero" style={{ paddingBottom: 0 }}>
          <h1>Janet Channon</h1>
          <p className="dates">25 July 1945 – 15 November 2024</p>
        </header>
        {photo?.path && <img className="mum-photo" src={photo.path} alt="Janet Channon" />}
        <div className="prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(story) }} />
        <p>
          <a className="btn btn-primary" href={JUSTGIVING_URL} target="_blank" rel="noopener">
            Give in her memory on JustGiving
          </a>
        </p>
      </article>
    </PublicShell>
  );
}
