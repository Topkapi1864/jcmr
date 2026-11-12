import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { listDocuments } from "@/lib/documents";
import { MAX_DOCUMENT_BYTES, awaitedState, awaitedTitle, fmtBytes } from "@/lib/document-rules";
import { OLD_ROUTE_DOCS_NOTE } from "@/lib/old-route-docs";
import { fmtWhen } from "@/lib/time";
import { deleteDocument, replaceDocumentFile, saveDocument, uploadDocument } from "../actions";

const ERRORS: Record<string, string> = {
  empty: "No file was chosen. Choose a PDF, then press Upload.",
  "too-big": `That file is too big — a document can be up to ${fmtBytes(MAX_DOCUMENT_BYTES)}.`,
  "not-pdf": "That file is not a PDF. Nothing was stored.",
  duplicate: "That exact file is already here. Nothing was added.",
  label: "A document needs a label. Nothing was changed.",
  missing: "That document is no longer here. Nothing was changed.",
};

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const docs = await listDocuments();
  const awaited = awaitedState(docs);
  const added = Number(sp.added) || 0;
  return (
    <div className="stack" style={{ maxWidth: "44rem" }}>
      <Link href="/crew/admin" className="small">
        ← Admin
      </Link>
      <h1>Documents</h1>
      <p className="muted small">
        PDFs for the crew. Each one is listed under Links at the foot of the crew board and opens only for someone signed in to the crew board — never on the public site. The file is kept in the site&rsquo;s database exactly as uploaded.
      </p>
      {sp.error && <p className="error">{ERRORS[sp.error] ?? "That did not work. Nothing was changed."}</p>}
      {added > 0 && <p className="notice">Uploaded: {added === 1 ? "1 document" : `${added} documents`}. See the list below.</p>}
      {sp.replaced && <p className="notice">Replaced. The label and the address stay the same.</p>}
      {sp.saved && <p className="notice">Saved.</p>}
      {sp.removed && <p className="notice">Removed.</p>}

      <section className="card stack-sm">
        <h2>The three documents for the final line</h2>
        <ul className="list">
          {awaited.rows.map((r) => (
            <li key={r.title}>
              {r.here ? "✓" : "—"} {r.title} <span className="small muted">{r.here ? "uploaded" : "not uploaded yet"}</span>
            </li>
          ))}
        </ul>
        {awaited.allHere ? (
          <p className="small">
            <b>All three are here.</b> The crew board now says they are V2.1 for the final line, in place of its OLD ROUTE line.
          </p>
        ) : (
          <p className="small">
            Until all three are here the crew board keeps saying: <b>{OLD_ROUTE_DOCS_NOTE}</b>
          </p>
        )}
      </section>

      <h2>Upload a PDF</h2>
      <form action={uploadDocument} className="card stack-sm">
        <label className="field">
          <span>The PDF — or several at once (each up to {fmtBytes(MAX_DOCUMENT_BYTES)})</span>
          <input type="file" name="file" accept="application/pdf,.pdf" multiple required />
        </label>
        <label className="field">
          <span>Label — what the crew see. Leave blank to use the document&rsquo;s own name; with several files each takes its own.</span>
          <input type="text" name="label" maxLength={200} />
        </label>
        <div>
          <button className="btn btn-primary" type="submit">
            Upload
          </button>
        </div>
      </form>

      <h2>On the crew board now</h2>
      {docs.length === 0 && <p className="muted">No documents yet.</p>}
      {docs.map((d) => {
        const known = awaitedTitle(d.sha256);
        return (
          <div key={d.id} className="card stack-sm">
            <p className="small" style={{ margin: 0 }}>
              <a href={`/crew/documents/${d.id}`} target="_blank" rel="noopener">
                Open
              </a>{" "}
              · {d.filename} · {fmtBytes(d.size)} ({d.size.toLocaleString("en-GB")} bytes) · uploaded by {d.addedBy}, {fmtWhen(d.addedAt)}
            </p>
            <p className="small muted" style={{ margin: 0 }}>
              md5 <code>{d.md5}</code>
            </p>
            <p className="small" style={{ margin: 0 }}>
              {known ? (
                <b>✓ Matches: this is the {known} file, checked by its fingerprint.</b>
              ) : (
                <span>Does not match any of the three files above — a different file, or a different version (V2 is not V2.1).</span>
              )}
            </p>
            <form action={saveDocument} className="form-inline">
              <input type="hidden" name="id" value={d.id} />
              <label className="field" style={{ flex: "2 1 16rem" }}>
                <span>Label</span>
                <input type="text" name="label" defaultValue={d.label} maxLength={200} required />
              </label>
              <label className="field" style={{ flex: "0 0 5rem" }}>
                <span>Sort</span>
                <input type="number" name="sortOrder" defaultValue={d.sortOrder} />
              </label>
              <button className="btn btn-sm" type="submit">
                Save
              </button>
            </form>
            <form action={replaceDocumentFile} className="form-inline">
              <input type="hidden" name="id" value={d.id} />
              <label className="field" style={{ flex: "2 1 16rem" }}>
                <span>Replace the file (the label stays)</span>
                <input type="file" name="file" accept="application/pdf,.pdf" required />
              </label>
              <button className="btn btn-sm" type="submit">
                Replace
              </button>
            </form>
            <form action={deleteDocument}>
              <input type="hidden" name="id" value={d.id} />
              <button className="btn btn-sm btn-quiet btn-danger" type="submit">
                Remove
              </button>
            </form>
          </div>
        );
      })}
    </div>
  );
}
