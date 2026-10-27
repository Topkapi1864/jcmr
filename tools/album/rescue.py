"""Rescue screenshots: crop away phone UI chrome and black/white frames so the
photograph inside can stay in the album. Writes rescued/{id}.jpg plus
rescued.json ({id: [x0, y0, x1, y1]} in med-image pixels) for build_index.py.
Anything whose crop is too small or too thin is left out (chat screenshots
with a tiny picture, photos of a laptop screen)."""
import json, os, sys
import numpy as np
from PIL import Image

ROOT = "/home/claude/janet"
ids = json.load(open(f"{ROOT}/exclude.json")) if len(sys.argv) < 2 else sys.argv[1:]
os.makedirs(f"{ROOT}/rescued", exist_ok=True)


def runs(mask, gap):
    """longest run of True in mask, allowing gaps up to `gap` long"""
    best = (0, 0)
    start = None
    last_true = None
    for i, v in enumerate(mask):
        if v:
            if start is None:
                start = i
            last_true = i
        elif start is not None and i - last_true > gap:
            if last_true - start > best[1] - best[0]:
                best = (start, last_true)
            start = None
    if start is not None and last_true - start > best[1] - best[0]:
        best = (start, last_true)
    return best


def photo_rows(a, axis, flat=0.70, gap_frac=0.012):
    """rows (axis=1) or columns (axis=0) that look like photograph rather than chrome.
    Chrome (status bars, share bars, frames) is mostly one flat colour with a little
    text or a few icons: most pixels sit within a few levels of the line's median.
    A photograph's pixels spread out."""
    if axis == 0:
        a = a.transpose(1, 0, 2)
    med = np.median(a, axis=1, keepdims=True)
    near = (np.abs(a - med).max(axis=2) < 14).mean(axis=1)
    mask = near < flat
    n = len(mask)
    return runs(mask, max(2, int(n * gap_frac)))


OVERLAY = {"p0609": (0.07, 0.09), "p0614": (0.07, 0.09)}
# not screenshots but photographs of a screen, or screenshots of things that are not her: no crop will help
SKIP = {"p0001", "p0871", "p0873"}
ids = [p for p in ids if p not in SKIP]
# kept whole: the photo booth strip is the picture, borders and all
WHOLE = {"p0642"}

out = {}
for p in ids:
    im = Image.open(f"{ROOT}/med/{p}.jpg").convert("RGB")
    a = np.asarray(im).astype(np.float32)
    H, W = a.shape[:2]
    y0, y1 = photo_rows(a, axis=1)
    sub = a[y0 : y1 + 1]
    x0, x1 = photo_rows(sub, axis=0)
    # tighten the rows again inside the chosen columns (the status bar text sits at the edges)
    sub2 = a[:, x0 : x1 + 1]
    y0b, y1b = photo_rows(sub2, axis=1)
    y0, y1 = max(y0, y0b), min(y1, y1b)
    # share bars and toolbars: a band of near-white or near-black rows at the top or
    # bottom that is still mostly flat even if icons break it up a little
    def bandish(row):
        m = np.median(row, axis=0)
        bright = m.mean() > 225 or m.mean() < 25
        return bright and (np.abs(row - m).max(axis=1) < 24).mean() > 0.55
    lim = int(0.15 * H)
    while y1 > y0 + lim and bandish(a[y1, x0 : x1 + 1]):
        y1 -= 1
    while y0 < y1 - lim and bandish(a[y0, x0 : x1 + 1]):
        y0 += 1
    # a few have the viewer's buttons drawn over the picture itself (Google Photos);
    # checked by eye, these lose a sliver top and bottom
    if p in OVERLAY:
        t, b = OVERLAY[p]
        y0, y1 = y0 + int(t * (y1 - y0)), y1 - int(b * (y1 - y0))
    if p in WHOLE:
        x0, y0, x1, y1 = 0, 0, W - 1, H - 1
    w, h = x1 - x0 + 1, y1 - y0 + 1
    area = w * h / (W * H)
    ok = (area >= 0.30 and w >= 300 and h >= 300 and 0.4 <= w / h <= 2.6) or p in WHOLE
    print(p, (x0, y0, x1, y1), f"{area:.2f}", "ok" if ok else "skip")
    if ok:
        crop = im.crop((x0, y0, x1 + 1, y1 + 1))
        crop.save(f"{ROOT}/rescued/{p}.jpg", quality=85)
        for sub, px in (("thumb", 320), ("tile", 64)):
            os.makedirs(f"{ROOT}/rescued/{sub}", exist_ok=True)
            c = crop.copy()
            if sub == "tile":
                s = min(c.size)
                c = c.crop(((c.width - s) // 2, (c.height - s) // 2, (c.width - s) // 2 + s, (c.height - s) // 2 + s))
            c.thumbnail((px, px), Image.LANCZOS)
            c.save(f"{ROOT}/rescued/{sub}/{p}.jpg", quality=80)
        out[p] = [x0, y0, x1 + 1, y1 + 1]
json.dump(out, open(f"{ROOT}/rescued.json", "w"))
print("rescued", len(out), "of", len(ids))
