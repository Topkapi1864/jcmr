import { getSession } from "@/lib/auth";
import { getDocument } from "@/lib/documents";

// A document uploaded in Admin -> Documents. Crew sessions only: the proxy turns
// a signed-out request for anything under /crew to the sign-in page before it
// gets here, and this checks the session again for itself. Never cached by a
// shared cache, never indexed.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) return new Response("Not found", { status: 404 });
  const { id } = await ctx.params;
  const doc = /^\d{1,9}$/.test(id) ? await getDocument(Number(id)) : null;
  if (!doc) return new Response("No such document", { status: 404 });
  return new Response(new Uint8Array(doc.bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-length": String(doc.bytes.length),
      "content-disposition": `inline; filename="${doc.filename}"`,
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
