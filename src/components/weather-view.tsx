"use client";

import { useState, useTransition } from "react";
import type { RouteProfile } from "@/lib/route";
import type { DayResult } from "@/lib/plan";
import { fmtHm } from "@/lib/plan";
import type { RideWeather } from "@/lib/weather";
import { refreshWeatherAction } from "@/app/crew/weather/actions";
import { CrossSection, DAY_NAMES, DayTile, Key, SegmentTable, SourceLine, fmtDayLong, fmtWhen, type Mode } from "./weather-parts";

// Crew → Weather. Two things: the latest forecast for the 14th and 15th along the
// course, point by point, and a cross-section of the day — temperature as a heat
// band, rain as marks, wind as arrows relative to the direction of travel —
// drawn over the route profile with the riders' timetable along the top. The
// pieces live in weather-parts.tsx, shared with the public Weather page.

type Props = { weather: RideWeather; profiles: RouteProfile[]; results: DayResult[] };

export function WeatherView({ weather, profiles, results }: Props) {
  const [mode, setMode] = useState<Mode>("air");
  const [flash, setFlash] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const anyForecast = weather.days.some((d) => d.source === "forecast");
  const fc = weather.forecast;

  const refresh = () =>
    startTransition(async () => {
      const r = await refreshWeatherAction();
      setFlash(
        r.error
          ? `Couldn't fetch a new forecast: ${r.error}`
          : r.fetchedAt
            ? `Forecast refreshed at ${fmtWhen(r.fetchedAt)}.`
            : "Nothing to fetch yet — the ride is still beyond the 16-day forecast range.",
      );
      setTimeout(() => setFlash(null), 4000);
    });

  return (
    <div className="planner wx">
      <header className="planner-head">
        <div>
          <h1>Weather along the course</h1>
          <p className="small muted" style={{ margin: 0 }}>
            Every 10 miles, at the hour the crew plan has the riders passing. Forecasts sharpen as the days close in; this page fetches a new one every half hour.
            {!anyForecast && (
              <>
                {" "}
                Right now the ride is beyond the 16-day forecast range, so you&rsquo;re seeing what mid-November is <b>typically</b> like at each point — the real forecast for the 14th arrives on{" "}
                {fmtDayLong(weather.days[0]?.forecastFrom ?? "")} and switches in by itself.
              </>
            )}
          </p>
        </div>
        <div className="planner-actions">
          {anyForecast && (
            <button className="btn btn-primary" onClick={refresh} disabled={pending}>
              {pending ? "Fetching…" : "Fetch the latest forecast"}
            </button>
          )}
          <a className="btn" href="/crew/route">
            Route &amp; timeline
          </a>
          <a className="btn" href="/weather">
            Public page
          </a>
          <button className="btn" onClick={() => window.print()}>
            Print
          </button>
        </div>
      </header>
      {flash && <p className="notice planner-flash">{flash}</p>}
      {fc.error && (
        <p className="notice planner-warn small">
          Couldn&rsquo;t reach the forecast service ({fc.error}).{fc.stale ? ` Showing the forecast fetched ${fmtWhen(fc.fetchedAt ?? "")}.` : " Showing typical values for the date instead."}
        </p>
      )}

      <div className="planner-tiles">
        {weather.days.map((d) => (
          <DayTile key={d.day} d={d} />
        ))}
      </div>

      <section className="card wx-key-card">
        <div className="row-between" style={{ alignItems: "center", flexWrap: "wrap", gap: "var(--space-3)" }}>
          <div className="wx-mode" role="group" aria-label="Temperature shown">
            <span className="label">Temperature</span>
            <button className="btn btn-sm" data-on={mode === "air" || undefined} onClick={() => setMode("air")}>
              Air
            </button>
            <button className="btn btn-sm" data-on={mode === "feels" || undefined} onClick={() => setMode("feels")}>
              Feels like
            </button>
          </div>
          <Key />
        </div>
      </section>

      {weather.days.map((d) => {
        const p = profiles.find((x) => x.day === d.day)!;
        const r = results.find((x) => x.day === d.day)!;
        return (
          <section key={d.day} className="card stack-sm day-plan wx-day" id={`wx-day-${d.day}`} data-source={d.source}>
            <div className="row-between" style={{ alignItems: "baseline" }}>
              <h2>
                Day {d.day} — {DAY_NAMES[d.day]}
              </h2>
              <span className="small muted">
                {r.miles} mi · {fmtHm(r.start)} → ~{fmtHm(r.finish)} · sunrise {fmtHm(d.sunrise)} · sunset {fmtHm(d.sunset)}
              </span>
            </div>
            <SourceLine d={d} climNote={weather.climatology.note} />
            <CrossSection d={d} profile={p} result={r} mode={mode} />
            <SegmentTable d={d} profile={p} mode={mode} />
          </section>
        );
      })}

      <p className="xs muted">
        Forecast: Open-Meteo&rsquo;s best match for each point (ECMWF, Met Office and DWD models blended; rain chances from the ensembles), hourly, up to 16 days ahead. Typical values:{" "}
        {weather.climatology.source} — {weather.climatology.note}. Wind is at 10 m; on a bike with hedges it feels less, on an exposed ridge it feels like the gusts. Head, tail and cross are judged
        against the direction each 10-mile stretch makes good, so a twisty lane can hide a bit of both. Temperatures are the air temperature at the hour the plan has you there — the plan on{" "}
        <a href="/crew/route">Route &amp; timeline</a> drives the times. The public page runs the same plan at a steady 12 mph.
      </p>
    </div>
  );
}
