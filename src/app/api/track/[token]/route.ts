import { addPersonPosition, personByToken } from "@/lib/tracking";
import { addPosition, vehicleByToken } from "@/lib/vehicles";
import { rateLimited } from "@/lib/util";
import { pingOk, readPing } from "@/lib/ping";

// Where a phone's tracking app sends its position. The address carries the
// person's own token (Crew → Tracking) — or a vehicle's (Crew → Vehicles → a
// vehicle → Location) — so there is no sign-in. Formats: src/lib/ping.ts.
export const dynamic = "force-dynamic";

async function handle(req: Request, token: string) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "?";
  if (rateLimited(`ping:${ip}`, 240, 60_000)) return new Response("Slow down", { status: 429 });
  const person = await personByToken(token);
  const vehicle = person ? undefined : await vehicleByToken(token);
  if (!(person?.active || vehicle?.active)) {
    await new Promise((r) => setTimeout(r, 300));
    return new Response("Not found", { status: 404 });
  }
  const p = await readPing(req);
  if (p.kind === "ignore") return pingOk();
  if (p.kind === "error") return new Response(p.message, { status: 400 });
  const ok = person ? await addPersonPosition(person.id, p.ping) : await addPosition(vehicle!.id, { ...p.ping, source: "tracker" });
  if (!ok) return new Response("Bad position", { status: 400 });
  return pingOk();
}

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  return handle(req, (await ctx.params).token);
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  return handle(req, (await ctx.params).token);
}
