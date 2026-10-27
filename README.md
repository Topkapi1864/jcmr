# JCMR — the ride site

One codebase, one store, two doors (spec v0.1):

- **Public front** — `/`, `/mum`, `/riders`, `/route`, `/donate`, `/live`, `/live/tv`. Dark (a holding page) until an admin flips the switch.
- **Crew job board** — `/crew/*` behind a shared password + name pick. Items with one owner, a due date, a status, what they're waiting on, and the **Stale** view.
- **Fiona's read door** — `GET /api/board/<token>.json` and `.csv`.

Stack: Next.js (App Router) · TypeScript · Drizzle + libSQL (a local SQLite file in dev, [Turso](https://turso.tech) in production) · plain CSS driven by `design/tokens.css` · Leaflet on OpenStreetMap tiles · Vercel.

## Run it locally

```bash
npm install
cp .env.example .env.local        # then set SESSION_SECRET and CREW_PASSWORD (dev) or CREW_PASSWORD_HASH
npm run db:seed -- --items        # people, riders, route, links, settings + Fiona's seed items
npm run dev                       # http://localhost:3000
```

Sign in at `/crew/signin` with the crew password, pick a name. Gary and Fiona are admins.

## Deploy (free tiers)

1. **Database — Turso.** `turso db create jcmr`, then `turso db show jcmr --url` and `turso db tokens create jcmr`. Set `DATABASE_URL` (libsql://…) and `DATABASE_AUTH_TOKEN`.
2. **Seed it once** from your machine: with those two values in `.env.local`, run `npm run db:seed -- --items`. (Tables are created automatically on first use; the seed just fills them.)
3. **Hosting — Vercel.** Import the GitHub repo. Environment variables: `DATABASE_URL`, `DATABASE_AUTH_TOKEN`, `SESSION_SECRET` (`openssl rand -hex 32`), `CREW_PASSWORD_HASH` (`npm run hash-password -- 'the word'`), optional `BACKUP_KEY`. Build command is the default (`npm run build`, which runs the token lint first).
4. A host subdomain is fine for the board. Point the real domain at the same project before the announcement; nothing in the code depends on the host name.

## Backups

- Admin → **Download board as CSV** and **Download full backup** (every table as JSON).
- `GET /api/backup?key=$BACKUP_KEY` returns the same JSON — the nightly job is a GitHub Actions workflow (`.github/workflows/backup.yml`) that fetches it and keeps the file as a workflow artifact for 90 days. Set `BACKUP_KEY` and `SITE_URL` as repository secrets.
- `npm run backup` writes `backups/jcmr-<date>.json` from whatever `DATABASE_URL` points at.

## Content and route files

- Words, Mum's photo path, rider bios, route days and stops, links, settings: Admin → Content / Route / Links / Settings.
- Photos: commit under `public/photos/` and type the path (`/photos/mum.jpg`).
- Rider bios: type them in Admin → Content, or commit `content/riders/<first name>.md` (`content/riders/nathan.md`). The file's text is the bio; an optional front-matter block at the top names the photo and the Strava link:
  ```
  ---
  photo: /photos/steve.jpg
  strava: https://www.strava.com/athletes/…
  ---
  Meet Steve: …
  ```
  The file is applied whenever the riders are shown (public page or Admin). The bio follows the file until someone saves a change in Admin, after which the Admin copy is the one that counts; the photo and Strava link are only filled in while their boxes in Admin are empty. Each load is journaled.
- GPX: commit Simon's files as `content/route/day1.gpx` and `content/route/day2.gpx`. The map, elevation and towns appear when they exist; until then a day is a dashed schematic from the roadbook.
- Route planner: **Crew → Route** (`/crew/route`). Start times, moving speed, routine-stop rules (5 min every hour, 15 every three, halfway…) and the motorhome rendezvous (from Admin → Route, or **Import** there to load Simon's roadbook stops). "Save as the crew plan" stores it in settings (`route.plan`) and writes the arrival times onto the stops, so the public route page shows them. "Share scenario" encodes the plan in the link; "Copy timetable" is WhatsApp-ready. The engine is `src/lib/plan.ts`; the GPX → miles/elevation/waypoints/towns derivation is `src/lib/route.ts` (served at `/api/route-geo?format=profile`).
- Public route page (`/route`): the crew plan run at a fixed **12 mph** (`PUBLIC_SPEED_MPH` in `src/lib/plan-server.ts`; the crew's chosen speed never reaches the public), every stop in the timeline, only the rendezvous listed. At the top, the ride as a looping cross-section (`src/components/ride-strip.tsx`): both days' profiles, a bicycle riding them with the time of day above it, the towns lighting up as it passes, the rendezvous as numbered pins, after-sunset shaded; two days in about a minute, Pause/Play, static under reduced motion. Below it, "Where will they be?": day, time, a scrubber, "When do they reach…", a tap on the map or a profile. The same probe as the crew's, without the speed controls. On 14–15 November it opens at the current time.

## Vehicles

**Crew → Vehicles** (`/crew/vehicles`). Seeded with the Follow vehicle, the Motorhome, the Crew chief vehicle and an Extra; admins add or retire more.

- Each vehicle: type, registration, a colour (eight palette slots `--vehicle-v1…v8` in `design/tokens.css`, or a custom pick), its role, its driving strategy, notes on what it carries, and a photo (shrunk in the browser, stored in the database, served by `/api/vehicles/photo/<id>`).
- **Crew**: drivers and passengers, each from one route point to another (day starts, the stops from Crew → Route, the finish). Someone who switches vehicles has a row in each. The overview shows everyone stop by stop and flags legs with no driver, two drivers, or a person in two vehicles at once.
- **Checklist**: the pre-ride packing check — tick as you go, "Clear all ticks" to run it again. If the vehicle is linked to a kit location (Follow vehicle, Motorhome…), the riders' kit packed there shows underneath.
- **Location**, three ways in, all onto one map (`/api/vehicles/positions`, refreshed every 30 s):
  1. *Share this phone* (`/crew/vehicles/<id>/share`) — browser GPS while the page is open.
  2. *Tracker app* — Traccar Client, OwnTracks or GPSLogger pointed at `/api/vehicles/ping/<token>` (each vehicle has its own token, rotatable by an admin). Keeps working with the screen off.
  3. *Paste* — a Google / Apple Maps link (what you get from a WhatsApp location) or "lat, lng". Short links are followed.
  WhatsApp's live location can't be read by another app. A bought tracker's own share link can be stored on the vehicle.

## Weather

**Crew → Weather** (`/crew/weather`; JSON at `/api/weather`, `?fresh=1` to force a fetch). The route is cut into 10-mile stretches; each gets the hour of weather at the time the saved crew plan (Crew → Route) has the riders passing it. Two views per day: the cross-section — temperature as a heat band with a key, rain as marks, wind as arrows drawn relative to the direction of travel (you ride left → right; red = headwind, green = tailwind, amber = crosswind) over the elevation profile with the timetable along the top — and the point-by-point table.

- **Forecast**: [Open-Meteo](https://open-meteo.com) best-match (ECMWF, Met Office and DWD blended; rain chances from ensembles), hourly, for every point in one request, 16 days ahead. Cached in settings (`weather.forecast`) for 30 minutes; "Fetch the latest forecast" forces it. The 14th comes into range on 30 Oct, the 15th on 31 Oct — the page switches by itself and says how many days out and how much to trust it.
- **Typical** (before then, and as the "normally…" comparison after): `content/weather/climatology.json`, ten mid-Novembers of ERA5 averages hour by hour at every point, written by `npm run weather:climatology` (Open-Meteo archive, no key). The **Weather climatology** GitHub workflow runs it and commits the file — run it from the Actions tab after the route changes. Until the file exists the page uses long-term regional averages built into `src/lib/weather.ts`, adjusted for height.
- Dry run with invented weather: `OPEN_METEO_FORECAST_URL=http://127.0.0.1:3099/v1/forecast WEATHER_TODAY=2026-11-06 npm run dev` against any server that answers in Open-Meteo's shape.

The maths (segments, headings, head/tail/cross) is `src/lib/weather.ts`; fetching and caching `src/lib/weather-server.ts`; the page `src/components/weather-view.tsx`; colours are the `--wx-*` tokens.

## The dark switch

`site.public_live` in settings; flipped from Admin, journaled. The `PUBLIC_LIVE` environment variable (`true`/`false`) overrides it if set. While dark every public route serves the holding page with `noindex` and `robots.txt` disallows everything — except for a signed-in crew session, which previews the full pages (with a banner and a link to see the holding page).

## The import (spec §8)

Admin → Import CSV. Columns: `title,area,owner,due,status,waiting_on,note,last_touched,source`. Idempotent on title + owner. `last_touched` sets the item's age so Stale is honest from day one. The seed is `content/seed/items.csv`.

## Facts recorded by the first build

- JustGiving refuses framing (`x-frame-options: SAMEORIGIN`, 12 Oct 2026). The Give page uses a button plus a total fetched from the page's embedded data (hourly cache, admin override).
- Live-map links are checked for framing server-side (`x-frame-options` / `frame-ancestors`) each time `/api/live` is read; `/live` frames what it can and shows a big button otherwise.

## Scripts

| Script | Does |
|---|---|
| `npm run dev` / `build` / `start` | the usual |
| `npm run lint:tokens` | fails on colour/font literals outside `design/tokens.css` |
| `npm run db:seed [-- --items]` | seed facts (and items) |
| `npm run hash-password -- 'word'` | bcrypt hash for `CREW_PASSWORD_HASH` |
| `npm run backup` | JSON dump to `backups/` |

## Where the design goes

`design/README.md` lists every slot (tokens, shells, templates, crew components, holding page, sign-in, favicon/OG/404) with file paths.
