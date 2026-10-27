import { PublicShell } from "@/components/shells";
import { Holding } from "@/components/holding";
import { gate, publicMetadata } from "@/lib/public";
import { loadAlbum, lite, type PhotoLite } from "@/lib/janet";
import { Mosaic } from "@/components/album/mosaic";
import { AlbumHeader, AlbumNav } from "@/components/album/album-nav";

export const dynamic = "force-dynamic";
export const generateMetadata = () => publicMetadata("The mosaic");

export default async function MosaicPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const g = await gate(sp);
  if (g.holding) return <Holding />;
  const album = loadAlbum();
  const which = album.mosaics.find((m) => m.key === sp.m) ?? album.mosaics[0];
  if (!which) return null;
  const used = new Set(which.cells);
  const photos: Record<string, PhotoLite> = {};
  for (const id of used) {
    const p = album.byId.get(id);
    if (p) photos[id] = lite(p);
  }
  return (
    <PublicShell preview={g.preview} liveActive={g.liveActive}>
      <AlbumNav />
      <AlbumHeader title="The mosaic" count={album.photos.length}>
        <p className="prose">
          {which.title} Every tile is a real photograph from the album, {which.cols} across and {which.rows} down, {used.size} different pictures
          chosen by colour to make the whole. Stand back and it is her; lean in and it is everyone.
        </p>
        {album.mosaics.length > 1 && (
          <div className="row mt-4">
            {album.mosaics.map((m) => (
              <a key={m.key} className={`btn${m.key === which.key ? " btn-primary" : ""}`} href={`/mum/album/mosaic?m=${m.key}`}>
                {m.key === album.mosaics[0].key ? "In the sea" : "The portrait"}
              </a>
            ))}
          </div>
        )}
      </AlbumHeader>
      <Mosaic mosaic={which} photos={photos} />
      <p className="small muted mt-4">
        For a print, the full-size file is <a href={`/album/${which.key}.jpg`}>here</a> ({which.cols * which.tile} by {which.rows * which.tile} pixels, enough for an A2 print).
      </p>
    </PublicShell>
  );
}
