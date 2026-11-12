// The crew's Documents through the front door: the BUILT site, a scratch database,
// a dummy PDF. Signed out, a crew session, an admin session.
//
// Start the built site yourself on a spare port against a scratch database, then
// run this with the SAME three settings (from the repo root, after `npm run build`):
//   export DATABASE_URL=file:/tmp/jcmr-docs-test/test.db SESSION_SECRET=test-only-secret-0123456789abcdef
//   npx next start -p 3987 &
//   JCMR_TEST_URL=http://localhost:3987 npx tsx scripts/test-documents-http.ts
// It refuses to run against anything but localhost, and expects no documents yet.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const B = (process.env.JCMR_TEST_URL ?? "").replace(/\/$/, "");
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(B)) throw new Error("set JCMR_TEST_URL to the local test site, e.g. http://localhost:3987");
if (!/^file:/.test(process.env.DATABASE_URL ?? "")) throw new Error("set DATABASE_URL to the scratch file: database the test site uses");
if (!process.env.SESSION_SECRET) throw new Error("set SESSION_SECRET to the one the test site uses");

let n = 0;
const ok = (name: string) => console.log(`ok ${++n} - ${name}`);
const pdf = (body: string) => Buffer.from(`%PDF-1.4\n${body}\n%%EOF\n`, "latin1");
const LABEL = "Dummy Guide ZQX";

type Who = string | null;
const get = (p: string, who: Who) => fetch(B + p, { redirect: "manual", headers: who ? { cookie: `jcmr_session=${who}` } : {} });
async function post(action: string, who: Who, fields: Record<string, string>, files: { name: string; bytes: Buffer }[] = []) {
  const fd = new FormData();
  fd.append(action, "");
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  for (const f of files) fd.append("file", new Blob([new Uint8Array(f.bytes)], { type: "application/pdf" }), f.name);
  const r = await fetch(`${B}/crew/admin/documents`, { method: "POST", body: fd, redirect: "manual", headers: { origin: B, ...(who ? { cookie: `jcmr_session=${who}` } : {}) } });
  return { status: r.status, to: r.headers.get("location") ?? "" };
}
/** The server-action ids on the admin page, by what each form is for. */
function actions(html: string) {
  const out: Record<string, string> = {};
  for (const m of html.matchAll(/<form[^>]*>([\s\S]*?)<\/form>/g)) {
    const id = /name="(\$ACTION_ID_[0-9a-f]+)"/.exec(m[1])?.[1];
    if (!id) continue;
    const kind = /name="file"[^>]*multiple|multiple[^>]*name="file"/.test(m[1]) ? "upload" : /name="file"/.test(m[1]) ? "replace" : /name="label"/.test(m[1]) ? "save" : "remove";
    out[kind] ??= id;
  }
  return out;
}

async function main() {
  const { client, ready } = await import("../src/db/client");
  const { signSession } = await import("../src/lib/session");
  const { MAX_DOCUMENT_BYTES } = await import("../src/lib/document-rules");
  await ready();
  await client.execute("INSERT OR IGNORE INTO people (id, name, short_name, role) VALUES (9001, 'Test Admin', 'TAdmin', 'admin'), (9002, 'Test Crew', 'TCrew', 'crew')");
  client.close();
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const admin = await signSession({ pid: 9001, name: "TAdmin", role: "admin", exp });
  const crew = await signSession({ pid: 9002, name: "TCrew", role: "crew", exp });

  // ---- an admin uploads; everyone else is refused ----
  let page = await (await get("/crew/admin/documents", admin)).text();
  assert.ok(page.includes("No documents yet."), "the test site starts with no documents");
  const up = actions(page).upload;
  assert.ok(up, "the upload form is on the admin page");
  const one = pdf("dummy one éÿ");

  let r = await post(up, null, { label: LABEL }, [{ name: "dummy.pdf", bytes: one }]);
  assert.ok(r.status === 307 && r.to.includes("/crew/signin"), "signed out: sent to the sign-in page");
  r = await post(up, crew, { label: LABEL }, [{ name: "dummy.pdf", bytes: one }]);
  assert.ok(r.to.endsWith("/crew?denied=1"), "a crew session that is not an admin cannot upload");
  r = await post(up, admin, { label: LABEL }, [{ name: "page.pdf", bytes: Buffer.from("<html>not a pdf</html>") }]);
  assert.ok(r.to.includes("error=not-pdf"));
  r = await post(up, admin, { label: LABEL }, [{ name: "big.pdf", bytes: Buffer.concat([pdf("big"), Buffer.alloc(MAX_DOCUMENT_BYTES)]) }]);
  assert.ok(r.to.includes("error=too-big"));
  assert.ok((await (await get("/crew/admin/documents", admin)).text()).includes("No documents yet."));
  ok("signed out and crew cannot upload; a non-PDF and an over-size file are refused; nothing is stored");

  r = await post(up, admin, { label: LABEL }, [{ name: "dummy.pdf", bytes: one }]);
  assert.ok(r.status === 303 && r.to.includes("added=1"), "an admin can upload");
  page = await (await get("/crew/admin/documents", admin)).text();
  assert.ok(page.includes(LABEL) && page.includes(createHash("md5").update(one).digest("hex")), "the admin page shows the label and the md5");
  const act = actions(page);
  assert.ok(act.replace && act.save && act.remove);
  ok("an admin uploads a PDF; the admin page lists it with its md5");

  // ---- the crew board and the document, with a session ----
  const board = await (await get("/crew", crew)).text();
  const href = /href="(\/crew\/documents\/\d+)"[^>]*>Dummy Guide ZQX</.exec(board)?.[1];
  assert.ok(href, "the crew board lists the document under its label");
  assert.ok(board.includes("OLD ROUTE — the Support Roadbook and the two PDF route guides follow"), "one upload leaves the OLD ROUTE line standing");
  const d = await get(href!, crew);
  assert.equal(d.status, 200);
  assert.equal(d.headers.get("content-type"), "application/pdf");
  assert.match(d.headers.get("cache-control") ?? "", /private/);
  assert.ok(Buffer.from(await d.arrayBuffer()).equals(one), "read back through the crew address, byte for byte");
  ok("a crew session sees it on the board and reads it back byte-identical");

  // ---- signed out: refused, and nothing about documents is served ----
  for (const p of ["/crew", "/crew/admin/documents", href!, "/crew/documents/999999"]) {
    const lo = await get(p, null);
    assert.equal(lo.status, 307, `${p} signed out`);
    assert.ok((lo.headers.get("location") ?? "").includes("/crew/signin"));
    assert.ok(!(await lo.text()).includes("%PDF"));
  }
  assert.equal((await get(href!, admin.slice(0, -3) + "abc")).status, 307, "a forged session is refused");
  for (const p of ["/", "/route", "/live", "/support-crew", "/crew/signin", "/api/live", "/robots.txt"]) {
    const t = await (await get(p, null)).text();
    assert.ok(!t.includes(LABEL) && !t.includes("/crew/documents/"), `${p} says nothing about documents`);
  }
  ok("signed out: the list and every document address refuse; no public page or feed names a document");

  // ---- crew cannot replace, relabel or remove; an admin can ----
  const id = href!.split("/").pop()!;
  const two = pdf("dummy two, reissued");
  assert.ok((await post(act.replace, crew, { id }, [{ name: "two.pdf", bytes: two }])).to.endsWith("/crew?denied=1"));
  assert.ok((await post(act.save, crew, { id, label: "hacked", sortOrder: "0" })).to.endsWith("/crew?denied=1"));
  assert.ok((await post(act.remove, crew, { id })).to.endsWith("/crew?denied=1"));
  assert.ok(Buffer.from(await (await get(href!, crew)).arrayBuffer()).equals(one));
  assert.ok((await (await get("/crew", crew)).text()).includes(LABEL));
  ok("a crew session that is not an admin cannot replace, relabel or remove");

  assert.ok((await post(act.replace, admin, { id }, [{ name: "two.pdf", bytes: two }])).to.includes("replaced=1"));
  assert.ok(Buffer.from(await (await get(href!, crew)).arrayBuffer()).equals(two), "the same address now gives the new file");
  assert.ok((await post(up, admin, { label: "" }, [{ name: "Kit_List_A.pdf", bytes: pdf("a") }, { name: "Kit_List_B.pdf", bytes: pdf("b") }])).to.includes("added=2"));
  const board2 = await (await get("/crew", crew)).text();
  assert.ok(board2.includes("Kit List A") && board2.includes("Kit List B") && board2.includes(LABEL));
  assert.ok((await post(act.remove, admin, { id })).to.includes("removed=1"));
  assert.equal((await get(href!, crew)).status, 404);
  assert.ok(!(await (await get("/crew", crew)).text()).includes(LABEL));
  ok("an admin replaces the file in place, uploads two at once, and removes one");

  console.log(`# ${n} passed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
