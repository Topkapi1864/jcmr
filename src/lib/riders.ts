import "server-only";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { desc, eq, like, or } from "drizzle-orm";
import { db, ready, schema } from "@/db/client";
import type { Rider } from "@/db/schema";
import { nowIso } from "@/lib/time";

// Rider bios have two ways in: typed into Admin → Content, or committed as a
// Markdown file under content/riders/ (the same way photos live under
// public/photos/ and Mum's story under content/seed/). The file's text is the
// bio; an optional front-matter block at the top can name the photo and the
// Strava link:
//
//   ---
//   photo: /photos/steve.jpg
//   strava: https://www.strava.com/athletes/…
//   ---
//   Meet Steve: …
//
// The bio follows the file until someone saves a change in Admin, after which
// the Admin copy is the one that counts (we remember what we last loaded, so
// we can tell the two apart). The photo and Strava link are only filled in
// while the box in Admin is empty.

const DIR = path.join(process.cwd(), "content", "riders");

/** The file a rider's bio may be committed as, from the first word of the display name: `content/riders/nathan.md`. */
export function bioFileFor(r: Pick<Rider, "displayName">): string {
  const first = (r.displayName.trim().split(/\s+/)[0] ?? "rider").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return path.join("content", "riders", `${first}.md`);
}

export function hasBioFile(r: Pick<Rider, "displayName">): boolean {
  return fs.existsSync(path.join(process.cwd(), bioFileFor(r)));
}

type RiderFile = { bio: string; photo?: string; strava?: string };

function readRiderFile(r: Pick<Rider, "displayName">): RiderFile | null {
  let raw: string;
  try {
    raw = fs.readFileSync(path.join(process.cwd(), bioFileFor(r)), "utf8");
  } catch {
    return null;
  }
  const meta: Record<string, string> = {};
  let body = raw;
  const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (fm) {
    body = raw.slice(fm[0].length);
    for (const line of fm[1].split(/\r?\n/)) {
      const i = line.indexOf(":");
      if (i > 0) meta[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
    }
  }
  return { bio: body.trim(), photo: meta.photo || undefined, strava: meta.strava || undefined };
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const loadedKey = (r: Pick<Rider, "id">) => `rider.bio_from_file.${r.id}`;

/** True when the bio in the database is still the one we loaded from the file (or there is none yet), so the file may update it. */
async function bioFollowsFile(r: Rider): Promise<boolean> {
  if (!r.bioMd.trim()) return true;
  const stored = (await db.select().from(schema.settings).where(eq(schema.settings.key, loadedKey(r))).get())?.value ?? null;
  if (stored !== null) return sha(r.bioMd) === stored;
  // Loaded before we kept a record of what was loaded: the journal decides. The
  // bio is still the file's if it was loaded from the file and nobody has saved
  // the rider in Admin since.
  const last = await db
    .select({ action: schema.audit.action })
    .from(schema.audit)
    .where(or(like(schema.audit.action, `% loaded from ${bioFileFor(r)}: #${r.id}`), eq(schema.audit.action, `rider saved: #${r.id}`)))
    .orderBy(desc(schema.audit.id))
    .limit(1)
    .get();
  return !!last && last.action.includes(" loaded from ");
}

/** The riders in display order, with anything committed under content/riders/ applied (and saved, so Admin shows it too). */
export async function listRiders(): Promise<Rider[]> {
  await ready();
  const riders = await db.select().from(schema.riders).orderBy(schema.riders.sortOrder).all();
  if (!fs.existsSync(DIR)) return riders;
  const out: Rider[] = [];
  for (const r of riders) {
    const file = readRiderFile(r);
    if (!file) {
      out.push(r);
      continue;
    }
    const set: Partial<Rider> = {};
    const what: string[] = [];
    if (file.bio && file.bio !== r.bioMd && (await bioFollowsFile(r))) {
      set.bioMd = file.bio;
      what.push("bio");
      await db
        .insert(schema.settings)
        .values({ key: loadedKey(r), value: sha(file.bio) })
        .onConflictDoUpdate({ target: schema.settings.key, set: { value: sha(file.bio) } });
    }
    if (file.photo && !r.photoAsset) {
      set.photoAsset = file.photo;
      what.push("photo");
    }
    if (file.strava && !r.stravaUrl) {
      set.stravaUrl = file.strava;
      what.push("strava");
    }
    if (what.length) {
      await db.update(schema.riders).set(set).where(eq(schema.riders.id, r.id));
      await db.insert(schema.audit).values({ actor: "site", at: nowIso(), action: `rider ${what.join(" + ")} loaded from ${bioFileFor(r)}: #${r.id}` });
    }
    out.push({ ...r, ...set });
  }
  return out;
}
