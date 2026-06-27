#!/usr/bin/env python3
"""Composite pool HTML screenshot into WeChat 贴图 slide (1080x1440)."""

from pathlib import Path
import os

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "wechat/2026-06-26/images/04-app-pool-screenshot-raw.png"
OUT = ROOT / "wechat/2026-06-26/images/04-app-pool.png"
W, H = 1080, 1440


def load_font(size, bold=False):
    for path in ["/System/Library/Fonts/PingFang.ttc", "/System/Library/Fonts/STHeiti Medium.ttc"]:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size, index=1 if bold else 0)
            except OSError:
                return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def main():
    if not RAW.exists():
        raise SystemExit(f"missing {RAW}, run playwright screenshot first")
    raw = Image.open(RAW)
    canvas = Image.new("RGB", (W, H), "#f4f8f5")
    draw = ImageDraw.Draw(canvas)
    draw.text((80, 56), "打开小程序 · 漂流广场", font=load_font(40, True), fill="#0C7A4B")
    draw.text((80, 110), "未登录也可浏览，申请接漂需登录", font=load_font(28), fill="#8a988f")

    scale = min((W - 120) / raw.width, (H - 260) / raw.height)
    nw, nh = int(raw.width * scale), int(raw.height * scale)
    resized = raw.resize((nw, nh), Image.Resampling.LANCZOS)
    x, y = (W - nw) // 2, 160
    draw.rounded_rectangle((x - 6, y - 6, x + nw + 6, y + nh + 6), radius=32, outline="#e7eee9", width=3)
    canvas.paste(resized, (x, y))
    draw.text((80, H - 64), "童书绘本免费接漂 · 邮费到付", font=load_font(30), fill="#52605a")
    canvas.save(OUT, "PNG", optimize=True)
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
