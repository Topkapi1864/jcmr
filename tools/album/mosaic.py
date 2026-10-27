import json, sys, os, random
import numpy as np
from PIL import Image, ImageOps

ROOT = "/home/claude/janet"
target_path = sys.argv[1]
out_prefix = sys.argv[2]
COLS, ROWS = 54, 72
TILE = 40  # px per cell in the rendered mosaic
MAX_USE = 5
BLEND = 0.22  # base tint toward the target cell colour; rises where the match is poor

idx = json.load(open(f"{ROOT}/index1.json"))
exclude = set(json.load(open(f"{ROOT}/exclude.json"))) if os.path.exists(f"{ROOT}/exclude.json") else set()
ids = [p for p in sorted(idx) if "dup_of" not in idx[p] and p not in exclude]
print("tiles", len(ids))

# tile descriptors: 3x3 mean colours (in a perceptual-ish space: scale RGB by luminance weights)
def feat(im):
    a = np.asarray(im.resize((3, 3), Image.BOX)).astype(np.float32) / 255.0
    return a.reshape(-1)
tiles = {}
tile_imgs = {}
for p in ids:
    im = Image.open(f"{ROOT}/tile/{p}.jpg").convert("RGB")
    tile_imgs[p] = im
    tiles[p] = feat(im)
T = np.stack([tiles[p] for p in ids])  # N x 27

target = Image.open(target_path).convert("RGB")
# crop to 3:4
target = ImageOps.fit(target, (COLS * 32, ROWS * 32), Image.LANCZOS, centering=(0.5, 0.45))
cells = []
for r in range(ROWS):
    for c in range(COLS):
        cell = target.crop((c * 32, r * 32, (c + 1) * 32, (r + 1) * 32))
        cells.append(feat(cell))
C = np.stack(cells)  # M x 27
mean_cell = C.reshape(len(C), 9, 3).mean(1)

# weight luminance more than chroma: convert to a space with Y emphasised
W = np.array([0.299, 0.587, 0.114] * 9, dtype=np.float32)
def cost_matrix(Ccells):
    # (M x N)
    d = (Ccells[:, None, :] - T[None, :, :]) ** 2
    return (d * (1.0 + 2.0 * W)).sum(-1)

M = len(C)
# process cells in random order, greedy with usage caps and a no-neighbour-duplicate rule
rng = random.Random(7)
order = list(range(M))
rng.shuffle(order)
use = {p: 0 for p in ids}
assign = [None] * M
costs = cost_matrix(C)
for ci in order:
    row = costs[ci]
    cand = np.argsort(row)[:240]
    r, c = divmod(ci, COLS)
    neigh = set()
    for dr in (-1, 0, 1):
        for dc in (-1, 0, 1):
            rr, cc = r + dr, c + dc
            if 0 <= rr < ROWS and 0 <= cc < COLS and assign[rr * COLS + cc]:
                neigh.add(assign[rr * COLS + cc])
    chosen = None
    for k in cand:
        p = ids[k]
        if use[p] >= MAX_USE or p in neigh:
            continue
        chosen = p
        break
    if chosen is None:
        # everything near is used up: take the least-used of the candidates that is not a neighbour
        pool = [ids[k] for k in cand if ids[k] not in neigh] or [ids[int(cand[0])]]
        chosen = min(pool, key=lambda p: use[p])
    assign[ci] = chosen
    use[chosen] += 1

# refinement: try swapping pairs to lower total cost
pos = {p: i for i, p in enumerate(ids)}
def cell_cost(ci, p):
    return float(costs[ci][pos[p]])
total = sum(cell_cost(i, assign[i]) for i in range(M))
for it in range(3):
    improved = 0
    for a in range(M):
        b = rng.randrange(M)
        pa, pb = assign[a], assign[b]
        if pa == pb: continue
        before = cell_cost(a, pa) + cell_cost(b, pb)
        after = cell_cost(a, pb) + cell_cost(b, pa)
        if after < before - 1e-6:
            assign[a], assign[b] = pb, pa
            improved += 1
    print("pass", it, "swaps", improved)

used = len(set(assign))
print("distinct tiles used", used, "of", len(ids))

# render
out = Image.new("RGB", (COLS * TILE, ROWS * TILE))
for ci, p in enumerate(assign):
    r, c = divmod(ci, COLS)
    t = tile_imgs[p].resize((TILE, TILE), Image.LANCZOS)
    col = tuple(int(v * 255) for v in mean_cell[ci])
    tint = Image.new("RGB", (TILE, TILE), col)
    tl = tiles[p].reshape(9, 3).mean(0)
    dlum = abs(float(np.dot(tl, [0.299, 0.587, 0.114]) - np.dot(mean_cell[ci], [0.299, 0.587, 0.114])))
    blend = min(0.5, 0.18 + 1.1 * dlum)
    t = Image.blend(t, tint, blend)
    out.paste(t, (c * TILE, r * TILE))
out.save(f"{out_prefix}.jpg", quality=82, optimize=True)
small = out.copy(); small.thumbnail((1200, 1600), Image.LANCZOS); small.save(f"{out_prefix}-1200.jpg", quality=80)
json.dump({"cols": COLS, "rows": ROWS, "tile": TILE, "cells": assign}, open(f"{out_prefix}.json", "w"))
print("saved", out.size, os.path.getsize(f"{out_prefix}.jpg"))
