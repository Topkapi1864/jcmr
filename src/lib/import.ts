import { and, eq } from "drizzle-orm";
import { db, ready, schema } from "@/db/client";
import { AREAS, STATUSES, type Area, type Status } from "@/db/schema";
import { csvToObjects } from "./csv";
import { addNote, createItem, updateItem } from "./items";
import { isValidYmd, nowIso } from "./time";

// Spec §8. Columns: title,area,owner,due,status,waiting_on,note,last_touched,source
// Idempotent on title+owner: a re-run updates rather than duplicates.

export type ImportReport = {
  imported: number;
  updated: number;
  rejected: { row: number; reason: string; title: string }[];
};

export async function importItemsCsv(actor: { name: string; pid: number; role: "admin" | "crew" }, csv: string): Promise<ImportReport> {
  await ready();
  const rows = csvToObjects(csv);
  const report: ImportReport = { imported: 0, updated: 0, rejected: [] };
  const people = await db.select().from(schema.people).all();
  const byShort = new Map(people.map((p) => [p.shortName.toLowerCase(), p]));

  for (let idx = 0; idx < rows.length; idx++) {
    const r = rows[idx];
    const rowNo = idx + 2; // header is row 1
    const title = (r.title ?? "").trim();
    if (!title) {
      report.rejected.push({ row: rowNo, reason: "no title", title: "" });
      continue;
    }
    const area = (r.area ?? "").trim().toLowerCase() as Area;
    if (!AREAS.includes(area)) {
      report.rejected.push({ row: rowNo, reason: `area "${r.area}" not in ${AREAS.join("/")}`, title });
      continue;
    }
    const owner = byShort.get((r.owner ?? "").trim().toLowerCase());
    if (!owner) {
      report.rejected.push({ row: rowNo, reason: `owner "${r.owner}" is not a person on the crew list`, title });
      continue;
    }
    const status = ((r.status ?? "").trim().toLowerCase() || "open") as Status;
    if (!STATUSES.includes(status)) {
      report.rejected.push({ row: rowNo, reason: `status "${r.status}"`, title });
      continue;
    }
    const due = (r.due ?? "").trim();
    if (due && !isValidYmd(due)) {
      report.rejected.push({ row: rowNo, reason: `due "${due}" is not YYYY-MM-DD`, title });
      continue;
    }
    const lastTouched = (r.last_touched ?? "").trim();
    if (lastTouched && !isValidYmd(lastTouched)) {
      report.rejected.push({ row: rowNo, reason: `last_touched "${lastTouched}" is not YYYY-MM-DD`, title });
      continue;
    }
    const waitingOn = (r.waiting_on ?? "").trim();
    const source = (r.source ?? "").trim();
    const notes = (r.note ?? "")
      .split(" | ")
      .map((s) => s.trim())
      .filter(Boolean);

    const existing = await db
      .select()
      .from(schema.items)
      .where(and(eq(schema.items.title, title.slice(0, 120)), eq(schema.items.ownerId, owner.id), eq(schema.items.deleted, false)))
      .get();

    let id: number;
    if (existing) {
      await updateItem(actor, existing.id, { area, due: due || null, status, waitingOn, source: source || null });
      id = existing.id;
      report.updated++;
    } else {
      id = await createItem(actor, { title, area, ownerId: owner.id, due: due || null, status, waitingOn, source: source || undefined });
      for (const n of notes) await addNote(actor, id, n, false);
      report.imported++;
    }

    // The seeded item carries its true age (§8). Import time otherwise.
    const touched = lastTouched ? `${lastTouched}T12:00:00.000Z` : nowIso();
    await db.update(schema.items).set({ updatedAt: touched, updatedBy: actor.name }).where(eq(schema.items.id, id));
  }
  return report;
}
