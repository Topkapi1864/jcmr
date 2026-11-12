# JCMR — the ride site

One codebase, one store, two doors (spec v0.1):

- **Public front** — `/`, `/mum`, `/mum/album`, `/riders`, `/support-crew`, `/route`, `/weather`, `/donate`, `/live`, `/live/tv`. Dark (a holding page) until an admin flips the switch.
- **Crew job board** — `/crew/*` behind a shared password + name pick. Items with one owner, a due date, a status, what they're waiting on, and the **Stale** view. Also the crew's way onto the public site: **Messages** (the board on the home page) and **Live** (the status line and the day's map links).
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
- `GET /api/backup?key=$BACKUP_KEY` returns the same JSON — the nightly job is a GitHub Actions workflow (`.github/workflows/backup.yml`) that fetches it, **encrypts it in the runner** (AES-256, with the `BACKUP_KEY` secret as the passphrase), proves the encrypted file opens again byte for byte, removes the plain file, and keeps only the encrypted one as a workflow artifact, `jcmr-backup-enc-<run id>`, for 90 days. Set `BACKUP_KEY` and `SITE_URL` as repository secrets.
- **This repository is public, and anyone signed in to GitHub can download a public repository's workflow artifacts — so nothing personal may be committed to it or attached to its runs unencrypted.** The backup holds the crew's phone numbers, dates of birth, emergency contacts and where they sleep; that is why it is encrypted before it is kept. It is as safe as `BACKUP_KEY` is long and random.
- To open a backup: download the artifact from the run's page, unzip it, and run this (it asks for the key — the `BACKUP_KEY` in Vercel → Project → Settings → Environment Variables):
  ```
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -md sha256 -in jcmr-2026-11-12.json.enc -out jcmr-2026-11-12.json
  ```
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
- GPX: commit Simon's files as `content/route/day1.gpx` and `content/route/day2.gpx`. Day 1 is at **V2.0** (11 Nov 2026: four dead-end spurs out, round Gorhambury) and Day 2 at **V2.3** (11 Nov 2026, evening: Wharncliffe and Silkstone on the road, Woodlesford by Pottery Lane, Oughtibridge's one-way loop replaced by a 70 m walk up Bridge Hill); the 5 Oct files are in `content/route/v1/`, Day 2 V2.0 in `content/route/v2.0/`, how they were made is in `tools/route/README.md`. `ROUTE_VERSIONS` in `src/lib/constants.ts` names each day's download (`jcmr-day1-v2.0.gpx`, `jcmr-day2-v2.3.gpx`) and its link text; `ROUTE_VERSION` (the newest) when bumped re-places the scouted spots' miles on the new line once (`src/lib/route-version.ts`). A GPX waypoint's stop key (`wp:<day>:<mile>`) keeps the mile it was first saved with, so the saved plan and the spots that replaced a rendezvous survive a change of line. The map, elevation and towns appear when they exist; until then a day is a dashed schematic from the roadbook.
- Route planner: **Crew → Route** (`/crew/route`). Start times, moving speed, routine-stop rules (5 min every hour, 15 every three, halfway…) and the motorhome rendezvous (from Admin → Route, or **Import** there to load Simon's roadbook stops). "Save as the crew plan" stores it in settings (`route.plan`) and writes the arrival times onto the stops, so the public route page shows them. "Share scenario" encodes the plan in the link; "Copy timetable" is WhatsApp-ready. The engine is `src/lib/plan.ts`; the GPX → miles/elevation/waypoints/towns derivation is `src/lib/route.ts` (served at `/api/route-geo?format=profile`).
- Public route page (`/route`): the crew plan run at a fixed **12 mph** (`PUBLIC_SPEED_MPH` in `src/lib/plan-server.ts`; the crew's chosen speed never reaches the public), every stop in the timeline, only the rendezvous listed. At the top, the ride as a looping cross-section (`src/components/ride-strip.tsx`): both days' profiles, a bicycle riding them with the time of day above it, the towns lighting up as it passes, the rendezvous as numbered pins, after-sunset shaded; two days in about a minute, Pause/Play, static under reduced motion. Below it, "Where will they be?": day, time, a scrubber, "When do they reach…", a tap on the map or a profile. The same probe as the crew's, without the speed controls. On 14–15 November it opens at the current time.

## Messages from the crew

The board on the home page (`#messages`) and on `/live`. Anyone with a crew session posts from **Crew → Messages** (`/crew/messages`): plain text, blank lines make paragraphs, web addresses become links, up to 2,000 characters. A message is edited or removed by whoever posted it, or by an admin; admins can pin one to the top. The road's status lines from Crew → Live land on the same board with the miles, so on the day it is one feed. Pinned first, then newest first; the home page shows six and folds the rest behind "Show earlier" (Live shows twelve). The pages poll `/api/live` once a minute, so a post reaches open phones without a reload. Every post, edit, removal and pin is journaled; a removed message stays in the `messages` table marked `deleted`. Rendering is `src/components/message-body.tsx` (React nodes, never injected HTML); the library is `src/lib/messages.ts`.

## The crew (public)

`/support-crew`, "The crew" in the top nav (`/crew` is the board's door, so the public page lives here). For now a holding card, "To be announced"; the names and roles replace it once the crew is finalised. The footer's link to the board reads "Crew sign-in" so the two don't collide.

## The crew (the board)

**Crew → People** (`/crew/people`): one record per rider and crew member — role on the ride, agreed/briefed, mobile, first aid, emergency contact and so on, in `crew_details`. Each person can add a **picture** of themselves on their own page (admins for anyone): shrunk in the browser like a message picture, kept in `people_photos`, served by `/api/people/photo/<id>?v=<updated at>` to crew sessions only, shown as the avatar on the roster and at the top of their page. Nothing public uses the pictures yet; opening that route up is a decision for when the public crew page is built. Who can sign in at all, and who is an admin, is Admin → People; someone who leaves the crew is made inactive there, not deleted.

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

## Stops (the real places)

**Crew → Stops** (`/crew/stops`): the planner in Crew → Route puts a 60 min stop every riding hour and the longer stops at Simon's rendezvous; this is where the crew pin the actual places for them, scouted on Street View or the map. The page lists every planned stop of the saved plan by day (mile, nearest town, planned time, a "Street View here" link at the plan's position) with the spots pinned for it, and a map of both. Crew only; nothing public.

- **Pin a spot** (`/crew/stops/new`, or from a planned stop with `?day=&n=`, which shows where the plan puts it as a star and a one-mile ring): paste a Google Maps / Street View link, a `maps.app.goo.gl` share link (followed on the server), or the numbers from a long-press ("52.63, -1.12"); or tap the map and drag the pin; or "Where I am". Satellite view in the map's layer switch. The pin's day, mile, distance off the route and nearest town are worked out from the GPX as it moves.
- Name, kind (60 min / longer / other), notes, and up to 12 pictures a stop (several at once, shrunk in the browser like message pictures, each with a caption). Anyone on the crew can add, change or remove; all in the audit journal.
- A spot belongs to the nearest planned stop on its day within 8 miles; others are listed as "Other spots".
- **Make this the stop** (on the list and on the spot's page) deploys it: it replaces the nearest planned stop on its day and takes that stop's kind. It joins the plan as a named stop `spot:<id>` with a `role` (`short` or `long`, `NamedStop` in `plan.ts`): it swallows the routine stop due up to 40 riding minutes before it (`ABSORB_MIN`) and restarts that stop's clock, so the timetable runs from its real mile. A rendezvous it replaces (`stop_spots.replaces_key`) is switched off and shown "replaced by" in the planner, its planned time cleared; deploying over another deployed spot puts that one back to a pin. Hourly ones are crew only (`hidden` events are left off `publicEvents`); longer ones show on the public timetable by name. "Take out of the plan" undoes it; moving a deployed pin off the route or onto the other day takes it out too.
- Tables `stop_spots` (soft delete) and `stop_spot_photos` (data URLs), created on first use, in the full backup. Pictures served by `/api/stops/photo/<id>` to crew sessions only.
- Code: `src/lib/stops.ts` (placing on the route, link resolving, matching to the plan), `src/lib/stop-place.ts` (link parsing, Street View / directions URLs), `src/app/crew/stops/`, `src/components/stop-spot-editor.tsx`, `stops-map*.tsx`, `spot-photos.tsx`.

## Weather

**Crew → Weather** (`/crew/weather`; JSON at `/api/weather`, `?fresh=1` to force a fetch). The route is cut into 10-mile stretches; each gets the hour of weather at the time the saved crew plan (Crew → Route) has the riders passing it. Two views per day: the cross-section — temperature as a heat band with a key, rain as marks, wind as arrows drawn relative to the direction of travel (you ride left → right; red = headwind, green = tailwind, amber = crosswind) over the elevation profile with the timetable along the top — and the point-by-point table.

- **Forecast**: [Open-Meteo](https://open-meteo.com) best-match (ECMWF, Met Office and DWD blended; rain chances from ensembles), hourly, for every point in one request, 16 days ahead. Cached in settings (`weather.forecast`) for 30 minutes; "Fetch the latest forecast" forces it. The 14th comes into range on 30 Oct, the 15th on 31 Oct — the page switches by itself and says how many days out and how much to trust it.
- **Typical** (before then, and as the "normally…" comparison after): `content/weather/climatology.json`, ten mid-Novembers of ERA5 averages hour by hour at every point, written by `npm run weather:climatology` (Open-Meteo archive, no key). The **Weather climatology** GitHub workflow runs it and commits the file — run it from the Actions tab after the route changes. Until the file exists the page uses long-term regional averages built into `src/lib/weather.ts`, adjusted for height.
- Dry run with invented weather: `OPEN_METEO_FORECAST_URL=http://127.0.0.1:3099/v1/forecast WEATHER_TODAY=2026-11-06 npm run dev` against any server that answers in Open-Meteo's shape.

**Public → Weather** (`/weather`, "Weather" in the top nav, behind the dark switch like the rest of the public site). The same tiles, key, cross-section and table at the public pace (the crew plan at a fixed 12 mph, every stop in; the crew's chosen speed never reaches the public), for spectators and anyone riding a stretch alongside:

- **Where will you be?** — pick the place you'll watch from (the start, the support stops, the finish and every town the line passes, by day and mile; or tap a stretch on a chart) and see the time the riders are expected, the weather at that hour, and the hours either side. If a support stop is at that place it says when they arrive and when they leave. Add a second place to ride along to, and the stretch between is summed up (miles, times, temperatures, rain, how much is tail, cross and head) and listed piece by piece. The pick is drawn on the chart; the map link goes to the road at that mile, not the town centre.
- **Updates itself**: the page fetches `/api/weather?pace=public&full=1` every ten minutes (and when a phone comes back to it after five), so the half-hourly forecast reaches it without a reload, and the typical-day view switches to the forecast on its own when the dates come into range.
- **On the weekend** it polls `/api/live` once a minute. The crew's latest post with a mile puts a bicycle on the chart at that mile, fades the stretches behind it and, when the riders are 10 minutes or more off the plan, moves every time ahead of them by that much and re-reads each stretch at its new hour (`shiftDay` / `progressFor` in `src/lib/weather.ts`). A post from another day, or more than four hours old, is ignored.

The maths (segments, headings, head/tail/cross, the hours around a point, moving the clock) is `src/lib/weather.ts`; fetching and caching `src/lib/weather-server.ts` (`getRideWeather(force, pace)`); the shared pieces `src/components/weather-parts.tsx`; the crew page `src/components/weather-view.tsx`; the public page `src/components/public-weather.tsx`; colours are the `--wx-*` tokens. `/api/weather` gives an anonymous visitor the public pace whatever it asks for; a crew session gets the crew pace unless it asks for `pace=public`.

## The dark switch

`site.public_live` in settings; flipped from Admin, journaled. The `PUBLIC_LIVE` environment variable (`true`/`false`) overrides it if set. While dark every public route serves the holding page with `noindex` and `robots.txt` disallows everything — except for a signed-in crew session, which previews the full pages (with a banner and a link to see the holding page).

## The import (spec §8)

Admin → Import CSV. Columns: `title,area,owner,due,status,waiting_on,note,last_touched,source`. Idempotent on title + owner. `last_touched` sets the item's age so Stale is honest from day one. The seed is `content/seed/items.csv`.

## Facts recorded by the first build

- JustGiving refuses framing (`x-frame-options: SAMEORIGIN`, 12 Oct 2026). The Charity page uses a button plus a total fetched from the page's embedded data (hourly cache, admin override).
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
