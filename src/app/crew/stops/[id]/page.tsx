import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCrew } from "@/lib/auth";
import { fmtWhen } from "@/lib/time";
import { getSpot, listSpots, placeOnRoute, spotPhotos, spotPhotoUrl } from "@/lib/stops";
import { directionsUrl, SPOT_KIND_LABEL, streetViewUrl } from "@/lib/stop-place";
import { MessageBody } from "@/components/message-body";
import { SpotPhotos } from "@/components/spot-photos";
import { StopSpotEditor } from "@/components/stop-spot-editor";
import { StopsMap } from "@/components/stops-map";

export const dynamic = "force-dynamic";

export default async function StopPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  await requireCrew();
  const sp = await searchParams;
  const s = await getSpot(Number((await params).id));
  if (!s) notFound();
  const [photos, spots] = await Promise.all([spotPhotos(s.id), listSpots()]);
  const placed = placeOnRoute(s.lat, s.lon);

  return (
    <div className="stack" style={{ maxWidth: "48rem" }}>
      <Link href="/crew/stops" className="small">
        ← Stops
      </Link>
      <div>
        <h1 style={{ marginBottom: 4 }}>{s.name}</h1>
        <p className="small muted" style={{ margin: 0 }}>
          <span className="badge">{SPOT_KIND_LABEL[s.kind] ?? s.kind}</span> Day {s.day}
          {s.mile != null ? `, mile ${s.mile.toFixed(1)}` : ""}
          {placed?.town ? `, near ${placed.town}` : ""} · pinned by {s.createdBy}
          {s.updatedAt ? `, last changed ${fmtWhen(s.updatedAt)}${s.updatedBy && s.updatedBy !== s.createdBy ? ` by ${s.updatedBy}` : ""}` : ""}
        </p>
      </div>
      {sp.saved && <p className="notice">Saved.{sp.photosFailed ? ` ${sp.photosFailed} picture${sp.photosFailed === "1" ? "" : "s"} didn't go up; try adding again.` : ""}</p>}

      <p className="row" style={{ gap: "var(--space-2)", flexWrap: "wrap", margin: 0 }}>
        <a className="btn btn-sm btn-primary" href={directionsUrl(s)} target="_blank" rel="noopener">
          Directions
        </a>
        <a className="btn btn-sm" href={streetViewUrl(s)} target="_blank" rel="noopener">
          Street View
        </a>
        <span className="small muted">
          {s.lat.toFixed(5)}, {s.lon.toFixed(5)}
        </span>
      </p>
      <StopsMap spots={[{ id: s.id, name: s.name, kind: s.kind, lat: s.lat, lon: s.lon, day: s.day, mile: s.mile, photo: null }]} />
      {s.notes && <MessageBody text={s.notes} className="card" />}

      <section className="stack-sm">
        <h2>Pictures</h2>
        <SpotPhotos photos={photos.map((p) => ({ id: p.id, url: spotPhotoUrl(p.id), caption: p.caption, addedBy: p.addedBy, when: fmtWhen(p.addedAt) }))} />
      </section>

      <details className="stack-sm" open={!photos.length && !s.notes}>
        <summary>
          <b>Change it</b> <span className="small muted">(move the pin, rename, notes, more pictures)</span>
        </summary>
        <StopSpotEditor
          key={s.updatedAt ?? s.createdAt}
          initial={{ id: s.id, name: s.name, kind: s.kind, notes: s.notes, day: s.day, lat: s.lat, lon: s.lon }}
          others={spots.filter((x) => x.id !== s.id).map((x) => ({ id: x.id, name: x.name, kind: x.kind, lat: x.lat, lon: x.lon, day: x.day, mile: x.mile, photo: x.firstPhoto ? spotPhotoUrl(x.firstPhoto) : null }))}
        />
      </details>
    </div>
  );
}
