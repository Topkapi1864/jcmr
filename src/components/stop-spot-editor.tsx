"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StopsMap } from "./stops-map";
import type { MapSpot } from "./stops-map-inner";
import { parsePlace, SPOT_KIND_LABEL, streetViewUrl, mapsUrl } from "@/lib/stop-place";
import { shrinkImage } from "@/lib/shrink-image";
import { addPhotoAction, placeAction, removeSpotAction, resolveAction, saveSpotAction } from "@/app/crew/stops/actions";

type Placed = { day: 1 | 2; mile: number; offMi: number; town: string | null } | null;

export type SpotEditorInitial = {
  id: number;
  name: string;
  kind: string;
  notes: string;
  day: number;
  lat: number | null;
  lon: number | null;
};

type Props = {
  initial: SpotEditorInitial;
  /** Where the plan puts the stop this spot is for. */
  ghost?: { lat: number; lon: number; label: string } | null;
  /** The other pinned spots, faint, so two people don't scout the same lay-by. */
  others?: MapSpot[];
  /** Planned-stop context line, e.g. "Day 1, stop 3: 60 min stop at mile 27, planned 09:20". */
  forLine?: string | null;
};

type Pending = { key: string; data: string; caption: string };

export function StopSpotEditor({ initial, ghost, others, forLine }: Props) {
  const router = useRouter();
  const isNew = !initial.id;
  const [name, setName] = useState(initial.name);
  const [kind, setKind] = useState(initial.kind);
  const [notes, setNotes] = useState(initial.notes);
  const [pin, setPin] = useState<{ lat: number; lon: number } | null>(initial.lat != null && initial.lon != null ? { lat: initial.lat, lon: initial.lon } : null);
  const [placed, setPlaced] = useState<Placed>(null);
  const [paste, setPaste] = useState("");
  const [pasteMsg, setPasteMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [pending, setPending] = useState<Pending[]>([]);
  const [, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  // Where the pin sits on the route, whenever it moves.
  useEffect(() => {
    if (!pin) {
      setPlaced(null);
      return;
    }
    let live = true;
    placeAction(pin.lat, pin.lon).then((p) => live && setPlaced(p));
    return () => {
      live = false;
    };
  }, [pin?.lat, pin?.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  function pick(lat: number, lon: number) {
    setPin({ lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6 });
    setErr("");
  }

  async function findPasted() {
    const t = paste.trim();
    if (!t) return;
    const quick = parsePlace(t);
    if (quick) {
      pick(quick.lat, quick.lon);
      setPasteMsg("Pinned. Drag the pin or tap the map to fine-tune it.");
      return;
    }
    setPasteMsg("Looking that up…");
    const r = await resolveAction(t);
    if (r) {
      pick(r.lat, r.lon);
      setPasteMsg("Pinned. Drag the pin or tap the map to fine-tune it.");
    } else setPasteMsg("Couldn't find a position in that. In Google Maps, long-press the spot and copy the numbers that appear (like 52.6312, -1.1245), or tap the map here instead.");
  }

  function hereNow() {
    if (!navigator.geolocation) return setPasteMsg("This phone won't share its location.");
    setPasteMsg("Finding you…");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        pick(p.coords.latitude, p.coords.longitude);
        setPasteMsg(`Pinned where you are (to about ${Math.round(p.coords.accuracy)} m).`);
      },
      () => setPasteMsg("Couldn't get your location. Check the browser is allowed to use it."),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy("Getting the pictures ready…");
    const out: Pending[] = [];
    for (const f of Array.from(files)) {
      try {
        out.push({ key: `p${seq.current++}`, data: await shrinkImage(f), caption: "" });
      } catch {
        setErr(`Couldn't read ${f.name}. Try a JPEG, PNG or a screenshot.`);
      }
    }
    setPending((p) => [...p, ...out].slice(0, 12));
    setBusy("");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function save() {
    setErr("");
    if (!pin) return setErr("Put the pin on the map first: paste a link, tap the map, or use where you are.");
    if (!name.trim()) return setErr("Give the stop a name (the lay-by, the pub car park, the village).");
    setBusy("Saving…");
    const r = await saveSpotAction({ id: initial.id, name, kind, notes, lat: pin.lat, lon: pin.lon, day: placed?.day ?? initial.day });
    if ("error" in r) {
      setBusy("");
      return setErr(r.error);
    }
    let failed = 0;
    for (let i = 0; i < pending.length; i++) {
      setBusy(`Sending picture ${i + 1} of ${pending.length}…`);
      const res = await addPhotoAction(r.id, pending[i].data, pending[i].caption);
      if (res !== "ok") failed++;
    }
    setPending([]);
    setBusy("");
    start(() => {
      router.push(`/crew/stops/${r.id}?saved=1${failed ? `&photosFailed=${failed}` : ""}`);
      router.refresh();
    });
  }

  async function remove() {
    if (!confirm(`Remove "${initial.name}" from the stops? Its pictures go with it.`)) return;
    setBusy("Removing…");
    await removeSpotAction(initial.id);
    start(() => {
      router.push("/crew/stops?removed=1");
      router.refresh();
    });
  }

  return (
    <div className="stack">
      {forLine && <p className="notice">{forLine}</p>}

      <section className="card stack-sm">
        <h2>Where is it?</h2>
        <p className="small muted" style={{ margin: 0 }}>
          Paste a Google Maps or Street View link, or the numbers you get by long-pressing a spot in Google Maps. Or tap the map, then drag the pin to the exact spot. The satellite view (top right of the map) is handy for lay-bys and car parks.
          {ghost && " The star and the dashed ring are where the plan puts this stop; anywhere nearby will do."}
        </p>
        <div className="form-inline" style={{ alignItems: "flex-end" }}>
          <label className="field" style={{ flex: "3 1 16rem" }}>
            <span>Link or position</span>
            <input
              type="text"
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  findPasted();
                }
              }}
              placeholder="https://maps.app.goo.gl/…  or  52.6312, -1.1245"
              inputMode="url"
            />
          </label>
          <button type="button" className="btn btn-sm" onClick={findPasted}>
            Put the pin there
          </button>
          <button type="button" className="btn btn-sm btn-quiet" onClick={hereNow}>
            Where I am
          </button>
        </div>
        {pasteMsg && (
          <p className="xs muted" style={{ margin: 0 }}>
            {pasteMsg}
          </p>
        )}
        <StopsMap tall pin={pin} onPick={pick} ghost={ghost ?? null} spots={others ?? []} />
        {pin ? (
          <p className="small" style={{ margin: 0 }}>
            <b>
              {pin.lat.toFixed(5)}, {pin.lon.toFixed(5)}
            </b>
            {placed && (
              <>
                {" · "}Day {placed.day}, mile {placed.mile.toFixed(1)}
                {placed.town ? `, near ${placed.town}` : ""}
                {" · "}
                {placed.offMi < 0.06 ? "on the route" : `${placed.offMi < 1 ? `${Math.round(placed.offMi * 1760)} yards` : `${placed.offMi.toFixed(1)} miles`} off the route`}
              </>
            )}
            {" · "}
            <a href={streetViewUrl(pin)} target="_blank" rel="noopener">
              Street View
            </a>
            {" · "}
            <a href={mapsUrl(pin)} target="_blank" rel="noopener">
              Google Maps
            </a>
          </p>
        ) : (
          <p className="small muted" style={{ margin: 0 }}>
            No pin yet.
          </p>
        )}
        {placed && placed.offMi > 1 && <p className="xs error" style={{ margin: 0 }}>That is more than a mile off the route. Fine if it is meant to be, but check it.</p>}
      </section>

      <section className="card stack-sm">
        <h2>About it</h2>
        <div className="form-inline">
          <label className="field" style={{ flex: "3 1 14rem" }}>
            <span>Name</span>
            <input type="text" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Lay-by on the A6 past Kibworth" />
          </label>
          <label className="field" style={{ flex: "1 1 9rem" }}>
            <span>Which stop</span>
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              {Object.entries(SPOT_KIND_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          <span>Notes</span>
          <textarea
            rows={5}
            maxLength={3000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Room for the motorhome and the crew chief car? Which side of the road? Toilets, a café, shelter? How to get in and out."
          />
        </label>
      </section>

      <section className="card stack-sm">
        <h2>{isNew ? "Pictures (optional)" : "Add more pictures"}</h2>
        <p className="small muted" style={{ margin: 0 }}>
          Street View screenshots, photos, anything that helps the drivers recognise it. Pick several at once if you like; up to 12 a stop.
        </p>
        <input ref={fileRef} type="file" accept="image/*" multiple onChange={(e) => addFiles(e.target.files)} />
        {pending.length > 0 && (
          <ul className="spot-photo-grid">
            {pending.map((p) => (
              <li key={p.key} className="spot-photo">
                <img src={p.data} alt="" />
                <input
                  type="text"
                  value={p.caption}
                  maxLength={200}
                  placeholder="Caption (optional)"
                  onChange={(e) => setPending((all) => all.map((x) => (x.key === p.key ? { ...x, caption: e.target.value } : x)))}
                />
                <button type="button" className="btn btn-sm btn-quiet" onClick={() => setPending((all) => all.filter((x) => x.key !== p.key))}>
                  Take off
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {err && <p className="error">{err}</p>}
      <div className="row-between" style={{ gap: "var(--space-3)" }}>
        <button type="button" className="btn btn-primary" onClick={save} disabled={!!busy} style={{ flex: 1 }}>
          {busy || (isNew ? "Save the stop" : pending.length ? `Save, with ${pending.length} new picture${pending.length === 1 ? "" : "s"}` : "Save")}
        </button>
        {!isNew && (
          <button type="button" className="btn btn-sm btn-quiet btn-danger" onClick={remove} disabled={!!busy}>
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
