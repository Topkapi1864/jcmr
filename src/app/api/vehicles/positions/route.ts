import { getSession } from "@/lib/auth";
import { listVehicles, positionsFor, vehicleColour } from "@/lib/vehicles";

// The crew map's feed: every active vehicle, its colour, latest fix and a short trail.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const s = await getSession();
  if (!s) return new Response("Sign in", { status: 401 });
  const only = Number(new URL(req.url).searchParams.get("vehicle")) || null;
  const vehicles = (await listVehicles()).filter((v) => !only || v.id === only);
  const pos = await positionsFor(vehicles.map((v) => v.id));
  return Response.json(
    {
      now: new Date().toISOString(),
      vehicles: vehicles.map((v) => {
        const trail = pos.get(v.id) ?? [];
        const last = trail.at(-1) ?? null;
        return {
          id: v.id,
          name: v.name,
          colour: vehicleColour(v.colour),
          registration: v.registration,
          last: last && { lat: last.lat, lng: last.lng, at: last.at, accuracy: last.accuracy, speed: last.speed, battery: last.battery, source: last.source, by: last.by },
          trail: trail.map((p) => [p.lat, p.lng]),
        };
      }),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
