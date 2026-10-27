import { PublicShell } from "@/components/shells";
import { Holding } from "@/components/holding";
import { PublicWeather } from "@/components/public-weather";
import { gate, publicMetadata } from "@/lib/public";
import { livePayload } from "@/lib/live";
import { liveMileFrom } from "@/lib/weather";
import { getRideWeather } from "@/lib/weather-server";

export const dynamic = "force-dynamic";
export const generateMetadata = () => publicMetadata("Weather");

// The weather along the route for spectators: every ten miles, at the time the
// riders are expected there (the crew plan at the public pace), and a picker for
// the place you'll watch from or the stretch you'll ride. Keeps itself current
// (see src/components/public-weather.tsx); the data is the crew's, at 12 mph.
export default async function WeatherPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const g = await gate(await searchParams);
  if (g.holding) return <Holding />;
  const [{ weather, profiles, results }, live] = await Promise.all([getRideWeather(false, "public"), livePayload()]);
  const total = Math.round(profiles.reduce((a, p) => a + p.miles, 0) / 5) * 5;

  return (
    <PublicShell preview={g.preview} liveActive={g.liveActive}>
      <header className="section">
        <div className="dates">Saturday 14 – Sunday 15 November 2026</div>
        <h1 className="page-title">The weather</h1>
        <p className="prose">
          What it should be like along the road, every ten miles of the {total}, at the time the riders are expected there. Coming out to watch, or riding a stretch with them? Pick your spot and see
          what to wear.
        </p>
      </header>
      <div className="mt-4">
        <PublicWeather weather={weather} profiles={profiles} results={results} live={liveMileFrom(live)} />
      </div>
    </PublicShell>
  );
}
