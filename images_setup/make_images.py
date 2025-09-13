#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
make_images.py
--------------
ACGカード画像を一括ダウンロードして <root>/<out_folder> （例: images, images1）を作成します。
- 取得元URLは card_url_list.txt（1行1URL）
- 画像が存在しない場合はスキップし、スキップしたカード番号（例: ACG-011 等）を一覧表示・保存
- 進捗バー表示、再試行、同名ファイルの上書き抑止/許可
- root直下に Back.* / token.* があれば out_folder に「移動」します（--copy-assets でコピーに変更）

使い方:
  python make_images.py --root "C:/path/to/project" --out images1 --list card_url_list.txt --workers 6 --retries 2 --yes
  python make_images.py --root . --out images --list ./card_url_list.txt --overwrite --copy-assets

注意:
- ネットワークに依存します。サイト負荷に配慮し、同時接続数(--workers)は適切な値を設定してください。
- Windows の場合、PowerShell で実行すると表示が崩れることがあります。cmd か Windows Terminal 推奨。
"""

from __future__ import annotations
import argparse
import concurrent.futures
import contextlib
import hashlib
import os
import shutil
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path
from typing import Iterable, List, Optional, Tuple

# ====== デフォルト設定 ======
DEFAULT_WORKERS = 6
DEFAULT_RETRIES = 2
DEFAULT_TIMEOUT = 30
DEFAULT_UA = "Mozilla/5.0 (compatible; images-fetcher/1.0; +https://example.local)"

CONTENT_TYPE_MAP = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    # フォールバック
    "application/octet-stream": "png",
}

def guess_ext_from_content_type(ct: Optional[str]) -> str:
    if not ct:
        return "png"
    ct = ct.lower().split(";")[0].strip()
    return CONTENT_TYPE_MAP.get(ct, "png")

def extract_code_from_url(url: str) -> str:
    # 例: https://acgtcg.com/img/ACG-011 → "ACG-011"
    tail = url.strip().split("/")[-1]
    return tail or url

def read_url_list(path: Path) -> List[str]:
    text = path.read_text(encoding="utf-8")
    # 重複排除しつつ順序維持
    seen = set()
    out = []
    for line in text.splitlines():
        s = line.strip()
        if not s:
            continue
        if s in seen:
            continue
        seen.add(s)
        out.append(s)
    return out

def req(url: str, timeout: int, ua: str) -> Tuple[Optional[bytes], Optional[str]]:
    """
    Returns: (content_bytes or None, content_type or None)
    """
    headers = {"User-Agent": ua, "Accept": "image/*,*/*;q=0.8"}
    r = urllib.request.Request(url, headers=headers, method="GET")
    with contextlib.closing(urllib.request.urlopen(r, timeout=timeout)) as resp:
        # HTTPエラー時は URLError/HTTPError がraiseされる
        ct = resp.headers.get("Content-Type", None)
        data = resp.read()
        return data, ct

def atomic_write_bytes(dst: Path, data: bytes) -> None:
    tmp = dst.with_suffix(dst.suffix + ".tmp")
    with open(tmp, "wb") as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, dst)

def move_or_copy(src: Path, dst: Path, do_copy: bool) -> None:
    if not src.exists():
        return
    dst.parent.mkdir(parents=True, exist_ok=True)
    if do_copy:
        shutil.copy2(src, dst)
    else:
        # 異なるデバイス間でも動作するように copy+unlink を使用
        with contextlib.suppress(Exception):
            os.replace(src, dst)  # 同一ボリュームなら高速
            return
        shutil.copy2(src, dst)
        with contextlib.suppress(Exception):
            src.unlink()

def print_progress(done: int, total: int, width: int = 42) -> None:
    pct = 0 if total == 0 else int(done * 100 / total)
    filled = int(pct * width / 100)
    bar = "█" * filled + "-" * (width - filled)
    sys.stdout.write(f"\r[{bar}] {pct:3d}%  ({done}/{total})")
    sys.stdout.flush()

def worker_download(url: str, out_dir: Path, overwrite: bool, timeout: int, retries: int, ua: str) -> Tuple[str, bool, Optional[str]]:
    """
    1 URL のDLを担当
    Returns: (code, success, saved_name or None)
    """
    code = extract_code_from_url(url)
    # 拡張子は後で決める。既存拡張子候補も見る。
    candidates = [out_dir / f"{code}.{ext}" for ext in ("png", "jpg", "jpeg", "webp")]
    if not overwrite and any(p.exists() for p in candidates):
        # 既に存在 → スキップ成功扱い
        existing = next((p.name for p in candidates if p.exists()), None)
        return code, True, existing

    last_err = None
    for attempt in range(retries + 1):
        try:
            data, ct = req(url, timeout=timeout, ua=ua)
            if not data:
                last_err = "empty response"
                continue
            ext = guess_ext_from_content_type(ct)
            dst = out_dir / f"{code}.{ext}"
            atomic_write_bytes(dst, data)
            return code, True, dst.name
        except Exception as e:
            last_err = f"{type(e).__name__}: {e}"
            if attempt < retries:
                time.sleep(0.5 * (attempt + 1))
    return code, False, last_err

def main():
    ap = argparse.ArgumentParser(description="ACGカード画像を一括取得して <root>/<out> に保存します。")
    ap.add_argument("--root", type=str, default=".", help="index.html や card_url_list.txt があるルートフォルダ")
    ap.add_argument("--out", type=str, default="images", help="出力フォルダ名（例: images, images1）")
    ap.add_argument("--list", type=str, default=None, help="card_url_list.txt のパス（未指定なら <root>/card_url_list.txt）。見つからなければDL処理はスキップ")
    ap.add_argument("--workers", type=int, default=DEFAULT_WORKERS, help="同時ダウンロード数")
    ap.add_argument("--retries", type=int, default=DEFAULT_RETRIES, help="各URLの再試行回数")
    ap.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT, help="HTTP タイムアウト秒")
    ap.add_argument("--ua", type=str, default=DEFAULT_UA, help="User-Agent 文字列")
    ap.add_argument("--overwrite", action="store_true", help="既存ファイルを上書き保存する")
    ap.add_argument("--copy-assets", action="store_true", help="Back.*, token.* を移動ではなくコピーする")
    ap.add_argument("--yes", "-y", action="store_true", help="確認を省略して実行")
    args = ap.parse_args()

    root = Path(args.root).resolve()
    out_dir = root / args.out
    # ★ ここを先に作る：URLリストが無くても images を必ず作成
    out_dir.mkdir(parents=True, exist_ok=True)
    list_path = Path(args.list).resolve() if args.list else (root / "card_url_list.txt")
    urls = []
    if list_path.exists():
        urls = read_url_list(list_path)
    else:
        print(f"[INFO] URLリストが見つかりませんでした。ダウンロード処理はスキップします: {list_path}")
    total = len(urls)

    # 確認プロンプトはDLがあるときだけ出す（assetsだけならスキップ）
    if total > 0:
        est_size = "~180MB 程度"
        if not args.yes:
            print(f"この操作で {args.out!r} フォルダを作成し、カード画像をダウンロードします（推定 {est_size}）。")
            print(f"root: {root}")
            print(f"list: {list_path}")
            ok = input("続行しますか? [y/N]: ").strip().lower() in ("y", "yes")
            if not ok:
                print("キャンセルしました。")
                # ただし assets の移動は続行するため return しない

    if total > 0:
        print(f"[INFO] 開始: {total} 件 / 出力: {out_dir}")
    done = 0
    skipped_codes: List[str] = []
    saved_count = 0

    # Ctrl+C（中止）対応
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.workers)) as ex:
            futures = [
                ex.submit(
                    worker_download,
                    url, out_dir, args.overwrite, args.timeout, args.retries, args.ua
                )
                for url in urls
            ]
            print_progress(0, total)
            for fut in concurrent.futures.as_completed(futures):
                code, ok, info = fut.result()
                done += 1
                if not ok:
                    skipped_codes.append(code)
                else:
                    saved_count += 1
                print_progress(done, total)
    except KeyboardInterrupt:
        print("\n[WARN] 中止要求を受け取りました。以降のダウンロードをキャンセルします。")
        # 実行中のスレッドは途中で終了しない可能性がありますが、以降の結果待ちは止めます。
        # 既に書き込み中のファイルはそのまま残ります。
        # 中止後の集計は最低限に留めます。
        pass

    if total > 0:
        print("\n[INFO] 完了")
        print(f"  保存/既存: {saved_count} / スキップ: {len(skipped_codes)}")
 
    # Back.*, token.* を移動/コピー
    moved = []
    with contextlib.suppress(Exception):
        # ★ 要件: ./Back.png ./token.png を ./images/ に移動（PNG優先）
        for base, outbase in (("Back", "Back"), ("token", "token")):
            # まず PNG 固定で見る
            for ext in ("png",):
                src = root / f"{base}.{ext}"
                if src.exists():
                    dst = out_dir / f"{outbase}.{ext}"
                    move_or_copy(src, dst, args.copy_assets)
                    moved.append(dst.name)
                    break
            else:
                # PNG が無ければ従来通りの拡張子も走査（任意）
                for ext in ("jpg", "jpeg", "webp"):
                    src = root / f"{base}.{ext}"
                    if src.exists():
                        dst = out_dir / f"{outbase}.{ext}"
                        move_or_copy(src, dst, args.copy_assets)
                        moved.append(dst.name)
                        break
    if moved:
        print(f"  追加コピー/移動: {', '.join(moved)}")

    # スキップ一覧をファイルに出力（DLがあったときのみ）
    if total > 0 and skipped_codes:
        skip_txt = out_dir / "skipped_codes.txt"
        skip_txt.write_text("\n".join(skipped_codes), encoding="utf-8")
        print(f"  スキップ一覧: {skip_txt}")

    print("[DONE]")

if __name__ == "__main__":
    main()
