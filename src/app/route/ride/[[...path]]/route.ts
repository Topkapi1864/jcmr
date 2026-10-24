import { gate } from "@/lib/public";
import { serveRide } from "@/lib/ride-viewer";

/** Public "Ride the route": starts half a mile into Day 1 (see PUBLIC_START_MILES), behind the
 *  same dark switch as the other public pages — crew can preview it, everyone else sees it once live. */
export async function GET(req: Request, ctx: RouteContext<"/route/ride/[[...path]]">) {
  const g = await gate();
  if (g.holding) return Response.redirect(new URL("/route", req.url), 307);
  const rel = ((await ctx.params).path ?? []).join("/");
  return serveRide(req, rel, "public", "/route/ride", { cache: g.preview ? "private" : "public", noindex: !g.live });
}
