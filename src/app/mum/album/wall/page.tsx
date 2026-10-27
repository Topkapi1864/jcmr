import { PublicShell } from "@/components/shells";
import { Holding } from "@/components/holding";
import { gate, publicMetadata } from "@/lib/public";
import { loadAlbum, lifeOrder, lite } from "@/lib/janet";
import { AlbumGrid } from "@/components/album/album-grid";
import { AlbumHeader, AlbumNav } from "@/components/album/album-nav";

export const dynamic = "force-dynamic";
export const generateMetadata = () => publicMetadata("The wall");

export default async function WallPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const g = await gate(await searchParams);
  if (g.holding) return <Holding />;
  const album = loadAlbum();
  const photos = [...album.photos].sort(lifeOrder).map(lite);
  return (
    <PublicShell preview={g.preview} liveActive={g.liveActive}>
      <AlbumNav />
      <AlbumHeader title="The wall" count={photos.length}>
        <p className="prose">All of them, small, in the order she lived them. Tap any one to see it properly.</p>
      </AlbumHeader>
      <AlbumGrid groups={[{ key: "all", title: "", photos }]} size="xs" />
    </PublicShell>
  );
}
