import { PublicShell } from "@/components/shells";
import { Holding } from "@/components/holding";
import { gate, publicMetadata } from "@/lib/public";
import { loadAlbum, lifeOrder, lite, OCCASION_LABELS, SETTING_LABELS, type Photo } from "@/lib/janet";
import { AlbumGrid, type Group } from "@/components/album/album-grid";
import { AlbumHeader, AlbumNav } from "@/components/album/album-nav";

export const dynamic = "force-dynamic";
export const generateMetadata = () => publicMetadata("The moments");

// Which of the computer's labels make a worthwhile group, and the order they read in.
const OCCASIONS = ["christmas", "birthday", "wedding", "holiday", "family-meal", "night-out", "day-out", "celebration", "dressing-up", "portrait", "music", "memorial"];
const SETTINGS = ["garden", "seaside", "boat", "pool-spa", "countryside", "restaurant", "pub-bar", "home", "town", "hotel", "party-venue", "church", "car"];

export default async function MomentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const g = await gate(await searchParams);
  if (g.holding) return <Holding />;
  const album = loadAlbum();
  const mk = (key: string, title: string, ps: Photo[]): Group | null =>
    ps.length >= 6 ? { key, title, sub: `${ps.length} photographs`, photos: [...ps].sort(lifeOrder).map(lite) } : null;

  const occGroups = OCCASIONS.map((o) => mk(`occ-${o}`, OCCASION_LABELS[o] ?? o, album.photos.filter((p) => p.occ.includes(o)))).filter((x): x is Group => !!x);
  const kids = mk("kids", "With the children", album.photos.filter((p) => p.kids));
  const crowd = mk("crowd", "A full table", album.photos.filter((p) => p.ppl >= 6));
  const alone = mk("alone", "Just her", album.photos.filter((p) => p.ppl === 1 && p.janet === "yes"));
  const setGroups = SETTINGS.map((s) => mk(`set-${s}`, SETTING_LABELS[s] ?? s, album.photos.filter((p) => p.set === s))).filter((x): x is Group => !!x);
  const extras = [kids, crowd, alone].filter((x): x is Group => !!x);
  const groups = [...occGroups, ...extras, ...setGroups];

  return (
    <PublicShell preview={g.preview} liveActive={g.liveActive}>
      <AlbumNav />
      <AlbumHeader title="The moments" count={album.photos.length}>
        <p className="prose">
          The album sorted by what is happening and where. The computer read each picture and gave it a label or two, so a photograph can turn
          up in more than one place, and a few will be in the wrong one.
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
