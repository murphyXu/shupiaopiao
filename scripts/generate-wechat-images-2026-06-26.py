#!/usr/bin/env python3
"""Generate WeChat Official Account 贴图 images (1080x1440). PIL only, no AI."""

from __future__ import annotations

import os
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "wechat" / "2026-06-26" / "images"
W, H = 1080, 1440
COVER_W, COVER_H = 900, 383

GREEN = "#2FBE77"
GREEN_DEEP = "#159E63"
GREEN_INK = "#0C7A4B"
MINT = "#EAFBF2"
INK = "#15211B"
INK2 = "#52605a"
INK3 = "#8a988f"
WHITE = "#ffffff"


def load_font(size: int, bold: bool = False):
    for path in [
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/STHeiti Medium.ttc",
    ]:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size, index=1 if bold else 0)
            except OSError:
                return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def wrap_text(draw, text, font, max_width):
    lines = []
    for paragraph in text.split("\n"):
        if not paragraph:
            lines.append("")
            continue
        current = ""
        for ch in paragraph:
            test = current + ch
            if draw.textlength(test, font=font) <= max_width:
                current = test
            else:
                if current:
                    lines.append(current)
                current = ch
        if current:
            lines.append(current)
    return lines


def draw_lines(draw, lines, x, y, font, fill, gap=16):
    for line in lines:
        draw.text((x, y), line, font=font, fill=fill)
        bbox = draw.textbbox((x, y), line, font=font)
        y += (bbox[3] - bbox[1]) + gap
    return y


def rr(draw, xy, radius, fill, outline=None):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline)


def slide_01_cover():
    img = Image.new("RGB", (W, H), GREEN)
    draw = ImageDraw.Draw(img)
    rr(draw, (60, 80, W - 60, H - 80), 48, WHITE)
    draw.text((100, 200), "书漂漂", font=load_font(96, True), fill=GREEN_INK)
    draw_lines(
        draw,
        wrap_text(draw, "让孩子读过的童书\n漂给下一个需要的小朋友", load_font(44, True), W - 200),
        100, 340, load_font(44, True), INK, 12,
    )
    draw.text((100, 560), "童书绘本 · 图书漂流 · 邮费到付", font=load_font(32), fill=INK2)
    rr(draw, (100, 680, W - 100, 780), 24, MINT)
    draw.text((130, 715), "滑动看下一张 👉", font=load_font(34), fill=GREEN_DEEP)
    colors = [GREEN, GREEN_DEEP, "#7BE2A8", GREEN_INK]
    for i, c in enumerate(colors):
        rr(draw, (100 + i * 60, 900, 140 + i * 60, 1100), 8, c)
    draw.text((100, 1200), "书漂漂 · 首发", font=load_font(28), fill=INK3)
    return img


def slide_02_pain():
    img = Image.new("RGB", (W, H), WHITE)
    draw = ImageDraw.Draw(img)
    draw.text((80, 80), "书漂漂", font=load_font(28), fill=GREEN_DEEP)
    draw.text((80, 130), "你有没有这种困扰？", font=load_font(52, True), fill=INK)
    items = [
        "绘本买一本五六十，翻三遍就不看了",
        "书架越堆越高，扔舍不得",
        "挂二手太麻烦，送人不知道送给谁",
    ]
    y = 280
    for t in items:
        rr(draw, (80, y, W - 80, y + 130), 28, MINT)
        draw.text((110, y + 42), "· " + t, font=load_font(34), fill=INK)
        y += 160
    draw.text((80, y + 40), "如果也有同感，继续往下看", font=load_font(32), fill=GREEN_DEEP)
    return img


def slide_03_what():
    img = Image.new("RGB", (W, H), MINT)
    draw = ImageDraw.Draw(img)
    rr(draw, (60, 60, W - 60, H - 60), 48, WHITE)
    draw.text((100, 120), "书漂漂是什么？", font=load_font(52, True), fill=INK)
    rows = [
        ("📚", "专注童书绘本的图书漂流"),
        ("🎁", "闲置童书可「上漂」送给需要的孩子"),
        ("📖", "漂流广场可「接漂」免费申请童书"),
    ]
    y = 260
    for emoji, text in rows:
        rr(draw, (100, y, W - 100, y + 160), 28, MINT)
        draw.text((130, y + 40), emoji, font=load_font(48))
        draw_lines(draw, wrap_text(draw, text, load_font(36, True), W - 280), 220, y + 50, load_font(36, True), INK, 8)
        y += 190
    rr(draw, (100, y + 20, W - 100, y + 120), 20, "#f0f3f1")
    draw.text((130, y + 52), "不是卖书，是让书在小朋友之间流转", font=load_font(30), fill=INK2)
    return img


def slide_04_steps():
    img = Image.new("RGB", (W, H), WHITE)
    draw = ImageDraw.Draw(img)
    draw.text((80, 80), "3 步就能开始", font=load_font(52, True), fill=INK)
    steps = [
        ("01", "加书到书架", "扫码 ISBN 或手动添加"),
        ("02", "发起上漂", "填写品相，提交审核"),
        ("03", "接漂或等待", "广场接书，或等别人接走你漂出的书"),
    ]
    y = 220
    for num, title, desc in steps:
        rr(draw, (80, y, W - 80, y + 200), 28, MINT)
        draw.text((110, y + 30), num, font=load_font(56, True), fill=GREEN)
        draw.text((220, y + 40), title, font=load_font(38, True), fill=INK)
        draw.text((220, y + 110), desc, font=load_font(30), fill=INK2)
        y += 230
    draw.text((80, y + 30), "接漂邮费到付 · 赠书方负责寄出", font=load_font(30), fill=INK3)
    return img


def slide_05_points():
    img = Image.new("RGB", (W, H), WHITE)
    draw = ImageDraw.Draw(img)
    draw.text((80, 80), "关于公益积分", font=load_font(52, True), fill=INK)
    lines = [
        "公益积分是站内流转工具",
        "接漂时会先占用相应积分",
        "完成赠书后可获得流转积分",
        "1 积分可兑换 10 本书架收藏额度",
    ]
    y = 240
    for line in lines:
        rr(draw, (80, y, W - 80, y + 100), 24, MINT)
        draw.text((110, y + 32), "✓ " + line, font=load_font(32), fill=INK)
        y += 120
    rr(draw, (80, y + 40, W - 80, y + 200), 24, "#fff8e6")
    draw_lines(
        draw,
        wrap_text(draw, "重要：公益积分不可提现、不可转让或交易，不具备现金属性。", load_font(32, True), W - 200),
        110, y + 80, load_font(32, True), GREEN_INK, 10,
    )
    return img


def slide_06_why():
    img = Image.new("RGB", (W, H), MINT)
    draw = ImageDraw.Draw(img)
    rr(draw, (60, 120, W - 60, H - 120), 48, WHITE)
    draw.text((100, 180), "为什么做这件事？", font=load_font(48, True), fill=INK)
    body = "好绘本值得被多读几次。\n\n每多漂出一本书，就少一本被闲置在角落；每多接漂一本书，就少买一本重复的新书。"
    draw_lines(draw, wrap_text(draw, body, load_font(36), W - 200), 100, 300, load_font(36), INK2, 20)
    draw.text((100, 620), "环保 · 共享 · 让好书流动", font=load_font(34, True), fill=GREEN_DEEP)
    return img


def slide_07_cta():
    img = Image.new("RGB", (W, H), GREEN)
    draw = ImageDraw.Draw(img)
    rr(draw, (80, 160, W - 80, H - 160), 48, WHITE)
    draw.text((120, 240), "现在就开始", font=load_font(64, True), fill=INK)
    draw.text((120, 340), "打开小程序「书漂漂」", font=load_font(40), fill=INK2)
    rr(draw, (120, 440, W - 120, 560), 32, MINT)
    draw.text((160, 490), "漂流 → 看看广场有什么书", font=load_font(36, True), fill=GREEN_INK)
    hints = ["点击本贴下方小程序卡片", "或点菜单「开始漂流」", "先做第一个赠书人也很好"]
    y = 620
    for h in hints:
        draw.text((140, y), "→ " + h, font=load_font(34), fill=INK)
        y += 64
    draw.text((140, 900), "书漂漂 · 童书绘本漂流", font=load_font(28), fill=INK3)
    return img


def cover_horizontal():
    """900×383 备用：订阅号图文封面 / 转发缩略图."""
    img = Image.new("RGB", (COVER_W, COVER_H), GREEN)
    draw = ImageDraw.Draw(img)
    draw.text((48, 80), "书漂漂", font=load_font(72, True), fill=WHITE)
    draw.text((48, 180), "童书绘本漂流平台", font=load_font(36), fill=MINT)
    draw.text((48, 260), "闲置上漂 · 广场接漂 · 邮费到付", font=load_font(28), fill=WHITE)
    return img


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    slides = [
        ("01-cover.png", slide_01_cover),
        ("02-pain.png", slide_02_pain),
        ("03-what.png", slide_03_what),
        ("04-app-pool.png", None),  # generated separately
        ("05-steps.png", slide_04_steps),
        ("06-points.png", slide_05_points),
        ("07-why.png", slide_06_why),
        ("08-cta.png", slide_07_cta),
    ]
    for name, fn in slides:
        if fn is None:
            continue
        p = OUT / name
        fn().save(p, "PNG", optimize=True)
        print(f"wrote {p}")

    cover = OUT / "00-cover-thumb.jpg"
    cover_horizontal().save(cover, "JPEG", quality=90, optimize=True)
    print(f"wrote {cover}")

    html_src = ROOT / "xiaohongshu/2026-06-26/images/04-app-pool.html"
    html_dst = OUT / "04-app-pool.html"
    if html_src.exists():
        shutil.copy2(html_src, html_dst)
        print(f"copied {html_dst}")


if __name__ == "__main__":
    main()
