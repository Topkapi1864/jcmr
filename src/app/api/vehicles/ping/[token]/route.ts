import { addPosition, vehicleByToken } from "@/lib/vehicles";
import { rateLimited } from "@/lib/util";
import { pingOk, readPing } from "@/lib/ping";

// Where a tracker app sends a vehicle's position. The address carries the
// vehicle's own token (Crew → Vehicles → a vehicle → Location), so no sign-in.
// The formats understood are in src/lib/ping.ts. /api/track/<token> takes the
// same traffic and also knows people's tokens.
export const dynamic = "force-dynamic";

async function handle(req: Request, token: string) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "?";
  if (rateLimited(`ping:${ip}`, 240, 60_000)) return new Response("Slow down", { status: 429 });
  const vehicle = await vehicleByToken(token);
  if (!vehicle || !vehicle.active) {
    await new Promise((r) => setTimeout(r, 300));
    return new Response("Not found", { status: 404 });
  }
  const p = await readPing(req);
  if (p.kind === "ignore") return pingOk();
  if (p.kind === "error") return new Response(p.message, { status: 400 });
  const ok = await addPosition(vehicle.id, { ...p.ping, source: "tracker" });
  if (!ok) return new Response("Bad position", { status: 400 });
  return pingOk();
}

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  return handle(req, (await ctx.params).token);
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  return handle(req, (await ctx.params).token);
}
