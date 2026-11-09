import Link from "next/link";
import { requireCrew } from "@/lib/auth";
import { fmtHm } from "@/lib/plan";
import { listSpots, plannedLabel, plannedStops, spotKindFor, spotPhotoUrl } from "@/lib/stops";
import { StopSpotEditor } from "@/components/stop-spot-editor";

export const dynamic = "force-dynamic";

export default async function NewStopPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireCrew();
  const sp = await searchParams;
  const day = sp.day === "2" ? 2 : 1;
  const n = Number(sp.n);
  const [{ days }, spots] = await Promise.all([plannedStops(), listSpots()]);
  const p = n ? days.find((d) => d.day === day)?.stops.find((s) => s.n === n) : undefined;

  return (
    <div className="stack" style={{ maxWidth: "48rem" }}>
      <Link href="/crew/stops" className="small">
        ← Stops
      </Link>
      <h1>Pin a spot</h1>
      <StopSpotEditor
        initial={{ id: 0, name: "", kind: p ? spotKindFor(p.kind) : "hourly", notes: "", day, lat: null, lon: null }}
        ghost={p ? { lat: p.lat, lon: p.lon, label: `Day ${p.day}, stop ${p.n}` } : null}
        forLine={p ? `For day ${p.day}, stop ${p.n}: ${plannedLabel(p)} at mile ${p.mile.toFixed(0)}${p.town ? `, near ${p.town}` : ""}, planned ${fmtHm(p.arrive)}.` : null}
        others={spots.map((s) => ({ id: s.id, name: s.name, kind: s.kind, lat: s.lat, lon: s.lon, day: s.day, mile: s.mile, photo: s.firstPhoto ? spotPhotoUrl(s.firstPhoto) : null }))}
      />
    </div>
  );
}
