import { PublicShell } from "@/components/shells";
import { Holding } from "@/components/holding";
import { gate, publicMetadata } from "@/lib/public";
import { cameraEra, loadAlbum, lifeOrder, lite, type Photo } from "@/lib/janet";
import { AlbumGrid, type Group } from "@/components/album/album-grid";
import { AlbumHeader, AlbumNav } from "@/components/album/album-nav";

export const dynamic = "force-dynamic";
export const generateMetadata = () => publicMetadata("The cameras");

export default async function CamerasPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const g = await gate(await searchParams);
  if (g.holding) return <Holding />;
  const album = loadAlbum();
  const eras = new Map<string, { label: string; order: number; photos: Photo[] }>();
  for (const p of album.photos) {
    const e = cameraEra(p.cam, p.scan);
    const cur = eras.get(e.key) ?? { label: e.label, order: e.order, photos: [] };
    cur.photos.push(p);
    eras.set(e.key, cur);
  }
  const groups: Group[] = [...eras.entries()]
    .sort((a, b) => a[1].order - b[1].order || a[1].label.localeCompare(b[1].label))
    .map(([key, e]) => {
      const ys = e.photos.map((p) => p.year).filter((y): y is number => y != null);
      const span = ys.length ? (Math.min(...ys) === Math.max(...ys) ? String(ys[0]) : `${Math.min(...ys)} to ${Math.max(...ys)}`) : "";
      return { key, title: e.label, sub: `${e.photos.length} photographs${span ? ` · ${span}` : ""}`, photos: [...e.photos].sort(lifeOrder).map(lite) };
    });

  return (
    <PublicShell preview={g.preview} liveActive={g.liveActive}>
      <AlbumNav />
      <AlbumHeader title="The cameras" count={album.photos.length}>
        <p className="prose">
          Every digital photograph remembers the camera that took it. Read that way the album is a history of the family&rsquo;s phones: the
          scanned prints first, then a Leica, a Sony, a BlackBerry, a long run of iPhones and a folding Samsung. The look of each era is as much
          the camera&rsquo;s as the year&rsquo;s.
        </p>
        <div className="row mt-4 album-jump">
          {groups.map((gr) => (
            <a key={gr.key} className="btn" href={`#g-${gr.key}`}>
              {gr.title}
            </a>
          ))}
        </div>
      </AlbumHeader>
      <AlbumGrid groups={groups} size="sm" />
    </PublicShell>
  );
}
