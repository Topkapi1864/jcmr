import { desc, eq } from "drizzle-orm";
import { db, ready, schema } from "@/db/client";
import { itemsCsv, listItems } from "@/lib/items";
import { getSetting } from "@/lib/settings";
import { sha256Hex } from "@/lib/util";

// Fiona's read door (§7): GET /api/board/<token>.json or .csv. The token is
// long, random, hashed in settings, rotatable from /crew/admin. GET-only; it
// serves nothing the crew board doesn't already show, and no emails.

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const m = /^([a-f0-9]{24,})\.(json|csv)$/i.exec(token);
  if (!m) return new Response("Not found", { status: 404 });
  const hash = await getSetting("read_door.token_hash");
  if (!hash || (await sha256Hex(m[1])) !== hash) {
    await new Promise((r) => setTimeout(r, 300));
    return new Response("Not found", { status: 404 });
  }
  const items = await listItems();
  if (m[2] === "csv") {
    return new Response(itemsCsv(items), { headers: { "content-type": "text/csv; charset=utf-8", "cache-control": "no-store" } });
  }
  await ready();
  const crew = await db
    .select({ name: schema.people.name, shortName: schema.people.shortName, role: schema.people.role, active: schema.people.active })
    .from(schema.people)
    .orderBy(schema.people.sortOrder)
    .all();
  const tracker = await db.select().from(schema.trackerLinks).where(eq(schema.trackerLinks.active, true)).all();
  const status = await db.select().from(schema.liveStatus).orderBy(desc(schema.liveStatus.id)).limit(1).get();
  const body = {
    generated_at: new Date().toISOString(),
    items: items.map((i) => ({
      id: i.id,
      title: i.title,
      area: i.area,
      owner: i.owner.shortName,
      due: i.due,
      status: i.status,
      waiting_on: i.waitingOn,
      stale_days: i.staleDays,
      stale: i.staleLevel,
      overdue: i.overdue,
      created_by: i.createdBy,
      created_at: i.createdAt,
      updated_by: i.updatedBy,
      updated_at: i.updatedAt,
      done_at: i.doneAt,
      source: i.source,
      latest_note: i.latestNote,
    })),
    crew,
    tracker_links: tracker,
    live_status: status ?? null,
  };
  return new Response(JSON.stringify(body, null, 1), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
