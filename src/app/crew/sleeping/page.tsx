import Link from "next/link";
import { NIGHTS, NIGHT_DATES, NIGHT_LABELS, NIGHT_WHERE, type Night, type SleepingPlace, type SleepingRow } from "@/db/schema";
import { activePeople, requireCrew } from "@/lib/auth";
import { allSleeping, canEditPerson, places, seedPlaces } from "@/lib/sleeping";
import { fmtWhen } from "@/lib/time";
import { saveSleeping } from "./actions";

export const dynamic = "force-dynamic";

type Person = { id: number; name: string; shortName: string };

function Cell({ row, place }: { row?: SleepingRow; place?: SleepingPlace }) {
  if (!row) return <span className="muted">?</span>;
  return (
    <>
      {place ? <b>{place.name}</b> : null}
      {row.note && <div className="xs muted">{row.note}</div>}
    </>
  );
}

function RowForm({ p, rows, placeList }: { p: Person; rows: Record<Night, SleepingRow | undefined>; placeList: SleepingPlace[] }) {
  return (
    <form action={saveSleeping} className="stack-sm" style={{ marginTop: 8 }}>
      <input type="hidden" name="personId" value={p.id} />
      {NIGHTS.map((n) => (
        <div key={n} className="form-inline">
          <label className="field" style={{ flex: "1 1 12rem" }}>
            <span>
              {NIGHT_LABELS[n]} {NIGHT_DATES[n]} · {NIGHT_WHERE[n]}
            </span>
            <select name={`place_${n}`} defaultValue={rows[n]?.placeId ?? ""}>
              <option value="">— not decided</option>
              {placeList.map((pl) => (
                <option key={pl.id} value={pl.id}>
                  {pl.name}
                  {pl.town ? ` (${pl.town})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ flex: "2 1 12rem" }}>
            <span>Note</span>
            <input type="text" name={`note_${n}`} defaultValue={rows[n]?.note ?? ""} placeholder="room-share, arriving late, camping in the garden…" />
          </label>
        </div>
      ))}
      <div>
        <button className="btn btn-sm btn-primary" type="submit">
          Save {p.shortName}&rsquo;s nights
        </button>
      </div>
    </form>
  );
}

export default async function SleepingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireCrew();
  const sp = await searchParams;
  const admin = s.role === "admin";
  let placeList = await places();
  if (placeList.length === 0) {
    await seedPlaces();
    placeList = await places();
  }
  const allPlaces = await places(true);
  const placeById = new Map(allPlaces.map((p) => [p.id, p]));
  // Fiona is an AI and does not need a bed.
  const people = (await activePeople()).filter((p) => p.shortName !== "Fiona");
  const rows = await allSleeping();
  const byPerson = new Map<number, Record<Night, SleepingRow | undefined>>();
  for (const p of people) byPerson.set(p.id, { thu: undefined, fri: undefined, sat: undefined, sun: undefined });
  for (const r of rows) {
    const rec = byPerson.get(r.personId);
    if (rec) rec[r.night] = r;
  }
  const decided = rows.length;
  const total = people.length * NIGHTS.length;
  const lastChange = rows.map((r) => r.updatedAt).sort().at(-1);

  // Who is where, per night — the thing the person booking beds needs.
  const perNight = NIGHTS.map((n) => {
    const groups = new Map<string, { place?: SleepingPlace; names: string[] }>();
    for (const p of people) {
      const r = byPerson.get(p.id)?.[n];
      const key = r ? (r.placeId ? `p${r.placeId}` : "note") : "undecided";
      const g = groups.get(key) ?? { place: r?.placeId ? placeById.get(r.placeId) : undefined, names: [] };
      g.names.push(p.shortName + (r && !r.placeId && r.note ? ` (${r.note})` : ""));
      groups.set(key, g);
    }
    const ordered = [...groups.entries()].sort(([a], [b]) => (a === "undecided" ? 1 : b === "undecided" ? -1 : 0));
    return { night: n, groups: ordered };
  });

  return (
    <div className="stack">
      <div className="row-between">
        <h2 style={{ margin: 0 }}>Sleeping arrangements</h2>
        <div className="row">
          {admin && (
            <Link className="btn btn-sm" href="/crew/sleeping/places">
              Places
            </Link>
          )}
          <a className="btn btn-sm" href="#by-night">
            Who is where
          </a>
          <a className="btn btn-sm btn-primary" href={`#p-${s.pid}`}>
            My nights
          </a>
        </div>
      </div>
      <p className="muted small">
        Every rider and crew member, and where they sleep on each of the four nights. Thursday and Friday are in London before the start, Saturday is the
        Loughborough overnight, Sunday is Yeadon after the finish. Fill in your own row; admins can fill in anyone&rsquo;s.
      </p>
      {sp.saved && <p className="notice">Saved.</p>}
      <div className="counts">
        <span>
          <b>{decided}</b> of {total} nights decided
        </span>
        {lastChange && <span className="muted">· last change {fmtWhen(lastChange)}</span>}
      </div>

      <div className="table-wrap">
        <table className="table" style={{ minWidth: 640 }}>
          <thead>
            <tr>
              <th>Who</th>
              {NIGHTS.map((n) => (
                <th key={n}>
                  {NIGHT_LABELS[n]}
                  <br />
                  <span className="faint">
                    {NIGHT_DATES[n]} · {NIGHT_WHERE[n]}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {people.map((p) => {
              const rec = byPerson.get(p.id)!;
              return (
                <tr key={p.id} id={`p-${p.id}`} style={p.id === s.pid ? { background: "var(--color-bg-sunken)" } : undefined}>
                  <td>
                    <b>{p.name}</b>
                    {p.id === s.pid && <div className="xs muted">you</div>}
                  </td>
                  {NIGHTS.map((n) => (
                    <td key={n}>
                      <Cell row={rec[n]} place={rec[n]?.placeId ? placeById.get(rec[n]!.placeId!) : undefined} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section className="stack">
        <h3 className="group-title">
          <span>Fill in</span>
          <span className="small muted">{admin ? "anyone's nights" : "your nights"}</span>
        </h3>
        {people
          .filter((p) => canEditPerson(s, p.id))
          .map((p) => {
            const rec = byPerson.get(p.id)!;
            const last = NIGHTS.map((n) => rec[n]).filter(Boolean) as SleepingRow[];
            const latest = last.map((r) => r.updatedAt).sort().at(-1);
            const open = p.id === s.pid;
            return (
              <details key={p.id} className="card" open={open}>
                <summary style={{ cursor: "pointer", minHeight: 32, display: "flex", alignItems: "center", gap: 8 }}>
                  <b>{p.name}</b>
                  <span className="small muted">
                    {last.length} of 4 decided
                    {latest ? ` · updated ${fmtWhen(latest)}` : ""}
                  </span>
                </summary>
                <RowForm p={p} rows={rec} placeList={placeList} />
              </details>
            );
          })}
      </section>

      <section id="by-night" className="stack">
        <h3 className="group-title">
          <span>Who is where</span>
          <span className="small muted">per night</span>
        </h3>
        <div className="tiles">
          {perNight.map(({ night, groups }) => (
            <div key={night} className="tile" style={{ cursor: "default" }}>
              <span className="eyebrow">
                {NIGHT_DATES[night]} · {NIGHT_WHERE[night]}
              </span>
              <h2>{NIGHT_LABELS[night]} night</h2>
              <ul className="list small" style={{ marginTop: 8 }}>
                {groups.map(([key, g]) => (
                  <li key={key}>
                    <b>{key === "undecided" ? "Not decided" : key === "note" ? "Other" : g.place?.name}</b>
                    {g.place?.beds != null && (
                      <span className={`mono xs ${g.names.length > g.place.beds ? "red" : "muted"}`}>
                        {" "}
                        {g.names.length}/{g.place.beds} beds
                      </span>
                    )}
                    {key !== "undecided" && g.place?.beds == null && <span className="mono xs muted"> {g.names.length}</span>}
                    <div className={key === "undecided" ? "muted" : undefined}>{g.names.join(", ")}</div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
