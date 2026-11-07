import Link from "next/link";
import { requireCrew } from "@/lib/auth";
import { canEditMessage, listMessages, MESSAGE_MAX, messagePhotoUrl } from "@/lib/messages";
import { fmtWhen } from "@/lib/time";
import { MessageBody, MessagePhoto } from "@/components/message-body";
import { MessagePhotoInput } from "@/components/message-photo-input";
import { postMessageAction } from "./actions";

export default async function CrewMessagesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireCrew();
  const sp = await searchParams;
  const posts = await listMessages();
  const notice = sp.posted ? "Posted. It is on the home page now." : sp.saved ? "Saved." : sp.removed ? "Removed from the site." : sp.pinned ? "Pinned to the top." : sp.unpinned ? "Unpinned." : null;

  return (
    <div className="stack" style={{ maxWidth: "40rem" }}>
      <div>
        <h1>Messages — the board on the public site</h1>
        <p className="small muted" style={{ margin: 0 }}>
          Whatever you post here appears on the <Link href="/">home page</Link> and on <Link href="/live">Live</Link>, with your name and the time, within a minute. Anyone on the crew can post. On the day,
          the status lines from <Link href="/crew/live">Live</Link> land on the same board with the miles.
        </p>
      </div>

      {notice && <p className="notice">{notice}</p>}
      {sp.empty && <p className="error">Nothing to post. Write something, add a picture, or both.</p>}
      {sp.badphoto && <p className="error">That picture didn&rsquo;t come through. Try again, or try a different one.</p>}

      <section className="card stack-sm">
        <h2>Post a message</h2>
        <form action={postMessageAction} className="stack-sm">
          <label className="field">
            <span>Your message</span>
            <textarea name="body" rows={7} maxLength={MESSAGE_MAX} placeholder="A blank line starts a new paragraph. Web addresses become links." />
          </label>
          {/* Keyed on the newest post, so the picker clears once a message has gone up. */}
          <MessagePhotoInput key={posts.reduce((n, m) => Math.max(n, m.id), 0)} />
          <p className="xs muted" style={{ margin: 0 }}>
            Words, a picture, or both. Up to {MESSAGE_MAX.toLocaleString("en-GB")} characters and one picture. You can edit or remove it afterwards.
          </p>
          <button className="btn btn-primary" type="submit" style={{ width: "100%" }}>
            Post as {s.name}
          </button>
        </form>
      </section>

      <section className="stack-sm">
        <h2 style={{ marginBottom: 4 }}>On the board</h2>
        {posts.length === 0 ? (
          <p className="muted">Nothing posted yet.</p>
        ) : (
          <ul className="list">
            {posts.map((m) => (
              <li key={m.id} className="card message-row" id={`m-${m.id}`}>
                <div className="row-between small muted">
                  <span>
                    {m.pinned && <span className="badge badge-amber">Pinned</span>} <b>{m.postedBy}</b> · {fmtWhen(m.postedAt)}
                    {m.editedAt ? ` · edited ${fmtWhen(m.editedAt)}${m.editedBy && m.editedBy !== m.postedBy ? ` by ${m.editedBy}` : ""}` : ""}
                  </span>
                  {canEditMessage(s, m) && (
                    <Link href={`/crew/messages/${m.id}`} className="btn btn-sm">
                      Edit
                    </Link>
                  )}
                </div>
                {m.body && <MessageBody text={m.body} className="message-text" />}
                {m.hasPhoto && <MessagePhoto src={messagePhotoUrl(m)!} />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
