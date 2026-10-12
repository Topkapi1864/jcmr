import { PublicShell } from "@/components/shells";
import { Holding } from "@/components/holding";
import { gate, publicMetadata } from "@/lib/public";
import { JUSTGIVING_URL } from "@/lib/settings";
import { fmtPounds, getDonateTotal } from "@/lib/donate";
import { fmtTime } from "@/lib/time";

export const dynamic = "force-dynamic";
export const generateMetadata = () => publicMetadata("Give");

export default async function DonatePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const g = await gate(await searchParams);
  if (g.holding) return <Holding />;
  const total = await getDonateTotal();

  return (
    <PublicShell preview={g.preview} liveActive={g.liveActive}>
      <header className="section">
        <div className="dates">In Janet’s name</div>
        <h1 className="page-title">Give</h1>
        <p className="prose">
          We are riding for the Royal British Legion, in Mum&rsquo;s name. Every gift goes straight to them through JustGiving, and your message sits on
          the donor wall there.
        </p>
      </header>
      <div className="stack mt-6" style={{ maxWidth: "32rem" }}>
        <a className="btn-donate btn-donate-big" href={JUSTGIVING_URL} target="_blank" rel="noopener" style={{ width: "100%" }}>
          Give on JustGiving
        </a>
        {total.amount !== null && (
          <section className="card card-lg">
            <div className="label">Raised so far</div>
            <div className="total">{fmtPounds(total.amount)}</div>
            <div className="small muted">
              {total.target ? `of a ${fmtPounds(total.target)} target` : ""}
              {total.count ? ` · ${total.count} donations` : ""}
              {total.fetchedAt ? ` · as of ${fmtTime(total.fetchedAt)}` : ""}
            </div>
          </section>
        )}
        <p className="small muted">
          Prefer to see the full page, the messages and the total straight from the source?{" "}
          <a href={JUSTGIVING_URL} target="_blank" rel="noopener">
            Open the JustGiving page
          </a>
          .
        </p>
      </div>
    </PublicShell>
  );
}
