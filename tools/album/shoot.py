import sys
from playwright.sync_api import sync_playwright
base = "http://localhost:3077"
pages = sys.argv[1:] or ["/mum/album", "/mum/album/wall", "/mum/album/mosaic", "/mum/album/years", "/mum/album/people", "/mum/album/moments", "/mum/album/laughing", "/mum/album/colours", "/mum/album/cameras", "/mum/album/miles"]
out = "/tmp/claude-0/-home-claude/a6fb479e-bc80-5c1b-ac3e-e2b769b91ae6/scratchpad/shots"
import os; os.makedirs(out, exist_ok=True)
with sync_playwright() as p:
    b = p.chromium.launch()
    for vp, tag in (((1280, 900), "d"), ((390, 844), "m")):
        pg = b.new_page(viewport={"width": vp[0], "height": vp[1]}, device_scale_factor=1)
        for path in pages:
            pg.goto(base + path, wait_until="networkidle", timeout=60000)
            pg.wait_for_timeout(500)
            name = path.strip("/").replace("/", "_") or "home"
            pg.screenshot(path=f"{out}/{name}-{tag}.png", full_page=False)
            errs = pg.evaluate("() => document.querySelectorAll('img').length")
            print(path, tag, "imgs", errs)
        pg.close()
    b.close()
