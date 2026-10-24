import { requireCrew } from "@/lib/auth";
import { getRideWeather } from "@/lib/weather-server";
import { WeatherView } from "@/components/weather-view";

export const dynamic = "force-dynamic";

export default async function CrewWeatherPage() {
  await requireCrew();
  const { weather, profiles, results } = await getRideWeather();
  return <WeatherView weather={weather} profiles={profiles} results={results} />;
}
