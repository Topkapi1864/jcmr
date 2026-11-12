# Ride the route: the generator

`ride/view.html` — the quarter-mile street-picture viewer behind `/route/ride` and `/crew/ride`
(`src/lib/ride-viewer.ts`) — is built by `tools/ride/build.mjs` from the two route files the site itself
draws: `content/route/day1.gpx` and `content/route/day2.gpx`. When the line changes, run it again:

    node tools/ride/build.mjs

That is the whole job. It needs no key and makes no call to Google.

Every picture is Google Street View, from the Google API (Gary, 12 Nov 2026: "completely rebuilt … just
street view only images this time from the Google API"). There is no other picture source, and no picture
is kept in the repo. A point where Google has no Street View says "No Street View here" and shows no
picture; it is never filled from a neighbouring point or from anywhere else.

The October viewer (5 October line, Mapillary pictures with Google filling the gaps) was built in a
session whose generator was never committed; this one replaces it.

## How the pictures reach a visitor

The page is served by the site, which puts its own Google key (`GOOGLE_MAPS_KEY` in Vercel, locked to the
site) into the one `__GMAPS_KEY__` slot. Then, in the visitor's browser:

1. For each point the page asks Google's Street View **metadata** service whether there is an outdoor
   picture within 25 m (`radius` in the data). That check is free. The strip under the profile fills in as
   the answers come: Street View / none / not asked yet, with a running count for the day.
2. Where there is one it asks for the picture (640×480, looking along the road). Google counts and bills
   each picture against the site key. A whole ride-through is about 900 pictures.
3. If Google refuses the check itself (a key not allowed it), the page stops checking and simply asks for
   each picture. If Google does not send a picture — no Street View, the day's allowance used up, a dropped
   connection — the point says so in words; it never shows a broken image. Three refusals in a row during
   play stop the ride and say at which day and mile.

The time-lapse, the three speeds, Look around, Full screen, Skip, the day tabs and the side panel are as
they were in October; play looks 16 points ahead for coverage and pictures so fast play does not flicker.

## Options

    node tools/ride/build.mjs --out DIR         # write the page somewhere else (a preview)
    node tools/ride/build.mjs --check           # read ride/view.html back against the route files
    node tools/ride/build.mjs --near day,lat,lon   # (repeatable) print the quarter-mile point nearest a place
    node tools/ride/test.mjs                    # the tests; Google is played by a local server

    GOOGLE_MAPS_KEY_STUDIO=… node tools/ride/build.mjs --coverage build
        # ask Google here instead, once, at build time, with a key of our own that is NOT locked to a website
        # (--key-env NAME / --env-file PATH for another place to read it). The page then carries the answers
        # and the report counts the points with and without Street View exactly.
    … --coverage build --images build
        # also fetch each picture once into ride/img/. Google's Maps Platform terms restrict keeping and
        # re-serving Street View pictures: not to be used without Gary's word.

A key, when one is used, is never written to a file or printed.

## What the build does

1. Reads the two tracks; measures them on the same sphere and mile as `src/lib/route.ts`, so the viewer's
   day totals are the Route page's.
2. Puts a point every quarter mile from the start of each day (the last point is the last whole quarter
   mile). Each looks along the road 40 m ahead.
3. Draws the map line from the route file itself, simplified to within 4 m.
4. Takes the stops from the waypoints **inside the route files** (name and words unchanged), placed by mile
   on this line.
5. Checks the line against the places in `GATE` (St Albans round Gorhambury, Shepshed, Bridge Hill at
   Oughtibridge, the A6102 at Wharncliffe Side, the B6449 at Silkstone, Woodlesford). **If one fails,
   nothing is written.**
6. Writes `ride/view.html` from `view.template.html`, removes `ride/img/`, and prints a report.

## The page and the site

`src/lib/ride-viewer.ts` puts the key in, and for the public door drops every Day 1 point before half a
mile so nothing shows the house. The page's data block keeps the shape that code reads (`days[].line`,
`points[].day / day_miles / lat / lon`). `tools/ride/test.mjs` checks this.
