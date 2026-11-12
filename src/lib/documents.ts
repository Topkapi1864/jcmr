import { createHash } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import { db, ready, schema } from "@/db/client";
import { awaitedLabel, cleanFilename, isPdf, labelFromFilename, MAX_DOCUMENT_BYTES } from "./document-rules";
import { nowIso } from "./time";

// Admin -> Documents: PDFs kept in the database, opened with a crew session only
// (src/app/crew/documents/[id]/route.ts). The rules are in document-rules.ts.
// Nothing of a document is ever in the repository. The originals are in Fiona's
// Drive folder; an upload is a copy.

export type DocumentRow = { id: number; label: string; filename: string; size: number; sha256: string; md5: string; sortOrder: number; addedBy: string; addedAt: string };

const META = {
  id: schema.documents.id,
  label: schema.documents.label,
  filename: schema.documents.filename,
  size: schema.documents.size,
  sha256: schema.documents.sha256,
  md5: schema.documents.md5,
  sortOrder: schema.documents.sortOrder,
  addedBy: schema.documents.addedBy,
  addedAt: schema.documents.addedAt,
};

/** Every document, without its bytes. */
export async function listDocuments(): Promise<DocumentRow[]> {
  await ready();
  return db.select(META).from(schema.documents).orderBy(schema.documents.sortOrder, schema.documents.id).all();
}

/** One document with its bytes, or null. */
export async function getDocument(id: number): Promise<{ filename: string; bytes: Buffer } | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  await ready();
  const row = await db.select({ filename: schema.documents.filename, data: schema.documents.data }).from(schema.documents).where(eq(schema.documents.id, id)).get();
  return row ? { filename: row.filename, bytes: Buffer.from(row.data, "base64") } : null;
}

export type Refusal = "empty" | "too-big" | "not-pdf" | "duplicate" | "missing";
export type AddResult = { ok: true; id: number; label: string; sha256: string; md5: string; size: number } | { ok: false; why: Refusal };

function checked(input: Uint8Array): { ok: true; bytes: Buffer; sha256: string; md5: string } | { ok: false; why: Refusal } {
  const bytes = Buffer.from(input);
  if (bytes.length === 0) return { ok: false, why: "empty" };
  if (bytes.length > MAX_DOCUMENT_BYTES) return { ok: false, why: "too-big" };
  if (!isPdf(bytes)) return { ok: false, why: "not-pdf" };
  return { ok: true, bytes, sha256: createHash("sha256").update(bytes).digest("hex"), md5: createHash("md5").update(bytes).digest("hex") };
}

/**
 * Stores a PDF exactly as given. The same file twice is refused, not doubled.
 * With no label typed: the awaited document's own label if this is one of them,
 * otherwise the file's name read as words.
 */
export async function addDocument(input: { label: string; filename: string; bytes: Uint8Array; by: string }): Promise<AddResult> {
  const c = checked(input.bytes);
  if (!c.ok) return c;
  await ready();
  const same = await db.select({ id: schema.documents.id }).from(schema.documents).where(eq(schema.documents.sha256, c.sha256)).get();
  if (same) return { ok: false, why: "duplicate" };
  const label = input.label.trim().slice(0, 200) || awaitedLabel(c.sha256) || labelFromFilename(input.filename);
  const all = await db.select({ sortOrder: schema.documents.sortOrder }).from(schema.documents).all();
  const sortOrder = all.reduce((m, d) => Math.max(m, d.sortOrder + 1), 0);
  const [row] = await db
    .insert(schema.documents)
    .values({ label, filename: cleanFilename(input.filename), size: c.bytes.length, sha256: c.sha256, md5: c.md5, data: c.bytes.toString("base64"), sortOrder, addedBy: input.by, addedAt: nowIso() })
    .returning({ id: schema.documents.id });
  return { ok: true, id: row.id, label, sha256: c.sha256, md5: c.md5, size: c.bytes.length };
}

/** Puts a new file in a document's place: same label, same place in the list, same address. */
export async function replaceDocument(id: number, input: { filename: string; bytes: Uint8Array; by: string }): Promise<AddResult> {
  if (!Number.isInteger(id) || id <= 0) return { ok: false, why: "missing" };
  const c = checked(input.bytes);
  if (!c.ok) return c;
  await ready();
  const row = await db.select({ label: schema.documents.label }).from(schema.documents).where(eq(schema.documents.id, id)).get();
  if (!row) return { ok: false, why: "missing" };
  const same = await db.select({ id: schema.documents.id }).from(schema.documents).where(and(eq(schema.documents.sha256, c.sha256), ne(schema.documents.id, id))).get();
  if (same) return { ok: false, why: "duplicate" };
  await db
    .update(schema.documents)
    .set({ filename: cleanFilename(input.filename), size: c.bytes.length, sha256: c.sha256, md5: c.md5, data: c.bytes.toString("base64"), addedBy: input.by, addedAt: nowIso() })
    .where(eq(schema.documents.id, id));
  return { ok: true, id, label: row.label, sha256: c.sha256, md5: c.md5, size: c.bytes.length };
}

/** Changes what a document is called and where it sits; the file is untouched. */
export async function relabelDocument(id: number, label: string, sortOrder: number): Promise<boolean> {
  const clean = label.trim().slice(0, 200);
  if (!clean || !Number.isInteger(id) || id <= 0) return false;
  await ready();
  const r = await db.update(schema.documents).set({ label: clean, sortOrder }).where(eq(schema.documents.id, id)).returning({ id: schema.documents.id });
  return r.length > 0;
}

export async function removeDocument(id: number): Promise<string | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  await ready();
  const r = await db.delete(schema.documents).where(eq(schema.documents.id, id)).returning({ label: schema.documents.label });
  return r[0]?.label ?? null;
}
