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
- GPX: commit Simon's files as `content/route/day1.gpx` and `content/route/day2.gpx`. The map, elevation and towns appear when they exist; until then a day is a dashed schematic from the roadbook.
- Route planner: **Crew → Route** (`/crew/route`). Start times, moving speed, routine-stop rules (5 min every hour, 15 every three, halfway…) and the motorhome rendezvous (from Admin → Route, or **Import** there to load Simon's roadbook stops). "Save as the crew plan" stores it in settings (`route.plan`) and writes the arrival times onto the stops, so the public route page shows them. "Share scenario" encodes the plan in the link; "Copy timetable" is WhatsApp-ready. The engine is `src/lib/plan.ts`; the GPX → miles/elevation/waypoints/towns derivation is `src/lib/route.ts` (served at `/api/route-geo?format=profile`).

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
