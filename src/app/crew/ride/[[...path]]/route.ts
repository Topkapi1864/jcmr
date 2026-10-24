import { getSession } from "@/lib/auth";
import { serveRide } from "@/lib/ride-viewer";

/** Crew "Ride the route": the whole route, from the house. The proxy already sends anyone
 *  without a session to sign in; the check here is belt and braces. */
export async function GET(req: Request, ctx: RouteContext<"/crew/ride/[[...path]]">) {
  if (!(await getSession())) return Response.redirect(new URL("/crew/signin?next=%2Fcrew%2Froute", req.url), 307);
  const rel = ((await ctx.params).path ?? []).join("/");
  return serveRide(req, rel, "crew", "/crew/ride", { cache: "private", noindex: true });
}
