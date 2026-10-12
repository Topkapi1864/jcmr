"use server";

import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, ready, schema } from "@/db/client";
import { startSession, journal } from "@/lib/auth";
import { signUnlock, verifyUnlock, UNLOCK_COOKIE } from "@/lib/session";
import { rateLimited } from "@/lib/util";

async function passwordOk(given: string): Promise<boolean> {
  const hash = process.env.CREW_PASSWORD_HASH;
  if (hash) return bcrypt.compare(given, hash);
  const plain = process.env.CREW_PASSWORD;
  if (plain && process.env.NODE_ENV !== "production") return given === plain;
  return false;
}

function safeNext(next: unknown): string {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/crew") && !n.startsWith("/crew/signin") ? n : "/crew";
}

export async function submitPassword(_prev: { error?: string } | undefined, form: FormData) {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") || h.get("x-real-ip") || "local").split(",")[0].trim();
  if (rateLimited(`signin:${ip}`, 10, 15 * 60_000)) {
    return { error: "Too many tries. Wait a quarter of an hour and try again." };
  }
  const given = String(form.get("password") ?? "");
  if (!(await passwordOk(given))) {
    await new Promise((r) => setTimeout(r, 400));
    return { error: "That isn't the crew password." };
  }
  const jar = await cookies();
  jar.set(UNLOCK_COOKIE, await signUnlock(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/crew/signin",
    maxAge: 600,
  });
  redirect(`/crew/signin/who?next=${encodeURIComponent(safeNext(form.get("next")))}`);
}

export async function pickPerson(form: FormData) {
  const jar = await cookies();
  if (!(await verifyUnlock(jar.get(UNLOCK_COOKIE)?.value))) redirect("/crew/signin?expired=1");
  const pid = Number(form.get("pid"));
  await ready();
  const person = await db.select().from(schema.people).where(eq(schema.people.id, pid)).get();
  if (!person || !person.active) redirect("/crew/signin/who?bad=1");
  await startSession(person);
  jar.delete(UNLOCK_COOKIE);
  await journal(person.shortName, "signed in");
  redirect(safeNext(form.get("next")));
}
