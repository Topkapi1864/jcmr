import { NextResponse } from "next/server";
import { endSession, getSession, journal } from "@/lib/auth";

export async function POST(req: Request) {
  const s = await getSession();
  if (s) await journal(s.name, "signed out");
  await endSession();
  return NextResponse.redirect(new URL("/crew/signin", req.url), { status: 303 });
}
