import { getSession } from "@/lib/auth";
import { addPosition, getVehicle } from "@/lib/vehicles";

// "Share this phone's location" posts here while the share page is open.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return new Response("Sign in", { status: 401 });
  const b = (await req.json().catch(() => null)) as { vehicleId?: number; lat?: number; lng?: number; accuracy?: number; speed?: number; battery?: number } | null;
  if (!b?.vehicleId) return new Response("Bad request", { status: 400 });
  const v = await getVehicle(Number(b.vehicleId));
  if (!v || !v.active) return new Response("No such vehicle", { status: 404 });
  const ok = await addPosition(v.id, { lat: Number(b.lat), lng: Number(b.lng), accuracy: b.accuracy, speed: b.speed, battery: b.battery, source: "phone", by: s.name });
  return ok ? Response.json({ ok: true }) : new Response("Bad position", { status: 400 });
}
