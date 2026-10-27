import { PublicShell } from "@/components/shells";
import { Holding } from "@/components/holding";
import { gate, publicMetadata } from "@/lib/public";
import { loadAlbum, lifeOrder, lite } from "@/lib/janet";
import { AlbumGrid } from "@/components/album/album-grid";
import { AlbumHeader, AlbumNav } from "@/components/album/album-nav";

export const dynamic = "force-dynamic";
export const generateMetadata = () => publicMetadata("Laughing");

export default async function LaughingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const g = await gate(await searchParams);
  if (g.holding) return <Holding />;
  const album = loadAlbum();
  const ps = album.photos.filter((p) => p.laugh && p.janet !== "no").sort(lifeOrder);
  const share = Math.round((100 * ps.length) / album.photos.length);
  return (
    <PublicShell preview={g.preview} liveActive={g.liveActive}>
      <AlbumNav />
      <AlbumHeader title="Laughing" count={ps.length}>
        <p className="prose">
          The computer was asked one thing about each picture: is she laughing? In {ps.length} of them, {share} per cent of the album, the answer
          was yes. Here they all are.
        </p>
      </AlbumHeader>
      <AlbumGrid groups={[{ key: "laugh", title: "", photos: ps.map(lite) }]} size="md" />
    </PublicShell>
  );
}
