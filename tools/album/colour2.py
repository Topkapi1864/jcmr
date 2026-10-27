import json, numpy as np
from PIL import Image, ImageOps
ROOT = "/home/claude/janet"
idx = json.load(open(f"{ROOT}/index1.json"))
ids = [p for p in sorted(idx) if "dup_of" not in idx[p]]
res = {}
for p in ids:
    im = ImageOps.fit(Image.open(f"{ROOT}/med/{p}.jpg").convert("RGB"), (64, 64), Image.BILINEAR)
    hsv = np.asarray(im.convert("HSV")).astype(np.float32) / 255.0
    h, s, v = hsv[..., 0].ravel(), hsv[..., 1].ravel(), hsv[..., 2].ravel()
    mask = (s > 0.28) & (v > 0.18) & (v < 0.97)
    frac = float(mask.mean())
    if frac < 0.06:
        res[p] = dict(chue=None, cfrac=round(frac, 3), cval=round(float(v.mean()), 3))
        continue
    hist, edges = np.histogram(h[mask], bins=36, range=(0, 1), weights=s[mask])
    # smooth circularly so a peak split across a bin edge still wins
    sm = hist + 0.5 * (np.roll(hist, 1) + np.roll(hist, -1))
    k = int(sm.argmax())
    # mean hue inside the winning bin (circular mean)
    sel = mask & (np.floor(h * 36) == k)
    ang = h[sel] * 2 * np.pi
    mh = (np.arctan2(np.sin(ang).mean(), np.cos(ang).mean()) / (2 * np.pi)) % 1.0
    res[p] = dict(chue=round(float(mh), 4), cfrac=round(frac, 3), cval=round(float(v[sel].mean()), 3), csat=round(float(s[sel].mean()), 3))
json.dump(res, open(f"{ROOT}/colour2.json", "w"))
vivid = sorted([p for p in ids if res[p]["chue"] is not None], key=lambda p: (res[p]["chue"], res[p]["cval"]))
quiet = sorted([p for p in ids if res[p]["chue"] is None], key=lambda p: res[p]["cval"])
print("vivid", len(vivid), "quiet", len(quiet))
# strip preview
S = 24; cols = 60
rows = (len(vivid) + cols - 1) // cols
sheet = Image.new("RGB", (cols * S, rows * S + 4 * S), "white")
for i, p in enumerate(vivid):
    sheet.paste(Image.open(f"{ROOT}/tile/{p}.jpg").resize((S, S)), ((i % cols) * S, (i // cols) * S))
for i, p in enumerate(quiet[: cols * 3]):
    sheet.paste(Image.open(f"{ROOT}/tile/{p}.jpg").resize((S, S)), ((i % cols) * S, rows * S + S + (i // cols) * S))
sheet.save("/tmp/claude-0/-home-claude/a6fb479e-bc80-5c1b-ac3e-e2b769b91ae6/scratchpad/colour2.jpg", quality=85)
