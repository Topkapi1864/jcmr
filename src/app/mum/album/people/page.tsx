import { PublicShell } from "@/components/shells";
import { Holding } from "@/components/holding";
import { gate, publicMetadata } from "@/lib/public";
import { loadAlbum, lifeOrder, lite } from "@/lib/janet";
import { AlbumGrid, type Group } from "@/components/album/album-grid";
import { AlbumHeader, AlbumNav } from "@/components/album/album-nav";

export const dynamic = "force-dynamic";
export const generateMetadata = () => publicMetadata("Her people");

const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth"];

export default async function PeoplePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const g = await gate(await searchParams);
  if (g.holding) return <Holding />;
  const album = loadAlbum();
  const people = album.people;
  const groups: Group[] = people.map((person, i) => {
    const ps = person.photos
      .map((id) => album.byId.get(id))
      .filter((p): p is NonNullable<typeof p> => !!p)
      .sort(lifeOrder);
    const span = person.years ? `${person.years[0]} to ${person.years[1]}` : "";
    return {
      key: `c${person.c}`,
      title: `Together in ${ps.length} photographs`,
      sub: span ? `The ${ORDINALS[i] ?? `${i + 1}th`} face the computer kept finding beside her, ${span}` : undefined,
      photos: ps.map(lite),
    };
  });

  return (
    <PublicShell preview={g.preview} liveActive={g.liveActive}>
      <AlbumNav />
      <AlbumHeader title="Her people" count={album.photos.length}>
        <p className="prose">
          The computer looked at every face in the album and sorted them into people. It does not know who anyone is, so nobody is named. These are
          the faces it found beside her most often, each with the photographs they share. Tap a face to jump to their pictures.
        </p>
      </AlbumHeader>

      <div className="people-strip">
        {people.map((person, i) => (
          <a key={person.c} href={`#g-c${person.c}`} className="people-face" title={`Together in ${person.n} photographs`}>
            <span className="people-face-img" style={{ backgroundImage: `url(/album/faces/c${person.c}.jpg)` }} aria-hidden="true" />
            <span className="people-face-n">{person.n}</span>
            <span className="sr-only">
              {ORDINALS[i] ?? i + 1} person, together in {person.n} photographs
            </span>
          </a>
        ))}
      </div>

      <AlbumGrid groups={groups} size="sm" />
    </PublicShell>
  );
}
