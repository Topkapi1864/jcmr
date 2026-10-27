import { PublicShell } from "@/components/shells";
import { Holding } from "@/components/holding";
import { gate, publicMetadata } from "@/lib/public";
import { everyMile, loadAlbum, lite } from "@/lib/janet";
import { AlbumGrid, type Group } from "@/components/album/album-grid";
import { AlbumHeader, AlbumNav } from "@/components/album/album-nav";
import { livePayload } from "@/lib/live";

export const dynamic = "force-dynamic";
export const generateMetadata = () => publicMetadata("Every mile");

export default async function MilesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const g = await gate(await searchParams);
  if (g.holding) return <Holding />;
  const album = loadAlbum();
  const { blocks, profiles, total } = everyMile(album);
  const d1 = profiles.find((p) => p.day === 1)!;
  const perMile = album.photos.length / total;
  // During the ride the crew's posts say roughly how far the riders have got; the miles
  // still ahead are shown faded until they pass them.
  const live = await livePayload();
  const riding = live.phase !== "pre";
  const here = riding ? Math.max(0, Math.min(total, live.mile)) : null;

  const groups: Group[] = blocks.map((b) => {
    const ps = b.ids.map((id) => album.byId.get(id)!);
    const ys = ps.map((p) => p.year).filter((y): y is number => y != null);
    const span = ys.length ? (Math.min(...ys) === Math.max(...ys) ? String(ys[0]) : `${Math.min(...ys)} to ${Math.max(...ys)}`) : "";
    const place = b.town ? `near ${b.town}` : `${b.dayMile} miles into day ${b.day}`;
    const ahead = here != null && live.phase !== "finished" && b.mile + 1 > here;
    const isHere = here != null && live.phase === "riding" && Math.floor(here) === b.mile;
    return {
      key: `m${b.mile}`,
      title: `Mile ${b.mile + 1}`,
      sub: `Day ${b.day} · ${place}${span ? ` · ${span}` : ""}`,
      photos: ps.map(lite),
      dim: ahead,
      marker: isHere ? "The riders are about here" : undefined,
    };
  });

  // Jump points: the start, each named town once, and the two ends.
  const seen = new Set<string>();
  const jumps = blocks.filter((b) => b.town && !seen.has(b.town) && seen.add(b.town)).map((b) => ({ mile: b.mile, label: b.town! }));

  return (
    <PublicShell preview={g.preview} liveActive={g.liveActive}>
      <AlbumNav />
      <AlbumHeader title="Every mile" count={album.photos.length}>
        <p className="prose">
          The route is {Math.round(total)} miles and the album is {album.photos.length.toLocaleString("en-GB")} photographs, so there are about{" "}
          {perMile.toFixed(1)} for every mile. Laid along the road in the order she lived them, the earliest pictures sit at the start in Barnes and
          the last ones at the cemetery in Yeadon. Day 1 ends at mile {Math.round(d1.miles)}.
          {riding && live.phase !== "finished"
            ? ` The riders have reached about mile ${Math.round(here ?? 0)}; the pictures still ahead of them are faded until they pass.`
            : riding
              ? " They rode the whole way, so every picture is lit."
              : " During the ride, the pictures the riders have passed will light up as they go."}
        </p>
        <div className="row mt-4 album-jump">
          {jumps.map((j) => (
            <a key={j.mile} className="btn" href={`#g-m${j.mile}`}>
              {j.label}
            </a>
          ))}
        </div>
      </AlbumHeader>
      <AlbumGrid groups={groups} size="sm" showYears />
    </PublicShell>
  );
}
