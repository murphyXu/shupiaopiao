#!/usr/bin/env python3
"""Composite browser screenshot into Xiaohongshu 1080x1440 slide."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
import os

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "xiaohongshu/2026-06-26/images/04-app-pool-screenshot-raw.png"
OUT = ROOT / "xiaohongshu/2026-06-26/images/04-app-pool.png"
W, H = 1080, 1440


def load_font(size: int, bold: bool = False):
    for path in ["/System/Library/Fonts/PingFang.ttc", "/System/Library/Fonts/STHeiti Medium.ttc"]:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size, index=1 if bold else 0)
            except OSError:
                return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def main():
    raw = Image.open(RAW)
    canvas = Image.new("RGB", (W, H), "#f4f8f5")
    draw = ImageDraw.Draw(canvas)
    draw.text((80, 48), "书漂漂小程序 · 漂流广场", font=load_font(34, True), fill="#0C7A4B")

    scale = min((W - 160) / raw.width, (H - 280) / raw.height)
    nw, nh = int(raw.width * scale), int(raw.height * scale)
    resized = raw.resize((nw, nh), Image.Resampling.LANCZOS)
    x, y = (W - nw) // 2, 120
    draw.rounded_rectangle((x - 8, y - 8, x + nw + 8, y + nh + 8), radius=36, outline="#e7eee9", width=3)
    canvas.paste(resized, (x, y))
    draw.text((80, H - 72), "童书绘本免费接漂 · 邮费到付", font=load_font(30), fill="#52605a")
    canvas.save(OUT, "PNG", optimize=True)
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
