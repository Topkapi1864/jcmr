import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, ready, schema } from "@/db/client";
import { SESSION_COOKIE, SESSION_DAYS, signSession, verifySession, type Session } from "./session";
import { nowIso } from "./time";

export type { Session };

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  return verifySession(jar.get(SESSION_COOKIE)?.value);
}

/** Server components / actions under /crew: a valid session or a redirect to sign-in. */
export async function requireCrew(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/crew/signin");
  return s;
}

export async function requireAdmin(): Promise<Session> {
  const s = await requireCrew();
  if (s.role !== "admin") redirect("/crew?denied=1");
  return s;
}

export async function startSession(person: { id: number; shortName: string; role: "admin" | "crew" }) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400;
  const token = await signSession({ pid: person.id, name: person.shortName, role: person.role, exp });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function endSession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function journal(actor: string, action: string) {
  await ready();
  await db.insert(schema.audit).values({ actor, at: nowIso(), action });
}

export async function activePeople() {
  await ready();
  return db.select().from(schema.people).where(eq(schema.people.active, true)).orderBy(schema.people.sortOrder, schema.people.shortName).all();
}
