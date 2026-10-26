import "server-only";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, ready, schema } from "@/db/client";
import type { Rider } from "@/db/schema";
import { nowIso } from "@/lib/time";

// Rider bios have two ways in: typed into Admin → Content, or committed as a
// Markdown file under content/riders/ (the same way photos live under
// public/photos/ and Mum's story under content/seed/). A rider whose bio is
// still empty takes the committed file the first time the riders are listed;
// from then on the database copy is the one that counts, so a later edit in
// Admin wins and the file is only ever a seed.

const DIR = path.join(process.cwd(), "content", "riders");

/** The file a rider's bio may be committed as, from the first word of the display name: `content/riders/nathan.md`. */
export function bioFileFor(r: Pick<Rider, "displayName">): string {
  const first = (r.displayName.trim().split(/\s+/)[0] ?? "rider").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return path.join("content", "riders", `${first}.md`);
}

function readBioFile(r: Pick<Rider, "displayName">): string {
  try {
    return fs.readFileSync(path.join(process.cwd(), bioFileFor(r)), "utf8").trim();
  } catch {
    return "";
  }
}

/** The riders in display order, with any empty bio filled from its committed file (and saved, so Admin shows it too). */
export async function listRiders(): Promise<Rider[]> {
  await ready();
  const riders = await db.select().from(schema.riders).orderBy(schema.riders.sortOrder).all();
  if (!riders.some((r) => !r.bioMd.trim()) || !fs.existsSync(DIR)) return riders;
  const out: Rider[] = [];
  for (const r of riders) {
    const md = r.bioMd.trim() ? "" : readBioFile(r);
    if (!md) {
      out.push(r);
      continue;
    }
    await db.update(schema.riders).set({ bioMd: md }).where(eq(schema.riders.id, r.id));
    await db.insert(schema.audit).values({ actor: "site", at: nowIso(), action: `rider bio loaded from ${bioFileFor(r)}: #${r.id}` });
    out.push({ ...r, bioMd: md });
  }
  return out;
}
