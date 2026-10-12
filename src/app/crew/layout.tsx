import type { Metadata } from "next";
import { headers } from "next/headers";
import { getSession } from "@/lib/auth";
import { CrewShell } from "@/components/shells";

export const metadata: Metadata = { title: "Crew board", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function CrewLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  // The sign-in pages live under /crew too and have no shell.
  if (!s) return <>{children}</>;
  await headers();
  return (
    <CrewShell name={s.name} isAdmin={s.role === "admin"}>
      {children}
    </CrewShell>
  );
}
