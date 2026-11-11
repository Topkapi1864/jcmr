# Route files: how V2.0 was made (11 Nov 2026)

`content/route/day1.gpx` and `day2.gpx` are the files the site draws, plans from and
offers for download. V2.0 is Simon's 5 October line (kept in `content/route/v1/`) with:

- four dead-end out-and-backs removed (Day 1 at about 76, 119 and 176 km, and the
  Farm Lane one near Gorhambury; Day 2 at 3.3 km). Each was the line riding up a side
  road and straight back down it, 150 m to 1.75 km extra;
- Day 1 taken round the Gorhambury estate (a permissive footpath, 8am to 6pm, nothing
  said about bikes): right on the A4147, up Bluehouse Hill, left on the A5183 Redbourn
  Road. 5.0 km in place of 4.6 km through the estate.

Day 1 is 195.0 km (121.2 miles), Day 2 174.9 km (108.7 miles).

The same line is in Garmin Connect as the two "V2.0" courses. The Garmin courses were
made first (Garmin's own router drew the bypass); these files were then made from the
site's v1 files by `make_v2.py`, and checked against a sample of the Garmin courses
(every 100th point): nothing further than 0.6 m from this line.

To rebuild:

    python3 tools/route/make_v2.py 1 content/route/v1/day1.gpx content/route/day1.gpx \
        tools/route/garmin-sample-day1.txt tools/route/gorhambury-bypass.txt tools/route/gorhambury-bypass-ele.txt
    python3 tools/route/make_v2.py 2 content/route/v1/day2.gpx content/route/day2.gpx tools/route/garmin-sample-day2.txt

When the line changes again: put the old files in a new `content/route/v<n>/`, bump
`ROUTE_VERSION` in `src/lib/constants.ts` (the download is named after it and the
scouted spots' miles are re-placed once, `src/lib/route-version.ts`), then press
"Save as the crew plan" in Crew → Route so the planned times on the stops follow.
