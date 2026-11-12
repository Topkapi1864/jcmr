// Tests for the crew's Documents (src/lib/documents.ts, src/lib/document-rules.ts).
// Uses a scratch database under the OS temp dir; no network, and no real document
// in the repository. Run from the repo root:
//   npx tsx scripts/test-documents.ts
//   JCMR_DOCS_DIR=<folder holding the three V2.1 PDFs>  also proves the real files
//   are the awaited ones and that only all three together lift the OLD ROUTE line.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jcmr-docs-test-"));
process.env.DATABASE_URL = `file:${path.join(tmp, "test.db")}`;

let n = 0;
const ok = (name: string) => console.log(`ok ${++n} - ${name}`);
const pdf = (body: string) => Buffer.from(`%PDF-1.4\n${body}\n%%EOF\n`, "latin1");

async function main() {
  const rules = await import("../src/lib/document-rules");
  const docs = await import("../src/lib/documents");
  const { fullBackup } = await import("../src/lib/backup");
  const { client } = await import("../src/db/client");

  // ---- rules ----
  assert.equal(rules.isPdf(pdf("x")), true);
  assert.equal(rules.isPdf(Buffer.from("<html>not a pdf</html>")), false);
  assert.equal(rules.isPdf(Buffer.alloc(0)), false);
  ok("a PDF is told by its first bytes, not by its name");

  assert.equal(rules.cleanFilename("../../etc/passwd"), "passwd.pdf");
  assert.equal(rules.cleanFilename('a"b\r\nc.PDF'), "a_b_c.pdf");
  assert.equal(rules.cleanFilename(""), "document.pdf");
  assert.equal(rules.cleanFilename("London_to_Leeds_Support_Roadbook_V2.1.pdf"), "London_to_Leeds_Support_Roadbook_V2.1.pdf");
  assert.equal(rules.labelFromFilename("London_to_Leeds_Support_Roadbook_V2.1.pdf"), "London to Leeds Support Roadbook V2.1");
  ok("file names are made safe for the download header; a blank label falls back to the name");

  assert.equal(rules.AWAITED_DOCUMENTS.length, 3);
  assert.ok(rules.AWAITED_DOCUMENTS.every((a) => /^[0-9a-f]{64}$/.test(a.sha256)));
  assert.equal(rules.awaitedState([]).allHere, false);
  assert.equal(rules.awaitedState(rules.AWAITED_DOCUMENTS.slice(0, 2)).allHere, false);
  assert.equal(rules.awaitedState([{ sha256: "0".repeat(64) }, { sha256: "1".repeat(64) }, { sha256: "2".repeat(64) }]).allHere, false);
  assert.equal(rules.awaitedState(rules.AWAITED_DOCUMENTS).allHere, true);
  ok("the OLD ROUTE line lifts only when all three awaited fingerprints are present: not empty, not two, not three other files");

  // ---- the database ----
  assert.deepEqual(await docs.listDocuments(), []);
  assert.deepEqual(await docs.addDocument({ label: "x", filename: "x.pdf", bytes: Buffer.alloc(0), by: "T" }), { ok: false, why: "empty" });
  assert.deepEqual(await docs.addDocument({ label: "x", filename: "x.pdf", bytes: Buffer.from("PK\u0003\u0004 a zip"), by: "T" }), { ok: false, why: "not-pdf" });
  assert.deepEqual(await docs.addDocument({ label: "x", filename: "x.pdf", bytes: Buffer.concat([pdf("big"), Buffer.alloc(rules.MAX_DOCUMENT_BYTES)]), by: "T" }), { ok: false, why: "too-big" });
  assert.deepEqual(await docs.listDocuments(), []);
  ok("an empty file, a non-PDF and an over-size file are refused and nothing is stored");

  const one = pdf("one é\u0000ÿ binary-ish");
  const a = await docs.addDocument({ label: "  Route Guide V9  ", filename: "Some Guide.pdf", bytes: one, by: "Tester" });
  if (!a.ok) throw new Error("the first upload was refused: " + a.why);
  assert.equal(a.label, "Route Guide V9");
  assert.equal(a.sha256, createHash("sha256").update(one).digest("hex"));
  const back = await docs.getDocument(a.id);
  assert.ok(back && back.bytes.equals(one), "the bytes come back exactly as they went in");
  assert.equal(back!.filename, "Some Guide.pdf");
  ok("a PDF is stored and comes back byte for byte");

  assert.deepEqual(await docs.addDocument({ label: "again", filename: "copy.pdf", bytes: one, by: "T" }), { ok: false, why: "duplicate" });
  const b = await docs.addDocument({ label: "", filename: "Kit_List_V1.pdf", bytes: pdf("two"), by: "T" });
  assert.ok(b.ok && b.label === "Kit List V1");
  const list = await docs.listDocuments();
  assert.deepEqual(list.map((d) => d.label), ["Route Guide V9", "Kit List V1"]);
  assert.ok(list.every((d) => !("data" in d)), "the list never carries the bytes");
  ok("the same file twice is refused; a blank label takes the file's name; the list holds no bytes");

  assert.equal(await docs.relabelDocument(a.id, "   ", 0), false);
  assert.equal(await docs.relabelDocument(a.id, "Route Guide V9 (renamed)", 5), true);
  assert.deepEqual((await docs.listDocuments()).map((d) => d.label), ["Kit List V1", "Route Guide V9 (renamed)"]);
  assert.ok((await docs.getDocument(a.id))!.bytes.equals(one));
  ok("a relabel changes the label and order, never the file; a blank label is refused");

  for (const bad of [0, -1, 1.5, NaN, 999999]) assert.equal(await docs.getDocument(bad), null);
  assert.equal(await docs.removeDocument(999999), null);
  ok("an id that is not a document gives nothing");

  // ---- replace: a new file in the same place ----
  const two = pdf("one, reissued");
  const rep = await docs.replaceDocument(a.id, { filename: "Some Guide v2.pdf", bytes: two, by: "T2" });
  assert.ok(rep.ok && rep.label === "Route Guide V9 (renamed)" && rep.md5 === createHash("md5").update(two).digest("hex"));
  assert.ok((await docs.getDocument(a.id))!.bytes.equals(two));
  assert.deepEqual((await docs.listDocuments()).map((d) => d.label), ["Kit List V1", "Route Guide V9 (renamed)"]);
  assert.deepEqual(await docs.replaceDocument(a.id, { filename: "x.pdf", bytes: pdf("two"), by: "T" }), { ok: false, why: "duplicate" });
  assert.deepEqual(await docs.replaceDocument(a.id, { filename: "x.pdf", bytes: Buffer.from("nope"), by: "T" }), { ok: false, why: "not-pdf" });
  assert.deepEqual(await docs.replaceDocument(999999, { filename: "x.pdf", bytes: two, by: "T" }), { ok: false, why: "missing" });
  assert.ok((await docs.getDocument(a.id))!.bytes.equals(two));
  ok("a replace swaps the file and keeps the label, the place and the id; a refused replace changes nothing");

  // ---- the backup carries the documents (it is encrypted before it is kept) ----
  const backup = await fullBackup();
  assert.equal((backup.documents ?? []).length, 2);
  assert.ok(JSON.stringify(backup).includes(two.toString("base64")));
  ok("the backup carries the documents table");

  assert.equal(rules.awaitedState(await docs.listDocuments()).allHere, false);
  ok("two ordinary uploads do not lift the OLD ROUTE line");

  // ---- the real three, when their folder is given ----
  const dir = process.env.JCMR_DOCS_DIR;
  if (dir) {
    const files = fs.readdirSync(dir).filter((f) => /_V2\.1\.pdf$/.test(f)).sort();
    assert.equal(files.length, 3, `three V2.1 PDFs in ${dir}`);
    let i = 0;
    for (const f of files) {
      const bytes = fs.readFileSync(path.join(dir, f));
      const r = await docs.addDocument({ label: "", filename: f, bytes, by: "T" });
      if (!r.ok) throw new Error(`${f} was refused: ${r.why}`);
      assert.ok(rules.awaitedTitle(r.sha256), `${f} is an awaited document`);
      assert.equal(r.label, rules.awaitedLabel(r.sha256), `${f} takes its own label when none is typed`);
      assert.ok(r.label.startsWith(rules.awaitedTitle(r.sha256)!));
      assert.ok(rules.AWAITED_DOCUMENTS.some((a) => a.md5 === r.md5 && a.sha256 === r.sha256), `${f}: md5 and sha256 both match`);
      assert.ok((await docs.getDocument(r.id))!.bytes.equals(bytes), `${f} comes back byte for byte`);
      i++;
      assert.equal(rules.awaitedState(await docs.listDocuments()).allHere, i === 3, `after ${i} of 3`);
    }
    ok("the three real V2.1 files are the awaited ones, come back byte for byte, and only the third lifts the line");
    for (const old of fs.readdirSync(dir).filter((f) => /\.pdf$/i.test(f) && !/_V2\.1\.pdf$/.test(f))) {
      assert.equal(rules.awaitedTitle(createHash("sha256").update(fs.readFileSync(path.join(dir, old))).digest("hex")), null, `${old} is not awaited`);
    }
    ok("no other PDF in that folder (V2, the October originals) counts as one of the three");
  } else {
    console.log("# JCMR_DOCS_DIR not set: the real-file checks were skipped");
  }

  client.close();
  fs.rmSync(tmp, { recursive: true });
  console.log(`# ${n} passed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
