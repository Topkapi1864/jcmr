import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, ready, schema } from "@/db/client";
import { requireAdmin } from "@/lib/auth";
import { bioFileFor, hasBioFile, listRiders } from "@/lib/riders";
import { saveContent, saveMumPhoto, saveRider } from "../actions";

export default async function ContentPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  await ready();
  const content = Object.fromEntries((await db.select().from(schema.content).all()).map((c) => [c.key, c.md]));
  const riders = await listRiders();
  const mum = await db.select().from(schema.assets).where(eq(schema.assets.kind, "mum_photo")).get();

  return (
    <div className="stack" style={{ maxWidth: "44rem" }}>
      <Link href="/crew/admin" className="small">
        ← Admin
      </Link>
      <h1>Content</h1>
      {sp.saved && <p className="notice">Saved.</p>}
      <p className="muted small">
        Markdown. Photos are files in the repo under <code>public/photos/</code> — put the file there and type its path here (e.g. <code>/photos/mum.jpg</code>).
      </p>

      <form action={saveContent} className="card stack-sm">
        <h2>Words</h2>
        <label className="field">
          <span>Home — one paragraph of what this is</span>
          <textarea name="home_intro_md" rows={4} defaultValue={content.home_intro_md ?? ""} />
        </label>
        <label className="field">
          <span>Mum — Simon&rsquo;s &ldquo;our story&rdquo; (the JustGiving text, as written)</span>
          <textarea name="mum_story_md" rows={14} defaultValue={content.mum_story_md ?? ""} />
        </label>
        <label className="field">
          <span>Home — the family&rsquo;s words about Mum (a few lines, shown beside her photos)</span>
          <textarea name="family_words_md" rows={4} defaultValue={content.family_words_md ?? ""} placeholder="A few lines about Mum from Gary and Simon, in your own words." />
        </label>
        <button className="btn btn-primary" type="submit">
          Save words
        </button>
      </form>

      <form action={saveMumPhoto} className="card stack-sm">
        <h2>Mum&rsquo;s photograph</h2>
        <div className="form-inline">
          <label className="field">
            <span>Path</span>
            <input type="text" name="path" defaultValue={mum?.path ?? ""} placeholder="/photos/mum.jpg" />
          </label>
          <label className="field">
            <span>Chosen by</span>
            <input type="text" name="chosenBy" defaultValue={mum?.chosenBy ?? "Simon"} />
          </label>
          <button className="btn" type="submit">
            Save
          </button>
        </div>
      </form>

      <h2>The riders</h2>
      {riders.map((r) => (
        <form key={r.id} action={saveRider} className="card stack-sm">
          <input type="hidden" name="id" value={r.id} />
          <div className="form-inline">
            <label className="field">
              <span>Display name</span>
              <input type="text" name="displayName" defaultValue={r.displayName} required />
            </label>
            <label className="field">
              <span>Strava profile URL</span>
              <input type="url" name="stravaUrl" defaultValue={r.stravaUrl ?? ""} />
            </label>
            <label className="field">
              <span>Photo path</span>
              <input type="text" name="photoAsset" defaultValue={r.photoAsset ?? ""} placeholder="/photos/gary.jpg" />
            </label>
          </div>
          <label className="field">
            <span>Bio in the rider&rsquo;s own words (≤120 words)</span>
            <textarea name="bioMd" rows={5} defaultValue={r.bioMd} />
          </label>
          {hasBioFile(r) ? (
            <p className="muted small">
              A committed copy lives at <code>{bioFileFor(r)}</code>: the site follows that file until a change is saved here, after which this box is the one that counts.
            </p>
          ) : (
            !r.bioMd.trim() && (
              <p className="muted small">
                Type it here, or commit it as <code>{bioFileFor(r)}</code> and it will be picked up from there.
              </p>
            )
          )}
          <button className="btn btn-sm btn-primary" type="submit">
            Save {r.displayName}
          </button>
        </form>
      ))}
    </div>
  );
}
