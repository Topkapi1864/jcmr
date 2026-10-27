import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCrew } from "@/lib/auth";
import { canEditMessage, getMessage, MESSAGE_MAX } from "@/lib/messages";
import { fmtWhen } from "@/lib/time";
import { MessageBody } from "@/components/message-body";
import { pinMessageAction, removeMessageAction, updateMessageAction } from "../actions";

export default async function EditMessagePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireCrew();
  const { id } = await params;
  const sp = await searchParams;
  const m = await getMessage(Number(id));
  if (!m) notFound();
  const editable = canEditMessage(s, m);

  return (
    <div className="stack" style={{ maxWidth: "40rem" }}>
      <div>
        <Link href="/crew/messages" className="small">
          ← Messages
        </Link>
      </div>
      {sp.denied && <p className="error">Only {m.postedBy} or an admin can change this message.</p>}

      <section className="card stack-sm">
        <div className="small muted">
          {m.pinned && <span className="badge badge-amber">Pinned</span>} <b>{m.postedBy}</b> · {fmtWhen(m.postedAt)}
          {m.editedAt ? ` · edited ${fmtWhen(m.editedAt)}` : ""}
        </div>
        {editable ? (
          <form action={updateMessageAction} className="stack-sm">
            <input type="hidden" name="id" value={m.id} />
            <label className="field">
              <span>The message</span>
              <textarea name="body" required rows={9} maxLength={MESSAGE_MAX} defaultValue={m.body} />
            </label>
            <button className="btn btn-primary" type="submit" style={{ width: "100%" }}>
              Save
            </button>
          </form>
        ) : (
          <MessageBody text={m.body} className="message-text" />
        )}
      </section>

      {editable && (
        <section className="card stack-sm">
          <h2>Take it down</h2>
          {sp.confirm ? (
            <>
              <p className="small" style={{ margin: 0 }}>
                Remove this message from the home page and Live? It can&rsquo;t be put back from here.
              </p>
              <div className="row">
                <form action={removeMessageAction}>
                  <input type="hidden" name="id" value={m.id} />
                  <button className="btn btn-danger" type="submit">
                    Yes, remove it
                  </button>
                </form>
                <Link href={`/crew/messages/${m.id}`} className="btn">
                  Keep it
                </Link>
              </div>
            </>
          ) : (
            <div className="row">
              <Link href={`/crew/messages/${m.id}?confirm=1`} className="btn btn-danger">
                Remove from the site
              </Link>
            </div>
          )}
        </section>
      )}

      {s.role === "admin" && (
        <section className="card stack-sm">
          <h2>{m.pinned ? "Pinned to the top" : "Pin it"}</h2>
          <p className="small muted" style={{ margin: 0 }}>
            A pinned message stays at the top of the board on the home page and Live, above everything newer.
          </p>
          <form action={pinMessageAction}>
            <input type="hidden" name="id" value={m.id} />
            <input type="hidden" name="pinned" value={m.pinned ? "0" : "1"} />
            <button className="btn" type="submit">
              {m.pinned ? "Unpin" : "Pin to the top"}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
