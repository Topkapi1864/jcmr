import { PublicShell } from "@/components/shells";
import { Holding } from "@/components/holding";
import { gate, publicMetadata } from "@/lib/public";
import { loadAlbum, lifeOrder, lite, type Photo } from "@/lib/janet";
import { AlbumGrid, type Group } from "@/components/album/album-grid";
import { AlbumHeader, AlbumNav } from "@/components/album/album-nav";
import { AgeJump } from "@/components/album/age-jump";

export const dynamic = "force-dynamic";
export const generateMetadata = () => publicMetadata("The years");

const BORN = 1945;

export default async function YearsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const g = await gate(await searchParams);
  if (g.holding) return <Holding />;
  const album = loadAlbum();
  const byYear = new Map<number, Photo[]>();
  const undated: Photo[] = [];
  for (const p of album.photos) {
    if (p.year == null) undated.push(p);
    else byYear.set(p.year, [...(byYear.get(p.year) ?? []), p]);
  }
  const years = [...byYear.keys()].sort((a, b) => a - b);
  const groups: Group[] = years.map((y) => {
    const ps = byYear.get(y)!.sort(lifeOrder);
    const sure = ps.filter((p) => p.yc === "high").length;
    const age = y - BORN;
    const sub = `${ps.length} photograph${ps.length === 1 ? "" : "s"} · she was ${age}${sure < ps.length ? ` · ${ps.length - sure} dated by eye` : ""}`;
    return { key: String(y), title: String(y), sub, photos: ps.map(lite) };
  });
  if (undated.length) groups.push({ key: "undated", title: "Undated", sub: `${undated.length} the computer could not place`, photos: undated.map(lite) });

  // A decade strip to jump by.
  const decades = [...new Set(years.map((y) => Math.floor(y / 10) * 10))];

  return (
    <PublicShell preview={g.preview} liveActive={g.liveActive}>
      <AlbumNav />
      <AlbumHeader title="The years" count={album.photos.length}>
        <p className="prose">
          Year by year. Where a camera recorded the date, it is exact. Where a picture is a scan or a saved copy with no date, the year is the
          computer&rsquo;s guess from what is in the frame, and the count of those is given under each year.
        </p>
        <div className="row mt-4 album-jump">
          {decades.map((d) => (
            <a key={d} className="btn" href={`#g-${years.find((y) => y >= d)}`}>
              {d}s
            </a>
          ))}
        </div>
        <AgeJump years={years.map((y) => ({ y, n: byYear.get(y)!.length }))} born={BORN} />
      </AlbumHeader>
      <AlbumGrid groups={groups} size="sm" />
    </PublicShell>
  );
}
