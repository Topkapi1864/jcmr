import json, numpy as np, os
from sklearn.cluster import AgglomerativeClustering
ROOT = "/home/claude/janet"
recs = json.load(open(f"{ROOT}/faces_all.json"))
idx = json.load(open(f"{ROOT}/index1.json"))

faces = []
for r in recs:
    pid = r["id"]
    if pid not in idx: continue
    W, H = r.get("w", 0), r.get("h", 0)
    for fi, f in enumerate(r["faces"]):
        x1, y1, x2, y2 = f["bbox"]
        size = max(x2 - x1, y2 - y1)
        if f["score"] < 0.6 or size < 28: continue
        faces.append(dict(pid=pid, fi=fi, bbox=f["bbox"], size=size, score=f["score"], age=f.get("age"), gender=f.get("gender"), emb=np.array(f["emb"], dtype=np.float32), W=W, H=H))
print("faces kept", len(faces), "of", sum(len(r["faces"]) for r in recs))
E = np.stack([f["emb"] for f in faces])
E /= np.linalg.norm(E, axis=1, keepdims=True)

# cosine distance threshold ~ 0.55 (sim 0.45). ArcFace same-identity sims are usually > 0.4.
cl = AgglomerativeClustering(n_clusters=None, distance_threshold=0.62, metric="cosine", linkage="average")
labels = cl.fit_predict(E)
print("clusters", labels.max() + 1)
from collections import Counter, defaultdict
cnt = Counter(labels)
# photos per cluster (distinct photos, excluding duplicates)
photos = defaultdict(set)
for f, l in zip(faces, labels):
    pid = f["pid"]
    if "dup_of" in idx[pid]: continue
    photos[l].add(pid)
top = sorted(photos.items(), key=lambda kv: -len(kv[1]))[:40]
for l, ps in top:
    ages = [f["age"] for f, ll in zip(faces, labels) if ll == l and f["age"] is not None]
    g = [f["gender"] for f, ll in zip(faces, labels) if ll == l and f["gender"] is not None]
    print(f"cluster {l}: {len(ps)} photos, {cnt[l]} faces, age med {np.median(ages) if ages else None:.0f} range {min(ages) if ages else None}-{max(ages) if ages else None}, female share {1-np.mean(g) if g else None:.2f}")

json.dump([dict(pid=f["pid"], fi=f["fi"], bbox=f["bbox"], size=f["size"], score=f["score"], age=f["age"], gender=f["gender"], cluster=int(l)) for f, l in zip(faces, labels)], open(f"{ROOT}/faces_clustered.json", "w"))
np.save(f"{ROOT}/face_emb.npy", E)
