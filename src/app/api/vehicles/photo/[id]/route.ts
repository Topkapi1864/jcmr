import { getSession } from "@/lib/auth";
import { vehiclePhoto } from "@/lib/vehicles";

// Vehicle photos live in the database (resized in the browser before upload).
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return new Response("Sign in", { status: 401 });
  const row = await vehiclePhoto(Number((await ctx.params).id));
  const m = row?.photo ? /^data:(image\/jpeg);base64,(.+)$/.exec(row.photo) : null;
  if (!m) return new Response("No photo", { status: 404 });
  return new Response(Buffer.from(m[2], "base64"), {
    headers: { "content-type": m[1], "cache-control": "private, max-age=86400" },
  });
}
