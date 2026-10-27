"""Merge everything into content/janet/photos.json for the site, plus face crops and the mosaic files."""
import json, os, glob, csv, shutil
from collections import defaultdict
from PIL import Image

ROOT = "/home/claude/janet"
SITE = "/home/claude/jcmr"
idx = json.load(open(f"{ROOT}/index1.json"))
col2 = json.load(open(f"{ROOT}/colour2.json"))
faces = json.load(open(f"{ROOT}/faces_clustered.json"))
JANET = {12, 31}

# tags
tags = {}
for f in sorted(glob.glob(f"{ROOT}/tags/*.jsonl")):
    for line in open(f):
        line = line.strip()
        if not line: continue
        try:
            d = json.loads(line)
        except Exception as e:
            print("bad line", f, line[:80]); continue
        if d.get("id"): tags[d["id"]] = d
print("tagged", len(tags))

uniq = [p for p in sorted(idx) if "dup_of" not in idx[p]]
missing = [p for p in uniq if p not in tags]
print("missing tags", len(missing), missing[:10])

# screenshots and the like stay out of everything, including the mosaics (mosaic.py reads this)
excl = sorted(p for p in uniq if tags.get(p, {}).get("not_photo") or tags.get(p, {}).get("error"))
json.dump(excl, open(f"{ROOT}/exclude.json", "w"))
print("excluded", len(excl), excl)

# The Sony DSC-T3 was not on sale until autumn 2004, yet its EXIF dates run Jan to Aug 2004;
# the filenames ("2005 Summer 024.jpg", "05M23 002.jpg") show the clock was set a year early.
def fix_t3(model, date):
    if date and model.strip() == "DSC-T3":
        return str(int(date[:4]) + 1) + date[4:]
    return date


DIED = "2024-11-15"


def is_copy(m, t, date):
    """A dated file that is really a scan or a re-photograph of an older picture: a
    scanner as the camera, a date after Janet died, or the tagger seeing a picture
    five or more years older than the file's date (prints have borders, period
    colour and clothes the model recognises)."""
    model = (m["model"] or "").lower()
    if "scan" in model:
        return True
    if date[:10] > DIED:
        return True
    if t.get("est_year") and abs(int(t["est_year"]) - int(date[:4])) >= 5:
        return True
    return False

by_pid = defaultdict(list)
for f in faces:
    by_pid[f["pid"]].append(f)

def iso(exif):
    if not exif: return None
    try:
        d, t = exif.split(" ")
        y, m, dd = d.split(":")
        if y == "0000": return None
        return f"{y}-{m}-{dd}T{t}"
    except Exception:
        return None

# screenshots whose photograph rescue.py managed to crop out of the phone chrome
rescued = json.load(open(f"{ROOT}/rescued.json")) if os.path.exists(f"{ROOT}/rescued.json") else {}

photos = []
for p in uniq:
    m = idx[p]
    t = tags.get(p, {})
    if (t.get("not_photo") or t.get("error")) and p not in rescued:
        continue
    scan = ("DigiScan" in m["file"]) or (not m["exif_date"])
    date = None if "DigiScan" in m["file"] else fix_t3(m["model"], iso(m["exif_date"]))
    if date and is_copy(m, t, date):
        # a scan or a phone photograph of an old print: the file's date is the day it was copied
        scan, date = True, None
    if date and date[5:10] == "01-01" and date[11:13] == "00":
        date = None  # a camera whose clock was never set (p1141, 1 Jan 00:06)
    year = int(date[:4]) if date else (int(t["est_year"]) if t.get("est_year") else None)
    yc = "high" if date else (t.get("year_conf") or "low")
    W, H = m["mw"], m["mh"]
    ox = oy = 0
    src = ROOT
    if p in rescued:
        ox, oy, x2, y2 = rescued[p]
        W, H = x2 - ox, y2 - oy
        src = f"{ROOT}/rescued"
    th = Image.open(f"{src}/thumb/{p}.jpg").size
    fl = []
    for f in by_pid.get(p, []):
        x1, y1, x2, y2 = f["bbox"]
        x1, y1, x2, y2 = x1 - ox, y1 - oy, x2 - ox, y2 - oy
        if x2 <= 0 or y2 <= 0 or x1 >= W or y1 >= H:
            continue  # the face was in the chrome (a chat avatar, say), not the picture
        fl.append({"c": f["cluster"], "b": [round(max(0, x1) / W, 3), round(max(0, y1) / H, 3), round(min(W, x2) / W, 3), round(min(H, y2) / H, 3)], "age": f["age"]})
    janet_flag = "yes" if any(f["c"] in JANET for f in fl) else (t.get("janet") or "unsure")
    setting = t.get("setting", "other")
    if setting == "screenshot":
        setting = "other"
    photos.append(dict(
        id=p, w=W, h=H, tw=th[0], th=th[1], year=year, yc=yc, date=date, cam=m["model"],
        set=setting, occ=t.get("occasion", []) or [], ppl=int(t.get("people", 0) or 0), kids=bool(t.get("children")),
        janet=janet_flag, laugh=bool(t.get("laughing")), q=int(t.get("quality", 3) or 3), cap=t.get("caption", ""), colours=t.get("colours", ""),
        hue=m["hue"], sat=m["sat"], val=m["val"], dom=m["dom"][:3], mono=m["mono"], scan=scan, faces=fl,
        chue=col2.get(p,{}).get("chue"), cfrac=col2.get(p,{}).get("cfrac",0), cval=col2.get(p,{}).get("cval",0), csat=col2.get(p,{}).get("csat",0),
    ))
print("photos", len(photos))
kept = {p["id"] for p in photos}

# people: clusters other than Janet with >= 10 photos (with Janet in them), picked face crop = largest, frontal-ish, in a kept photo
clusters = defaultdict(list)
for f in faces:
    if f["cluster"] in JANET or f["pid"] not in kept: continue
    clusters[f["cluster"]].append(f)
people = []
os.makedirs(f"{SITE}/public/album/faces", exist_ok=True)
byid = {p["id"]: p for p in photos}
for c, fl in clusters.items():
    pids = sorted({f["pid"] for f in fl})
    if len(pids) < 10: continue
    best = max(fl, key=lambda f: f["size"] * f["score"])
    im = Image.open(f"{ROOT}/med/{best['pid']}.jpg")
    x1, y1, x2, y2 = best["bbox"]; w = x2 - x1; h = y2 - y1; mg = 0.45
    box = (max(0, x1 - mg * w), max(0, y1 - mg * h), min(im.width, x2 + mg * w), min(im.height, y2 + mg * h))
    crop = im.crop(box)
    s = min(crop.size)
    crop = crop.crop(((crop.width - s) // 2, (crop.height - s) // 2, (crop.width - s) // 2 + s, (crop.height - s) // 2 + s)).resize((160, 160), Image.LANCZOS)
    crop.save(f"{SITE}/public/album/faces/c{c}.jpg", quality=85)
    ys = [byid[p]["year"] for p in pids if byid[p]["year"]]
    people.append(dict(c=c, n=len(pids), cover=best["pid"], box=[round(v, 3) for v in (box[0] / im.width, box[1] / im.height, box[2] / im.width, box[3] / im.height)], years=[min(ys), max(ys)] if ys else None, photos=sorted(pids, key=lambda p: (byid[p]["date"] or f"{byid[p]['year'] or 9999}-07-01"))))
people.sort(key=lambda x: -x["n"])
print("people", [(p["c"], p["n"]) for p in people])

# mosaics
mosaics = []
for key, title in (("mosaic-sea", "Janet laughing in the sea, made of every photograph in the album."), ("mosaic-portrait", "The portrait from the Mum page, made of every photograph in the album.")):
    src = f"{ROOT}/out/{key}.json"
    if not os.path.exists(src): continue
    m = json.load(open(src))
    # cells must point to kept photos; a dropped one falls back to a neighbour
    cells = [c if c in kept else None for c in m["cells"]]
    last = next(c for c in cells if c)
    for i, c in enumerate(cells):
        if c: last = c
        else: cells[i] = last
    mosaics.append(dict(key=key, title=title, cols=m["cols"], rows=m["rows"], tile=m["tile"], cells=cells))
    shutil.copy(f"{ROOT}/out/{key}.jpg", f"{SITE}/public/album/{key}.jpg")
    shutil.copy(f"{ROOT}/out/{key}-1200.jpg", f"{SITE}/public/album/{key}-1200.jpg")

os.makedirs(f"{SITE}/content/janet", exist_ok=True)
json.dump({"photos": photos, "janetClusters": sorted(JANET), "people": people, "mosaics": mosaics}, open(f"{SITE}/content/janet/photos.json", "w"), separators=(",", ":"))
print("wrote photos.json", os.path.getsize(f"{SITE}/content/janet/photos.json"))

# the pictures (rescued crops replace the raw screenshot)
for sub in ("med", "thumb", "tile"):
    os.makedirs(f"{SITE}/public/album/{sub}", exist_ok=True)
    for p in kept:
        dst = f"{SITE}/public/album/{sub}/{p}.jpg"
        if p in rescued:
            shutil.copy(f"{ROOT}/rescued/{p}.jpg" if sub == "med" else f"{ROOT}/rescued/{sub}/{p}.jpg", dst)
        elif not os.path.exists(dst):
            shutil.copy(f"{ROOT}/{sub}/{p}.jpg", dst)
# and nothing that is no longer in the album
for sub in ("med", "thumb", "tile"):
    for f in os.listdir(f"{SITE}/public/album/{sub}"):
        if f[:-4] not in kept:
            os.remove(f"{SITE}/public/album/{sub}/{f}")
print("copied")
