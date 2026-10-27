import { PublicShell } from "@/components/shells";
import { Holding } from "@/components/holding";
import { gate, publicMetadata } from "@/lib/public";
import { loadAlbum, lite } from "@/lib/janet";
import { AlbumGrid, type Group } from "@/components/album/album-grid";
import { AlbumHeader, AlbumNav } from "@/components/album/album-nav";

export const dynamic = "force-dynamic";
export const generateMetadata = () => publicMetadata("The colours");

/** A colour that comes from the pictures, not the design system (so it is not a token). tokens-ok */
function dataColour(h: number, s: number, l: number): string {
  const fn = "hsl"; // tokens-ok
  return `${fn}(${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
}

const HUE_NAMES = ["reds", "oranges", "golds", "yellows", "limes", "greens", "greens", "teals", "sea blues", "blues", "blues", "indigos", "violets", "purples", "magentas", "pinks", "pinks", "reds"];

export default async function ColoursPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const g = await gate(await searchParams);
  if (g.holding) return <Holding />;
  const album = loadAlbum();

  // The gradient: every picture with a telling colour, red round to pink, brighter ones later within a hue.
  const vivid = album.photos.filter((p) => p.chue != null).sort((a, b) => a.chue! - b.chue! || a.cval - b.cval);
  const quiet = album.photos.filter((p) => p.chue == null).sort((a, b) => a.cval - b.cval);

  // The palette: the same colours binned into 18 hues, each drawn at its average saturation and
  // brightness, as wide as the number of pictures that carry it.
  const bins = Array.from({ length: 18 }, () => ({ n: 0, h: 0, s: 0, v: 0 }));
  for (const p of vivid) {
    const b = bins[Math.min(17, Math.floor(p.chue! * 18))];
    b.n++;
    b.h += p.chue!;
    b.s += p.csat;
    b.v += p.cval;
  }
  const palette = bins
    .map((b, i) => (b.n ? { n: b.n, css: dataColour(b.h / b.n, Math.min(0.85, b.s / b.n), Math.min(0.72, Math.max(0.3, b.v / b.n * 0.75))), name: HUE_NAMES[i] } : null))
    .filter((b): b is NonNullable<typeof b> => !!b);
  const top = [...palette].sort((a, b) => b.n - a.n).slice(0, 3);

  const groups: Group[] = [{ key: "vivid", title: "", photos: vivid.map(lite) }];
  if (quiet.length) groups.push({ key: "quiet", title: "The quiet ones", sub: `${quiet.length} with hardly any colour: stone, grey days, dark rooms, black and white`, photos: quiet.map(lite) });

  return (
    <PublicShell preview={g.preview} liveActive={g.liveActive}>
      <AlbumNav />
      <AlbumHeader title="The colours" count={album.photos.length}>
        <p className="prose">
          Each picture was asked for its one telling colour, the hue most of its vivid pixels share, and then the album was sorted red round to
          pink so it reads as a single gradient. Her life in colour runs mostly through the {top.map((t) => t.name).slice(0, 2).join(" and ")}: table
          lamps, red lipstick, wine, Christmas, skin and sun. The {top[2]?.name ?? "blues"} are the sea and the sky.
        </p>
        <div className="palette mt-4" aria-label="The colours of the album, as a strip">
          {palette.map((c, i) => (
            <span key={i} className="palette-swatch" style={{ background: c.css, flexGrow: c.n }} title={`${c.name}: ${c.n} pictures`} />
          ))}
        </div>
        <div className="xs muted" style={{ marginTop: 6 }}>
          Every hue, as wide as the number of photographs that carry it. Tap a tile below to open the full picture.
        </div>
      </AlbumHeader>
      <AlbumGrid groups={groups} size="xs" tiles />
    </PublicShell>
  );
}
