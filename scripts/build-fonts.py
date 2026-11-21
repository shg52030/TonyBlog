#!/usr/bin/env python3
"""
生成站内使用的思源黑体（Noto Sans SC）子集字体。

用法：npm run font:build

流程：
  1. 扫描 src 下所有文件，收集实际用到的字符（中文 + 拉丁 + 标点）
  2. 从 jsDelivr 下载可变字体源文件（缓存在 .cache/fonts/，只下一次）
  3. 按 300 / 400 / 700 三个字重实例化
  4. 裁剪成子集：
       public/fonts/noto-sans-sc-{300,400,700}.woff2  —— 网页用，单字重约 100KB
       src/assets/fonts/noto-sans-sc-og-{400,700}.ttf —— OG 图用（satori 不认 woff2）
  5. 把覆盖到的字符写入 scripts/font-coverage.json，供 npm run font:check 对比

依赖：Python 3.9+、fonttools、brotli（pip install fonttools brotli）
"""

from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
CACHE = ROOT / ".cache" / "fonts"
VF_URL = "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf"
VF_PATH = CACHE / "NotoSansSC-VF.ttf"

SCAN_EXTS = {".md", ".mdx", ".astro", ".ts", ".tsx", ".js", ".mjs", ".css", ".json", ".txt"}
WEIGHTS = (300, 400, 700)
OG_WEIGHTS = (400, 700)

# 额外保底字符：中英文标点、排版符号，避免正文用了却没打包
EXTRA = "　、。，．·；：？！…—～《》〈〉「」『』【】（）〔〕“”‘’￥％＃＠＆＊＋－／＝＼｜＜＞"


def collect_chars() -> str:
    chars: set[str] = set()
    # src 下的页面/文章，加上根目录的配置文件（站点标题、描述也含中文）
    candidates = [p for p in SRC.rglob("*") if p.is_file()]
    candidates += [p for p in ROOT.glob("*.ts") if p.is_file()]
    candidates += [p for p in ROOT.glob("*.json") if p.is_file()]
    for path in candidates:
        if path.suffix.lower() not in SCAN_EXTS:
            continue
        try:
            chars.update(path.read_text(encoding="utf-8"))
        except (UnicodeDecodeError, OSError):
            continue
    chars.update(chr(i) for i in range(0x20, 0x7F))
    chars.update(EXTRA)
    chars.discard("\n")
    chars.discard("\r")
    chars.discard("\t")
    return "".join(sorted(chars))


def ensure_source() -> None:
    if VF_PATH.exists() and VF_PATH.stat().st_size > 1_000_000:
        print(f"· 复用缓存字体 {VF_PATH.relative_to(ROOT)}")
        return
    CACHE.mkdir(parents=True, exist_ok=True)
    print("· 下载 Noto Sans SC 可变字体（约 17MB，仅首次）…")
    urllib.request.urlretrieve(VF_URL, VF_PATH)


def build(text_file: Path) -> None:
    from fontTools.subset import main as subset_main
    from fontTools.ttLib import TTFont
    from fontTools.varLib.instancer import instantiateVariableFont

    web_dir = ROOT / "public" / "fonts"
    og_dir = ROOT / "src" / "assets" / "fonts"
    web_dir.mkdir(parents=True, exist_ok=True)
    og_dir.mkdir(parents=True, exist_ok=True)

    for weight in WEIGHTS:
        static_path = CACHE / f"static-{weight}.ttf"
        print(f"· 实例化 wght={weight}")
        font = TTFont(VF_PATH)
        instantiateVariableFont(font, {"wght": weight}, inplace=True)
        font.save(static_path)

        web_out = web_dir / f"noto-sans-sc-{weight}.woff2"
        subset_main(
            [
                str(static_path),
                f"--text-file={text_file}",
                "--flavor=woff2",
                "--layout-features=kern,liga",
                "--name-IDs=",
                f"--output-file={web_out}",
            ]
        )
        print(f"  → public/fonts/{web_out.name}  {web_out.stat().st_size // 1024} KB")

        if weight in OG_WEIGHTS:
            og_out = og_dir / f"noto-sans-sc-og-{weight}.ttf"
            subset_main(
                [
                    str(static_path),
                    f"--text-file={text_file}",
                    "--layout-features=kern,liga",
                    "--name-IDs=",
                    f"--output-file={og_out}",
                ]
            )
            print(f"  → src/assets/fonts/{og_out.name}  {og_out.stat().st_size // 1024} KB")


def main() -> int:
    try:
        import fontTools  # noqa: F401
    except ImportError:
        print("缺少 fonttools，请先执行：pip install fonttools brotli", file=sys.stderr)
        return 1

    chars = collect_chars()
    cjk = sum(1 for c in chars if "\u4e00" <= c <= "\u9fff")
    print(f"· 扫描到 {len(chars)} 个字符（其中汉字 {cjk} 个）")

    ensure_source()

    tmp = CACHE / "chars.txt"
    CACHE.mkdir(parents=True, exist_ok=True)
    tmp.write_text(chars, encoding="utf-8")

    build(tmp)

    coverage = ROOT / "scripts" / "font-coverage.json"
    coverage.write_text(json.dumps({"chars": chars}, ensure_ascii=False, indent=0), encoding="utf-8")
    print(f"· 字符清单已写入 {coverage.relative_to(ROOT)}")
    print("完成。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
