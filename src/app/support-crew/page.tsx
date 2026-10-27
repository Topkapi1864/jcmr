import { PublicShell } from "@/components/shells";
import { Holding } from "@/components/holding";
import { gate, publicMetadata } from "@/lib/public";

export const dynamic = "force-dynamic";
export const generateMetadata = () => publicMetadata("The crew");

// The public page about the support crew ("The crew" in the top nav). A
// holding card until the crew is finalised; the names and roles go in its
// place. Lives at /support-crew because /crew is the board's door.
export default async function SupportCrewPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const g = await gate(await searchParams);
  if (g.holding) return <Holding />;

  return (
    <PublicShell preview={g.preview} liveActive={g.liveActive}>
      <header className="section">
        <div className="dates">14–15 November 2026 · 240 miles</div>
        <h1 className="page-title">The crew</h1>
        <p className="prose">
          Four of us ride. A crew gets us there: driving the support vehicles, keeping us fed, fixing what breaks and making sure everyone arrives in
          Yorkshire together.
        </p>
      </header>
      <section className="card card-lg crew-tba mt-4" aria-labelledby="crew-tba-heading">
        <div className="label">Names and roles</div>
        <h2 id="crew-tba-heading">To be announced</h2>
        <p className="muted">The crew is still being finalised. Who they are and what each of them is doing on the road will be here once it is.</p>
      </section>
    </PublicShell>
  );
}
