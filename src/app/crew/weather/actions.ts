"use server";

import { revalidatePath } from "next/cache";
import { requireCrew } from "@/lib/auth";
import { getRideWeather } from "@/lib/weather-server";

/** Fetch a fresh forecast now instead of waiting for the half-hour cache. */
export async function refreshWeatherAction(): Promise<{ fetchedAt: string | null; error: string | null }> {
  await requireCrew();
  const { weather } = await getRideWeather(true);
  revalidatePath("/crew/weather");
  return { fetchedAt: weather.forecast.fetchedAt, error: weather.forecast.error };
}
