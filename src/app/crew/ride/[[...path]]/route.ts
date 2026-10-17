import { readFile } from "node:fs/promises";
import path from "node:path";
import { getSession } from "@/lib/auth";

/** "Ride the route": the quarter-mile street-photo viewer, served from ./ride.
 *  Crew only. The proxy already sends anyone without a session to sign in;
 *  the check here is belt and braces, because the first frames are at the
 *  start of Day 1. */

const ROOT = path.join(process.cwd(), "ride");
const ALLOWED = /^(view\.html|img\/D[12]-\d{4}\.jpg)$/;

export async function GET(req: Request, ctx: RouteContext<"/crew/ride/[[...path]]">) {
  if (!(await getSession())) return Response.redirect(new URL("/crew/signin?next=%2Fcrew%2Froute", req.url), 307);

  const rel = ((await ctx.params).path ?? []).join("/");
  if (rel === "") return Response.redirect(new URL("/crew/ride/view.html", req.url), 307);
  if (!ALLOWED.test(rel)) return new Response("Not found", { status: 404 });

  let body: Buffer;
  try {
    body = await readFile(path.join(ROOT, rel));
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const isPage = rel.endsWith(".html");
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": isPage ? "text/html; charset=utf-8" : "image/jpeg",
      // Never in a shared cache: these are behind the crew sign-in.
      "Cache-Control": isPage ? "private, no-cache" : "private, max-age=604800",
      "X-Robots-Tag": "noindex",
    },
  });
}
