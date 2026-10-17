import { readFile } from "node:fs/promises";
import path from "node:path";
import { gate } from "@/lib/public";

/** "Ride the route": the quarter-mile street-photo viewer, served from ./ride.
 *  It sits behind the same dark switch as the public pages — crew can preview
 *  it now, everyone else sees it when the site goes live. The first frames are
 *  at the start of Day 1, so it must never be reachable while the site is dark. */

const ROOT = path.join(process.cwd(), "ride");
const ALLOWED = /^(view\.html|img\/D[12]-\d{4}\.jpg)$/;

export async function GET(req: Request, ctx: RouteContext<"/route/ride/[[...path]]">) {
  const g = await gate();
  if (g.holding) return Response.redirect(new URL("/route", req.url), 307);

  const rel = ((await ctx.params).path ?? []).join("/");
  if (rel === "") return Response.redirect(new URL("/route/ride/view.html", req.url), 307);
  if (!ALLOWED.test(rel)) return new Response("Not found", { status: 404 });

  let body: Buffer;
  try {
    body = await readFile(path.join(ROOT, rel));
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const isPage = rel.endsWith(".html");
  // A crew preview must not be cached anywhere shared; once live the photos never change.
  const cache = g.preview ? "private, max-age=3600" : isPage ? "public, max-age=300" : "public, max-age=604800, immutable";
  const headers: Record<string, string> = {
    "Content-Type": isPage ? "text/html; charset=utf-8" : "image/jpeg",
    "Cache-Control": cache,
  };
  if (!g.live) headers["X-Robots-Tag"] = "noindex";
  return new Response(new Uint8Array(body), { headers });
}
