import Link from "next/link";
import { AREAS, AREA_LABELS } from "@/db/schema";
import { activePeople, requireCrew } from "@/lib/auth";
import { createItemAction } from "../../actions";

export default async function NewItemPage() {
  const s = await requireCrew();
  const people = await activePeople();
  return (
    <div className="stack" style={{ maxWidth: "36rem" }}>
      <div>
        <Link href="/crew" className="small">
          ← Board
        </Link>
      </div>
      <h1>Add an item</h1>
      <form action={createItemAction} className="stack-sm">
        <label className="field">
          <span>What needs doing</span>
          <input type="text" name="title" maxLength={120} required autoFocus placeholder="Book the Link Hotel rooms incl. a spare twin" />
        </label>
        <div className="form-inline">
          <label className="field">
            <span>Area</span>
            <select name="area" required defaultValue="">
              <option value="" disabled>
                Pick one
              </option>
              {AREAS.map((a) => (
                <option key={a} value={a}>
                  {AREA_LABELS[a]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Owner</span>
            <select name="ownerId" defaultValue={s.pid}>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-inline">
          <label className="field">
            <span>Due (optional)</span>
            <input type="date" name="due" />
          </label>
          <label className="field">
            <span>Waiting on (optional)</span>
            <input type="text" name="waitingOn" placeholder="Simon's reply" />
          </label>
        </div>
        <label className="field">
          <span>One note (optional)</span>
          <textarea name="note" placeholder="Where it stands right now." />
        </label>
        <button className="btn btn-primary" type="submit" style={{ width: "100%" }}>
          Add to the board
        </button>
      </form>
    </div>
  );
}
