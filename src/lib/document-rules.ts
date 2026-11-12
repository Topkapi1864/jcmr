// The rules for Admin -> Documents, kept free of the database so they can be
// tested on their own (scripts/test-documents.ts).
//
// Why documents live in the database and not in this repository: the repository
// is public, and the Support Roadbook and the route guides say more than the
// public pages do. So a PDF is uploaded by a signed-in admin, kept in the site's
// database, and opened only with a crew session. Nothing of a document is here
// except its title and its fingerprints (md5 and SHA-256, which cannot be turned
// back into the file).
// Fiona's ruling on the cowork board, 12 Nov 2026 08:19Z, on Gary's word of 07:54.

/** Server actions take 3 MB (next.config.ts); a document stays under that. */
export const MAX_DOCUMENT_BYTES = 2.5 * 1024 * 1024;

/**
 * The three documents redone for the final line. The crew board keeps its
 * OLD ROUTE line until every one of these exact files has been uploaded: an
 * empty or half-filled Documents list must never read as "the documents are
 * current". A reissue (V2.2 ...) means a new fingerprint here.
 */
export const AWAITED_DOCUMENTS: { title: string; label?: string; md5: string; sha256: string }[] = [
  { title: "Support Roadbook V2.1", label: "Support Roadbook V2.1 (final routes, all 17 stops agreed)", md5: "6ffbbfaab2ef33ba9d22c56f8cfecb5b", sha256: "f407b9230f7a9810656831bbb6cec05d1b8a229652b8632abb5f2302ab346b04" },
  { title: "Route Guide V2.1", md5: "025ce48b397de7b8bcbccb54bc4f0802", sha256: "fcd78ab2d682be1e6145c19c62fe125440a7e09d8ce46843ca497e129bd6fe5a" },
  { title: "Towns and Villages Route Guide V2.1", md5: "c8b973e365324cd65d2756a1b88f3ea7", sha256: "5b39a64054497d87531d2bc52fc786a5c05b4953d763a11660d938ef2018e31c" },
];

/** What the crew board says in place of the OLD ROUTE line once all three are in. */
export const CURRENT_DOCS_NOTE =
  "The Support Roadbook and the two route guides listed here are V2.1, for the final line. Any earlier copy (Simon’s October line) is OLD ROUTE.";

export type AwaitedState = { rows: { title: string; here: boolean }[]; allHere: boolean };

/** Which of the awaited documents are among these uploads, by fingerprint alone. */
export function awaitedState(docs: { sha256: string }[]): AwaitedState {
  const have = new Set(docs.map((d) => d.sha256.toLowerCase()));
  const rows = AWAITED_DOCUMENTS.map((a) => ({ title: a.title, here: have.has(a.sha256) }));
  return { rows, allHere: rows.length > 0 && rows.every((r) => r.here) };
}

/** The label an awaited document takes when none is typed (Fiona's wording), or null for any other file. */
export function awaitedLabel(sha256: string): string | null {
  const a = AWAITED_DOCUMENTS.find((x) => x.sha256 === sha256.toLowerCase());
  return a ? (a.label ?? a.title) : null;
}

/** The awaited document this fingerprint is, or null for any other file. */
export function awaitedTitle(sha256: string): string | null {
  return AWAITED_DOCUMENTS.find((a) => a.sha256 === sha256.toLowerCase())?.title ?? null;
}

/** A PDF starts "%PDF-" (a few stray bytes before it are allowed, as readers allow). */
export function isPdf(bytes: Uint8Array): boolean {
  const head = Buffer.from(bytes.subarray(0, 1024)).toString("latin1");
  return head.includes("%PDF-");
}

/** A file name safe to hand back in a download header: plain characters, ending .pdf. */
export function cleanFilename(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? "")
    .replace(/\.pdf$/i, "")
    .replace(/[^A-Za-z0-9._ -]+/g, "_")
    .replace(/^[._ -]+|[._ -]+$/g, "")
    .slice(0, 120);
  return `${base || "document"}.pdf`;
}

/** The label for a file uploaded with none typed: its name, read as words. */
export function labelFromFilename(name: string): string {
  return cleanFilename(name)
    .replace(/\.pdf$/i, "")
    .replace(/_+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} bytes`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
