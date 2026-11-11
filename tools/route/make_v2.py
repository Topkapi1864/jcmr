#!/usr/bin/env python3
"""Build the V2.0 route files from the site's own GPX.

  make_v2.py <day> <in.gpx> <out.gpx> <garmin-sample.txt> [bypass.txt ele.txt]

Removes exact out-and-back spurs. For day 1 also swaps the Gorhambury estate
section for the road line Garmin routed (A4147, Bluehouse Hill, A5183).
Then checks the result against a sample of the Garmin V2.0 course.
"""
import math
import re
import sys

R = 6371000.0


def dist(a, b):
    dl = math.radians(b[0] - a[0])
    dn = math.radians(b[1] - a[1]) * math.cos(math.radians(a[0]))
    return R * math.hypot(dl, dn)


def seg_dist(p, a, b):
    k = math.cos(math.radians(p[0])) * 111320.0
    m = 110540.0
    px, py = (p[1] - a[1]) * k, (p[0] - a[0]) * m
    bx, by = (b[1] - a[1]) * k, (b[0] - a[0]) * m
    l2 = bx * bx + by * by
    t = max(0.0, min(1.0, (px * bx + py * by) / l2)) if l2 else 0.0
    return math.hypot(px - t * bx, py - t * by), t


def cum_of(pts):
    c = [0.0]
    for i in range(1, len(pts)):
        c.append(c[-1] + dist(pts[i - 1], pts[i]))
    return c


def find_spurs(pts):
    """Places where the line leaves a point and comes back to it along itself."""
    cum = cum_of(pts)
    out, i, n = [], 0, len(pts)
    while i < n:
        best = -1
        j = min(n - 1, i + 1500)
        while j > i + 2:
            pd = cum[j] - cum[i]
            if 80 < pd < 6000 and dist(pts[i], pts[j]) < 6:
                best = j
                break
            j -= 1
        if best > 0:
            half = (cum[i] + cum[best]) / 2
            mid = i
            while cum[mid] < half:
                mid += 1
            dev = 0.0
            for k in range(mid, best + 1):
                mn = min(seg_dist(pts[k], pts[q], pts[q + 1])[0] for q in range(i, mid))
                dev = max(dev, mn)
            out.append({"i": i, "j": best, "km": cum[i] / 1000, "detour": cum[best] - cum[i], "dev": dev})
            i = best + 1
        else:
            i += 1
    return out


def project(pts, p, lo=0, hi=None):
    """(distance, segment index, t) of the nearest place on the line to p."""
    hi = len(pts) - 1 if hi is None else hi
    best = (1e18, lo, 0.0)
    for q in range(lo, hi):
        d, t = seg_dist(p, pts[q], pts[q + 1])
        if d < best[0]:
            best = (d, q, t)
    return best


def deltas(path, scale):
    out, a, b = [], 0, 0
    for tok in open(path).read().strip().split(","):
        x, y = tok.split()
        a += int(x)
        b += int(y)
        out.append((a / scale, b / scale))
    return out


def main():
    day, src, dst, sample = sys.argv[1:5]
    xml = open(src, encoding="utf-8").read()
    first = xml.index("<trkpt")
    last = xml.rindex("</trkpt>") + len("</trkpt>")
    head, tail = xml[:first], xml[last:]
    pts = []
    for m in re.finditer(r"<trkpt\b([^>]*)>([\s\S]*?)</trkpt>", xml[first:last]):
        lat = float(re.search(r'lat="(-?[\d.]+)"', m.group(1)).group(1))
        lon = float(re.search(r'lon="(-?[\d.]+)"', m.group(1)).group(1))
        e = re.search(r"<ele>(-?[\d.]+)</ele>", m.group(2))
        pts.append((lat, lon, float(e.group(1)) if e else None))
    before = cum_of(pts)[-1]
    print(f"day {day}: {len(pts)} points, {before/1000:.2f} km in")

    # 1. Gorhambury bypass (day 1 only), done first so indexes are the source's.
    if len(sys.argv) > 5:
        by = deltas(sys.argv[5], 1e6)
        ev, acc = [], 0
        for tok in open(sys.argv[6]).read().split():
            acc += int(tok)
            ev.append(acc / 10)
        assert len(by) == len(ev)
        dS, qS, tS = project(pts, by[0], 1500, 2600)
        dE, qE, tE = project(pts, by[-1], qS, 2600)
        print(f"  bypass: {len(by)} points; leaves the old line {dS:.1f} m off it at seg {qS}, rejoins {dE:.1f} m off at seg {qE}")
        old = cum_of(pts)
        old_len = (old[qE] + tE * (old[qE + 1] - old[qE])) - (old[qS] + tS * (old[qS + 1] - old[qS]))
        new_len = cum_of(by)[-1]
        print(f"  old section {old_len:.0f} m, new section {new_len:.0f} m")
        mid = [(p[0], p[1], e) for p, e in zip(by, ev)]
        keep_a = pts[: qS + 1] if tS > 0.02 else pts[:qS]
        keep_b = pts[qE + 1 :] if tE < 0.98 else pts[qE + 2 :]
        print(f"  joins: {dist(keep_a[-1], mid[0]):.1f} m in, {dist(mid[-1], keep_b[0]):.1f} m out")
        pts = keep_a + mid + keep_b

    # 2. Spurs.
    spurs = find_spurs(pts)
    drop = set()
    for s in spurs:
        ok = s["dev"] < 8
        print(f"  spur at {s['km']:.2f} km: {s['detour']:.0f} m extra, retrace within {s['dev']:.1f} m -> {'removed' if ok else 'LEFT (not a clean retrace)'}")
        if ok:
            drop.update(range(s["i"] + 1, s["j"] + 1))
    pts = [p for k, p in enumerate(pts) if k not in drop]
    left = find_spurs(pts)
    cum = cum_of(pts)
    print(f"  out: {len(pts)} points, {cum[-1]/1000:.2f} km ({(cum[-1]-before)/1000:+.2f} km), longest step {max(dist(pts[i-1], pts[i]) for i in range(1, len(pts))):.0f} m, spurs left {len(left)}")

    # 3. Against the Garmin V2.0 course (every 100th point of it).
    g = deltas(sample, 1e5)
    worst, where, lo = 0.0, None, 0
    for p in g:
        d, q, _ = project(pts, p, max(0, lo - 400), min(len(pts) - 1, lo + 1200))
        if d > 60:  # lost the thread: search everything
            d, q, _ = project(pts, p)
        lo = q
        if d > worst:
            worst, where = d, (p, cum[q] / 1000)
    print(f"  vs Garmin: {len(g)} sample points, furthest from this line {worst:.1f} m (at {where[1]:.1f} km)")

    head = re.sub(r"(<trk>\s*<name>)([^<]*?)(</name>)", lambda m: m.group(1) + m.group(2).replace(" V2.0", "") + " V2.0" + m.group(3), head, count=1)
    body = "\n".join(
        f'<trkpt lat="{p[0]:.7f}" lon="{p[1]:.7f}">' + (f"<ele>{p[2]:.2f}</ele>" if p[2] is not None else "") + "</trkpt>" for p in pts
    )
    open(dst, "w", encoding="utf-8").write(head + body + tail)


main()
