import { PublicShell } from "@/components/shells";
import { Holding } from "@/components/holding";
import { gate, publicMetadata } from "@/lib/public";
import { getSetting } from "@/lib/settings";
import { loadRoutePlan, publicResults } from "@/lib/plan-server";
import { PublicRoute } from "@/components/public-route";

export const dynamic = "force-dynamic";
export const generateMetadata = () => publicMetadata("The route");

export default async function RoutePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const g = await gate(await searchParams);
  if (g.holding) return <Holding />;
  const { profiles, days, saved, initial } = await loadRoutePlan();
  const startLabel = await getSetting("route.start_label");
  const results = publicResults(initial, profiles);
  const total = Math.round(profiles.reduce((a, p) => a + p.miles, 0) / 5) * 5;
  const dayLabels = Object.fromEntries(days.map((d) => [d.day, { label: d.label, start: d.day === 1 ? startLabel : d.startLabel, end: d.endLabel, stravaUrl: d.stravaUrl }]));

  return (
    <PublicShell preview={g.preview} liveActive={g.liveActive}>
      <header className="section">
        <div className="dates">Saturday 14 – Sunday 15 November 2026</div>
        <h1 className="page-title">The route</h1>
        <p className="prose">
          {startLabel} to Yeadon Cemetery — about {total} miles over two days, the finish on the second anniversary.
        </p>
        <p className="row mt-4">
          <a className="btn btn-primary" href="/route/ride/view.html">Ride the route in photos</a>
          <span className="muted">A street photo every quarter mile, with the climbs and the stops.</span>
        </p>
      </header>
      <div className="mt-4">
        <PublicRoute profiles={profiles} results={results} hasPlan={!!saved} dayLabels={dayLabels} />
      </div>
    </PublicShell>
  );
}
