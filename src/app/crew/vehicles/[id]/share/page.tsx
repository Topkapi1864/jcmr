import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCrew } from "@/lib/auth";
import { getVehicle, vehicleColour } from "@/lib/vehicles";
import { LocationSharer } from "@/components/location-sharer";

export const dynamic = "force-dynamic";

// The page the phone in the vehicle keeps open.
export default async function ShareLocationPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCrew();
  const v = await getVehicle(Number((await params).id));
  if (!v || !v.active) notFound();
  return (
    <div className="stack veh-page" style={{ maxWidth: "30rem", "--vc": vehicleColour(v.colour) } as React.CSSProperties}>
      <Link href={`/crew/vehicles/${v.id}#location`} className="small">
        ← {v.name}
      </Link>
      <h2 style={{ margin: 0 }}>Share this phone&rsquo;s location</h2>
      <LocationSharer vehicleId={v.id} vehicleName={v.name} />
      <ul className="list small muted">
        <li>Sends where this phone is every 30 seconds (sooner after a real move) to the crew map.</li>
        <li>Keep the phone on a charger with this page on screen. The screen stays on while sharing where the phone allows it; if it locks, sharing pauses until you come back.</li>
        <li>For sharing that carries on with the screen off, use a tracker app — see Location on the vehicle&rsquo;s page.</li>
      </ul>
    </div>
  );
}
