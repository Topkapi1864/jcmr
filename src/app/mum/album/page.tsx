import Link from "next/link";
import { PublicShell } from "@/components/shells";
import { Holding } from "@/components/holding";
import { gate, publicMetadata } from "@/lib/public";
import { loadAlbum } from "@/lib/janet";
import { VIEWS, AlbumHeader } from "@/components/album/album-nav";

export const dynamic = "force-dynamic";
export const generateMetadata = () => publicMetadata("The album");

export default async function AlbumHub({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const g = await gate(await searchParams);
  if (g.holding) return <Holding />;
  const album = loadAlbum();
  const n = album.photos.length;
  const years = album.photos.map((p) => p.year).filter((y): y is number => y != null);
  const first = Math.min(...years);
  const last = Math.max(...years);
  const withJanet = album.photos.filter((p) => p.janet === "yes").length;
  const mosaic = album.mosaics[0];

  // One picture per view, for the cards: the best of each kind, no picture used twice.
  const taken = new Set<string>();
  const best = (pred: (p: (typeof album.photos)[number]) => boolean) => {
    const id = [...album.photos].filter((p) => pred(p) && !taken.has(p.id)).sort((a, b) => b.q - a.q || a.id.localeCompare(b.id))[0]?.id;
    if (id) taken.add(id);
    return id;
  };
  const covers: Record<string, string | undefined> = {
    "/mum/album/wall": best((p) => p.janet === "yes" && p.ppl >= 3),
    "/mum/album/years": best((p) => p.year != null && p.year < 2010 && p.janet === "yes"),
    "/mum/album/people": best((p) => p.janet === "yes" && p.ppl === 2),
    "/mum/album/moments": best((p) => p.occ.includes("christmas")),
    "/mum/album/laughing": best((p) => p.laugh && p.janet === "yes"),
    "/mum/album/colours": best((p) => p.sat > 0.45 && p.janet === "yes"),
    "/mum/album/cameras": best((p) => p.scan),
    "/mum/album/miles": best((p) => p.set === "countryside" && p.janet === "yes"),
  };

  return (
    <PublicShell preview={g.preview} liveActive={g.liveActive}>
      <AlbumHeader title="The album" count={n}>
        <p className="prose">
          {n.toLocaleString("en-GB")} photographs of Mum, from {first} to {last}. She is in {withJanet.toLocaleString("en-GB")} of them. The same pictures,
          looked at nine different ways. Nothing here was captioned or sorted by hand: the groupings, the guessed years and the faces are all the
          computer&rsquo;s work, so treat them as a way in rather than a record.
        </p>
      </AlbumHeader>

      <div className="album-hub">
        {mosaic && (
          <Link href="/mum/album/mosaic" className="album-hero" aria-label="The mosaic">
            <img src={`/album/${mosaic.key}-1200.jpg`} alt="A portrait of Janet made from every photograph in the album" width={1200} height={1600} />
            <span className="album-hero-caption">Every photograph in the album, arranged into one picture of her. Tap to explore.</span>
          </Link>
        )}
        <div className="album-cards">
          {VIEWS.filter((v) => v.href !== "/mum/album/mosaic").map((v) => (
            <Link key={v.href} href={v.href} className="album-card card">
              {covers[v.href] && <img src={`/album/thumb/${covers[v.href]}.jpg`} alt="" loading="lazy" />}
              <div>
                <h2>{v.label}</h2>
                <p className="muted small">{v.blurb}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </PublicShell>
  );
}
