#!/usr/bin/env python3
# pip: none required (標準ライブラリ)
import os, subprocess, shutil
from concurrent.futures import ThreadPoolExecutor, as_completed

INDIR = "./images"
OUTDIR = "./images_webp"
QUALITY = 20
MAX_WORKERS = 6  # CPUコアに合わせて調整

if shutil.which("cwebp") is None:
    raise SystemExit("cwebp が見つかりません。インストールして PATH に追加してください。")

os.makedirs(OUTDIR, exist_ok=True)

def convert(src):
    base = os.path.basename(src)
    name, _ = os.path.splitext(base)
    out = os.path.join(OUTDIR, name + ".webp")
    cmd = ["cwebp", "-q", str(QUALITY), "-m", "6", "-mt", "-metadata", "none", src, "-o", out]
    try:
        subprocess.check_call(cmd)
        return (src, out, None)
    except subprocess.CalledProcessError as e:
        return (src, out, e)

# collect all png files (non-recursive). For recursive, use os.walk.
files = [os.path.join(INDIR, f) for f in os.listdir(INDIR) if f.lower().endswith(".png")]

with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
    futures = {ex.submit(convert, f): f for f in files}
    for fut in as_completed(futures):
        src = futures[fut]
        src, out, err = fut.result()
        if err:
            print("FAILED:", src, err)
        else:
            print("OK:", src, "->", out)

print("All tasks submitted.")
