import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Crew sign-in", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  if (await getSession()) redirect("/crew");
  return (
    <div className="holding">
      <div className="form-narrow stack" style={{ width: "100%" }}>
        <h1>JCMR crew</h1>
        <p className="muted">The crew password, then your name. You&rsquo;ll stay signed in for a month.</p>
        {sp.expired && <p className="error">That took too long — the password step expired. Go again.</p>}
        <PasswordForm next={sp.next ?? "/crew"} />
      </div>
    </div>
  );
}
