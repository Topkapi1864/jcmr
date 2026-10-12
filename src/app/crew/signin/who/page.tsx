import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { activePeople } from "@/lib/auth";
import { UNLOCK_COOKIE, verifyUnlock } from "@/lib/session";
import { pickPerson } from "../actions";

export const metadata: Metadata = { title: "Who are you?", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function WhoPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const jar = await cookies();
  if (!(await verifyUnlock(jar.get(UNLOCK_COOKIE)?.value))) redirect("/crew/signin?expired=1");
  const people = await activePeople();
  return (
    <div className="holding">
      <div className="form-narrow stack" style={{ width: "100%" }}>
        <h1>Who are you?</h1>
        {sp.bad && <p className="error">That name isn&rsquo;t on the crew list.</p>}
        <form action={pickPerson} className="stack-sm">
          <input type="hidden" name="next" value={sp.next ?? "/crew"} />
          <ul className="list">
            {people.map((p) => (
              <li key={p.id}>
                <button className="btn" type="submit" name="pid" value={p.id} style={{ width: "100%", justifyContent: "flex-start" }}>
                  {p.name}
                  {p.name !== p.shortName && <span className="muted small">({p.shortName})</span>}
                </button>
              </li>
            ))}
          </ul>
        </form>
      </div>
    </div>
  );
}
