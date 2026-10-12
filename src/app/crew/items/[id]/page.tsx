import Link from "next/link";
import { notFound } from "next/navigation";
import { AREAS, AREA_LABELS, STATUSES, STATUS_LABELS } from "@/db/schema";
import { activePeople, requireCrew } from "@/lib/auth";
import { canEditFields, getItem } from "@/lib/items";
import { fmtDay, fmtWhen } from "@/lib/time";
import { autoLink } from "@/lib/util";
import { StatusBadge } from "@/components/board";
import { DoneButton } from "@/components/done-button";
import { addNoteAction, deleteItemAction, reassignAction, setStatusAction, updateItemAction } from "../../actions";

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireCrew();
  const { id } = await params;
  const item = await getItem(Number(id));
  if (!item) notFound();
  const people = await activePeople();
  const editable = canEditFields(s, item);

  return (
    <div className="stack" style={{ maxWidth: "44rem" }}>
      <div>
        <Link href="/crew" className="small">
          ← Board
        </Link>
      </div>
      <div className="card stack-sm">
        <div className="row-between">
          <div className="row">
            <StatusBadge status={item.status} />
            <span className="badge">{AREA_LABELS[item.area]}</span>
            {item.status !== "done" && (
              <span className="stale-count" data-stale={item.staleLevel}>
                {item.staleDays}d untouched
              </span>
            )}
          </div>
          {item.status !== "done" && editable && <DoneButton id={item.id} label="Mark done" />}
        </div>
        <h1 style={{ margin: 0 }}>{item.title}</h1>
        {editable && (
          <form action={setStatusAction} className="row" aria-label="Set status">
            <input type="hidden" name="id" value={item.id} />
            {STATUSES.map((st) => (
              <button key={st} className={`btn btn-sm${item.status === st ? " btn-primary" : ""}`} type="submit" name="status" value={st} disabled={item.status === st}>
                {STATUS_LABELS[st]}
              </button>
            ))}
          </form>
        )}
        <dl className="small muted stack-sm" style={{ margin: 0 }}>
          <div>
            <b>Owner</b> {item.owner.name}
          </div>
          <div>
            <b>Due</b> {item.due ? fmtDay(item.due) + (item.overdue ? " — overdue" : "") : "no date"}
          </div>
          {item.waitingOn && (
            <div>
              <b>Waiting on</b> {item.waitingOn}
            </div>
          )}
          {item.doneAt && (
            <div>
              <b>Done</b> {fmtWhen(item.doneAt)}
            </div>
          )}
          {s.role === "admin" && item.source && (
            <div>
              <b>Source</b> {item.source}
            </div>
          )}
          <div>
            Last touched by {item.updatedBy}, {fmtWhen(item.updatedAt)} · created by {item.createdBy}, {fmtWhen(item.createdAt)}
          </div>
        </dl>
      </div>

      <section className="stack-sm">
        <h2>Notes</h2>
        {item.notes.length === 0 && <p className="muted small">No notes yet.</p>}
        {item.notes.map((n) => (
          <div className="note" key={n.id}>
            <div className="who">
              {n.author} · {fmtWhen(n.at)}
            </div>
            <div dangerouslySetInnerHTML={{ __html: autoLink(n.text) }} />
          </div>
        ))}
        <form action={addNoteAction} className="stack-sm">
          <input type="hidden" name="id" value={item.id} />
          <label className="field">
            <span>Add a note (anyone can — it counts as a touch)</span>
            <textarea name="text" required placeholder="chased Simon 14/10 — he'll come back Thursday" />
          </label>
          <button className="btn" type="submit">
            Add note
          </button>
        </form>
      </section>

      {editable ? (
        <section className="stack-sm">
          <h2>Edit</h2>
          <form action={updateItemAction} className="stack-sm">
            <input type="hidden" name="id" value={item.id} />
            <label className="field">
              <span>Title</span>
              <input type="text" name="title" defaultValue={item.title} maxLength={120} required />
            </label>
            <div className="form-inline">
              <label className="field">
                <span>Area</span>
                <select name="area" defaultValue={item.area}>
                  {AREAS.map((a) => (
                    <option key={a} value={a}>
                      {AREA_LABELS[a]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Status</span>
                <select name="status" defaultValue={item.status}>
                  {STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {STATUS_LABELS[st]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-inline">
              <label className="field">
                <span>Owner</span>
                <select name="ownerId" defaultValue={item.ownerId}>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Due</span>
                <input type="date" name="due" defaultValue={item.due ?? ""} />
              </label>
            </div>
            <label className="field">
              <span>Waiting on</span>
              <input type="text" name="waitingOn" defaultValue={item.waitingOn} placeholder="a person, a reply, a delivery, a decision" />
            </label>
            {s.role === "admin" && (
              <label className="field">
                <span>Source (admin only)</span>
                <input type="text" name="source" defaultValue={item.source ?? ""} />
              </label>
            )}
            <div className="row">
              <button className="btn btn-primary" type="submit">
                Save changes
              </button>
            </div>
          </form>
          {s.role === "admin" && (
            <form action={deleteItemAction} className="mt-4">
              <input type="hidden" name="id" value={item.id} />
              <button className="btn btn-sm btn-danger" type="submit">
                Delete (admin; kept in the record)
              </button>
            </form>
          )}
        </section>
      ) : (
        <section className="stack-sm">
          <h2>Hand on</h2>
          <p className="muted small">
            This is {item.owner.shortName}&rsquo;s item. You can add a note above; only the owner or an admin can change its fields.
          </p>
        </section>
      )}

      {editable && (
        <section className="stack-sm">
          <h3>Hand this item to someone else</h3>
          <form action={reassignAction} className="form-inline">
            <input type="hidden" name="id" value={item.id} />
            <label className="field">
              <span>New owner</span>
              <select name="ownerId" defaultValue={item.ownerId}>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn" type="submit">
              Hand on
            </button>
          </form>
        </section>
      )}

      <section>
        <h2>History</h2>
        <ul className="list history">
          {item.events.map((e) => (
            <li key={e.id}>
              {fmtWhen(e.at)} · {e.actor} ·{" "}
              {e.field === "created"
                ? "created"
                : e.field === "note"
                  ? `note: ${e.to}`
                  : e.field === "deleted"
                    ? "deleted"
                    : `${e.field}: ${e.from || "—"} → ${e.to || "—"}`}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
