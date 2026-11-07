import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCrew } from "@/lib/auth";
import { canEditMember, crewMember } from "@/lib/people";
import { trackerTokenFor } from "@/lib/tracking";
import { trackUrlBase } from "@/lib/track-url";
import { possessive } from "@/lib/util";
import { TrackerSetup } from "@/components/tracker-setup";
import { VehicleMap } from "@/components/vehicle-map";

export const dynamic = "force-dynamic";

/** Someone else's phone: their address and the steps, for an admin to send them or walk them through. */
export default async function TrackPersonPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireCrew();
  const pid = Number((await params).id);
  const who = await crewMember(pid);
  if (!who) notFound();
  if (!canEditMember(s, pid)) {
    return (
      <div className="stack" style={{ maxWidth: "36rem" }}>
        <Link href="/crew/track" className="small">
          ← Tracking
        </Link>
        <p className="muted">Only {who.shortName} or an admin can see {possessive(who.shortName)} tracking address.</p>
      </div>
    );
  }
  const url = (await trackUrlBase()) + (await trackerTokenFor(pid));
  return (
    <div className="stack" style={{ maxWidth: "40rem" }}>
      <Link href="/crew/track" className="small">
        ← Tracking
      </Link>
      <h1>
        {who.shortName} <span className="muted">· {who.isRider ? "rider" : who.d.crewRole || "crew"}</span>
      </h1>
      <TrackerSetup url={url} name={who.shortName} personId={pid} isSelf={pid === s.pid} sp={await searchParams} />
      <VehicleMap />
    </div>
  );
}
