import os, csv, json, math
import numpy as np
from PIL import Image, ImageOps
import imagehash

ROOT = "/home/claude/janet"
MED = f"{ROOT}/med"
os.makedirs(f"{ROOT}/thumb", exist_ok=True)
os.makedirs(f"{ROOT}/tile", exist_ok=True)

rows = list(csv.reader(open(f"{ROOT}/index.csv")))
meta = {}
for r in rows:
    pid, fname, nbytes, w, h, exif_date, model, orient = r[:8]
    meta[pid] = dict(id=pid, file=fname, bytes=int(nbytes), w=int(w or 0), h=int(h or 0), exif_date=exif_date, model=model)

ids = sorted(meta)
out = {}
hashes = {}
for i, pid in enumerate(ids):
    im = Image.open(f"{MED}/{pid}.jpg").convert("RGB")
    W, H = im.size
    # thumb 320 longest side
    th = im.copy(); th.thumbnail((320, 320), Image.LANCZOS)
    th.save(f"{ROOT}/thumb/{pid}.jpg", quality=80, optimize=True)
    # tile 64 square centre crop
    tile = ImageOps.fit(im, (64, 64), Image.LANCZOS, centering=(0.5, 0.4))
    tile.save(f"{ROOT}/tile/{pid}.jpg", quality=85)
    # hash
    hashes[pid] = imagehash.phash(im)
    # colour stats on a small version
    small = ImageOps.fit(im, (48, 48), Image.BILINEAR)
    arr = np.asarray(small).astype(np.float32) / 255.0
    hsv = np.asarray(small.convert("HSV")).astype(np.float32) / 255.0
    sat = float(hsv[..., 1].mean())
    val = float(hsv[..., 2].mean())
    # dominant colours: simple k-means (k=4) on the 48x48 pixels
    px = arr.reshape(-1, 3)
    rng = np.random.default_rng(0)
    cents = px[rng.choice(len(px), 4, replace=False)]
    for _ in range(12):
        d = ((px[:, None, :] - cents[None, :, :]) ** 2).sum(-1)
        lab = d.argmin(1)
        for k in range(4):
            if (lab == k).any():
                cents[k] = px[lab == k].mean(0)
    counts = np.bincount(lab, minlength=4)
    order = counts.argsort()[::-1]
    doms = [("#%02x%02x%02x" % tuple(int(v * 255) for v in cents[k]), int(counts[k])) for k in order]
    # hue of the most saturated dominant colour (weighted), for the colour sort
    import colorsys
    best_h, best_w = 0.0, -1
    mean_rgb = px.mean(0)
    mh, ms, mv = colorsys.rgb_to_hsv(*mean_rgb)
    for k in order:
        r_, g_, b_ = cents[k]
        hh, ss, vv = colorsys.rgb_to_hsv(r_, g_, b_)
        wgt = counts[k] * ss
        if wgt > best_w:
            best_w, best_h = wgt, hh
    out[pid] = dict(
        meta[pid],
        mw=W, mh=H,
        sat=round(sat, 3), val=round(val, 3),
        hue=round(float(best_h), 3), mean_rgb="#%02x%02x%02x" % tuple(int(v * 255) for v in mean_rgb),
        dom=[c for c, n in doms],
        dom_w=[n for c, n in doms],
        mono=bool(sat < 0.09),
    )
    if i % 100 == 0:
        print(i, flush=True)

# duplicates: phash hamming <= 5
dups = {}
hl = [(pid, hashes[pid]) for pid in ids]
for a in range(len(hl)):
    for b in range(a + 1, len(hl)):
        if hl[a][1] - hl[b][1] <= 5:
            pa, pb = hl[a][0], hl[b][0]
            # keep the one with the larger original
            keep, drop = (pa, pb) if out[pa]["bytes"] >= out[pb]["bytes"] else (pb, pa)
            if drop not in dups:
                dups[drop] = keep
for d, k in dups.items():
    out[d]["dup_of"] = k
print("duplicates", len(dups))
json.dump(out, open(f"{ROOT}/index1.json", "w"))
print("done", len(out))
