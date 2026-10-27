# Where the design lives

The JCMR identity from the design handoff (12 Oct 2026 — navy / duck egg / cream, Literata + Figtree + JetBrains Mono, the wheel badge) is applied. The handoff prototypes are kept in `JCMR/site/design_handoff_jcmr/` on the Drive, not in the repo. This file lists where each part of the design lives so a change lands in one place.

## 1. Tokens — `design/tokens.css`

Every colour, font family, type-scale step, spacing step, radius and shadow is a CSS custom property on `:root`, with a dark-mode block and a `[data-shell="tv"]` block. Components consume tokens only. `npm run lint:tokens` (run as part of `npm run build`) fails if a colour or `font-family` literal appears anywhere under `src/`.

Keep every property name; change the values. Brand values are the `--navy`, `--duck-egg`… properties at the top; the `--color-*` semantic layer maps them for light (public) and dark (crew, TV) shells. Add new ones freely — then use them in `src/app/globals.css`.

Fonts: if the design wants web fonts, either add `@font-face` rules to `tokens.css` pointing at files in `public/fonts/` (self-hosted, no third-party script), or load them with `next/font` in `src/app/layout.tsx` and point `--font-body` / `--font-display` at the generated variables.

## 2. Component styles — `src/app/globals.css`

One stylesheet, organised by section. Classes the templates use:

| Section | Classes |
|---|---|
| Base | `body`, `h1–h3`, `.container`, `.prose`, `.stack`, `.row`, `.muted`, `.small` |
| Shells | `.shell-header`, `.brand`, `.nav`, `.shell-main`, `.shell-footer`, `.preview-banner` |
| Buttons | `.btn`, `.btn-primary`, `.btn-big`, `.btn-sm`, `.btn-quiet`, `.btn-danger` |
| Forms | `label.field`, inputs/selects/textarea, `.form-inline`, `.error`, `.notice` |
| Cards | `.card`, `.tiles`/`.tile`, `.list`, `table.table` |
| Badges | `.badge`, `.badge-{open,in-progress,blocked,done,amber,red,overdue}` |
| Item card (crew) | `.item-card[data-stale][data-status]`, `.title`, `.meta`, `.waiting`, `.side`, `.stale-count` |
| Board chrome | `.views`, `.counts`, `.stale-strip[data-level]`, `.group-title`, `details.done-group`, `.filters`, `.fab` |
| Notes/history | `.note`, `.history`, `.toast` |
| Public | `.hero`, `.live-strip`, `.dates`, `.mum-photo`, `.rider-cards`, `.rider-photo`, `.day-block`, `.day-stats`, `.map`, `.total`, `.holding` |
| Live (phone) | `.live-top`, `.live-day`, `.live-status`, `.live-frame`, `.age[data-level]` |
| TV | `.tv`, `.tv-head`, `.tv-status`, `.tv-sub`, `.tv-frame`, `.tv-foot`, `.tv-age[data-level]` |

## 2b. Identity — `src/components/logo.tsx`

`Wheel` (8/4/0 spokes for 96/48/24px), `Lockup` (wheel + JCMR + name), `Badge` (the roundel). Favicon: `src/app/icon.svg`. Photos: `public/photos/janet-*.jpg`.

## 3. The three shells — `src/components/shells.tsx`

- `PublicShell` — header (brand, the nav: Mum, The album, The riders, The crew, The route, Weather, Give, and Live on the weekend; the Donate button), optional preview banner, main, footer.
- `CrewShell` — compact header with the crew nav and sign-out.
- `TvShell` — no chrome; sets `data-shell="tv"` so the TV token block applies.

## 4. Public page templates

| Page | File |
|---|---|
| Home | `src/app/page.tsx` |
| Mum | `src/app/mum/page.tsx` |
| The riders | `src/app/riders/page.tsx` |
| The crew (holding card until the crew is finalised) | `src/app/support-crew/page.tsx`; `.crew-tba` in `globals.css` |
| The route (incl. map) | `src/app/route/page.tsx`, `src/components/route-map-inner.tsx` |
| Crew → Route planner | `src/components/route-planner.tsx`, `route-plan-map.tsx`, `elevation.tsx`; styles under “Route planner” in `globals.css` |
| Crew → Weather (cross-section, tiles, key) | `src/components/weather-view.tsx` over the shared pieces in `src/components/weather-parts.tsx`; styles under “Weather (crew)” in `globals.css`; the heat-map and wind colours are the `--wx-*` tokens |
| Weather (public: the same pieces, “Where will you be?”, the hours either side, the riders’ live mile) | `src/app/weather/page.tsx`, `src/components/public-weather.tsx`; styles under “Weather (public)” in `globals.css` |
| Give (charity, the gift-by-gift chart, latest words) | `src/app/donate/page.tsx`, `src/components/giving-chart.tsx`; styles under “Give” in `globals.css`; the Legion logo is `public/charity/rbl-logo.png` |
| Live — phone and TV forms | `src/components/live-view.tsx` (one component, `tv` prop) |

## 5. Crew components

- Item card (list form), list/group/sort chrome: `src/components/board.tsx`
- Item page: `src/app/crew/items/[id]/page.tsx`
- Done button + undo toast: `src/components/done-button.tsx`

## 6. Holding page and sign-in

- Holding (the dark state): `src/components/holding.tsx`
- Sign-in: `src/app/crew/signin/page.tsx`, `password-form.tsx`, `who/page.tsx`

## 7. Favicon, OG image, 404

- `src/app/favicon.ico` (replace), `src/app/icon.png` / `apple-icon.png` (add if wanted)
- `src/app/opengraph-image.png` (add, 1200×630) — Next picks it up automatically
- `src/app/not-found.tsx`

## Photographs

Mum's photo and rider photos are committed files under `public/photos/`; their paths are typed into Admin → Content.
