#!/usr/bin/env python3
"""Generate Xiaohongshu carousel images (1080x1440, 3:4). No AI — PIL + brand colors."""

from __future__ import annotations

import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "xiaohongshu" / "2026-06-26" / "images"
W, H = 1080, 1440

GREEN = "#2FBE77"
GREEN_DEEP = "#159E63"
GREEN_INK = "#0C7A4B"
MINT = "#EAFBF2"
INK = "#15211B"
INK2 = "#52605a"
INK3 = "#8a988f"
WHITE = "#ffffff"
RED = "#e85d5d"
AMBER = "#f5a623"


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/STHeiti Medium.ttc",
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
        "/Library/Fonts/Arial Unicode.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                index = 1 if bold and "PingFang" in path else 0
                return ImageFont.truetype(path, size, index=index)
            except OSError:
                try:
                    return ImageFont.truetype(path, size)
                except OSError:
                    continue
    return ImageFont.load_default()


def wrap_text(draw: ImageDraw.ImageDraw, text: str, font, max_width: int) -> list[str]:
    lines: list[str] = []
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


def draw_lines(
    draw: ImageDraw.ImageDraw,
    lines: list[str],
    x: int,
    y: int,
    font,
    fill: str,
    line_gap: int = 16,
) -> int:
    for line in lines:
        draw.text((x, y), line, font=font, fill=fill)
        bbox = draw.textbbox((x, y), line, font=font)
        y += (bbox[3] - bbox[1]) + line_gap
    return y


def rounded_rect(draw, xy, radius, fill, outline=None):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline)


def brand_header(draw, title: str, subtitle: str = "书漂漂 · 童书绘本漂流"):
    font_sub = load_font(28)
    font_title = load_font(52, bold=True)
    draw.text((80, 72), subtitle, font=font_sub, fill=GREEN_DEEP)
    lines = wrap_text(draw, title, font_title, W - 160)
    draw_lines(draw, lines, 80, 130, font_title, INK, 12)


def slide_cover() -> Image.Image:
    img = Image.new("RGB", (W, H), MINT)
    draw = ImageDraw.Draw(img)
    rounded_rect(draw, (60, 60, W - 60, H - 60), 48, WHITE)

    font_huge = load_font(88, bold=True)
    font_body = load_font(40)
    font_tag = load_font(32)

    draw.text((100, 180), "3岁娃的书架", font=font_huge, fill=INK)
    draw.text((100, 290), "已经爆了 📚", font=font_huge, fill=GREEN_INK)

    body = "绘本买一本五六十\n翻三遍就不看了\n扔舍不得 · 送不知道送给谁"
    draw_lines(draw, wrap_text(draw, body, font_body, W - 200), 100, 480, font_body, INK2, 20)

    rounded_rect(draw, (100, 780, W - 100, 900), 24, MINT)
    draw.text((130, 820), "我的解法 → 图书漂流", font=load_font(36, bold=True), fill=GREEN_DEEP)

    draw.text((100, 980), "滑动看下一张 👉", font=font_tag, fill=INK3)

    # decorative book spines
    colors = [GREEN, GREEN_DEEP, "#7BE2A8", GREEN_INK, AMBER]
    for i, c in enumerate(colors):
        x = 100 + i * 56
        rounded_rect(draw, (x, 1080, x + 44, 1280), 8, c)

    draw.text((100, 1320), "@书漂漂", font=font_tag, fill=INK3)
    return img


def slide_pain() -> Image.Image:
    img = Image.new("RGB", (W, H), WHITE)
    draw = ImageDraw.Draw(img)
    brand_header(draw, "同款痛点？")
    font_item = load_font(38)
    items = [
        ("📚", "书架两层满了还在买"),
        ("💸", "绘本 58、68 翻三遍吃灰"),
        ("😣", "扔舍不得 挂二手太麻烦"),
        ("🤷", "想送人不知道送给谁"),
    ]
    y = 320
    for emoji, text in items:
        rounded_rect(draw, (80, y, W - 80, y + 120), 28, MINT)
        draw.text((110, y + 36), emoji, font=load_font(44))
        draw.text((190, y + 40), text, font=font_item, fill=INK)
        y += 150
    draw.text((80, y + 40), "如果你也中枪 → 继续滑", font=load_font(32), fill=GREEN_DEEP)
    return img


def slide_tried() -> Image.Image:
    img = Image.new("RGB", (W, H), WHITE)
    draw = ImageDraw.Draw(img)
    brand_header(draw, "我试过的方法")

    rows = [
        ("❌", "挂二手平台", "聊天砍价太费妈", RED, "#fdeaea"),
        ("❌", "送给亲戚", "尺寸年龄不一定合适", RED, "#fdeaea"),
        ("✅", "图书漂流", "童书送给需要的小朋友", GREEN_DEEP, MINT),
    ]
    y = 300
    font_t = load_font(40, bold=True)
    font_d = load_font(30)
    for mark, title, desc, color, bg in rows:
        rounded_rect(draw, (80, y, W - 80, y + 180), 28, bg)
        draw.text((110, y + 30), mark, font=load_font(48))
        draw.text((190, y + 28), title, font=font_t, fill=color)
        draw.text((190, y + 90), desc, font=font_d, fill=INK2)
        y += 210

    draw.text((80, y + 20), "不是卖书 · 是让书继续被读", font=load_font(34), fill=INK3)
    return img


def slide_app_pool() -> Image.Image:
    """Mini-program style mock — matches 书漂漂 pool page layout."""
    img = Image.new("RGB", (W, H), "#f4f8f5")
    draw = ImageDraw.Draw(img)

    # phone frame
    rounded_rect(draw, (140, 100, W - 140, H - 100), 40, WHITE, outline="#e7eee9")

    # status bar area
    draw.text((180, 130), "漂流广场", font=load_font(44, bold=True), fill=INK)
    draw.text((180, 195), "登录后查看可用公益积分", font=load_font(24), fill=INK3)
    draw.text((680, 200), "获得积分", font=load_font(24), fill=GREEN)

    # search
    rounded_rect(draw, (180, 250, W - 180, 320), 20, "#f0f3f1")
    draw.text((210, 268), "搜索书名 · 作者 · ISBN", font=load_font(26), fill=INK3)

    # tabs
    tabs = [("推荐", True), ("最新", False), ("附近", False)]
    tx = 180
    for label, active in tabs:
        color = GREEN if active else INK3
        draw.text((tx, 350), label, font=load_font(28, bold=active), fill=color)
        if active:
            draw.rectangle((tx, 390, tx + 56, 396), fill=GREEN)
        tx += 120

    # book cards (2x2)
    books = [
        ("好饿的毛毛虫", "3 公益积分", "绘本", "#ffd93d"),
        ("猜猜我有多爱你", "3 公益积分", "绘本", "#ff9eb5"),
        ("大卫，不可以", "4 公益积分", "绘本", "#6ecbff"),
        ("彩虹色的花", "3 公益积分", "绘本", "#b8f4c8"),
    ]
    positions = [(180, 430), (560, 430), (180, 780), (560, 780)]
    card_w, card_h = 340, 320
    font_title = load_font(26, bold=True)
    font_meta = load_font(22)
    for (title, coin, cat, cover_color), (x, y) in zip(books, positions):
        rounded_rect(draw, (x, y, x + card_w, y + card_h), 20, WHITE, outline="#e7eee9")
        rounded_rect(draw, (x + 20, y + 20, x + 120, y + 160), 12, cover_color)
        draw.text((x + 20, y + 175), title, font=font_title, fill=INK)
        draw.text((x + 20, y + 215), coin, font=font_meta, fill=GREEN)
        rounded_rect(draw, (x + 20, y + 250, x + 90, y + 285), 8, "#f0f3f1")
        draw.text((x + 32, y + 256), cat, font=load_font(20), fill=INK2)
        rounded_rect(draw, (x + 20, y + 295, x + card_w - 20, y + 335), 16, GREEN)
        draw.text((x + 100, y + 305), "申请接漂", font=load_font(24, bold=True), fill=WHITE)

    # bottom tab bar hint
    rounded_rect(draw, (180, H - 200, W - 180, H - 140), 16, MINT)
    draw.text((320, H - 185), "＋ 上漂赠书", font=load_font(28, bold=True), fill=GREEN_DEEP)

    # caption outside phone
    draw.text((140, 40), "书漂漂小程序 · 漂流广场", font=load_font(30, bold=True), fill=GREEN_INK)
    draw.text((140, H - 70), "童书绘本免费接漂 · 邮费到付", font=load_font(28), fill=INK2)
    return img


def slide_steps() -> Image.Image:
    img = Image.new("RGB", (W, H), MINT)
    draw = ImageDraw.Draw(img)
    rounded_rect(draw, (60, 60, W - 60, H - 60), 48, WHITE)
    brand_header(draw, "图书漂流 3 步")

    steps = [
        ("01", "闲置童书「上漂」", "送给需要的小朋友"),
        ("02", "漂流广场「接漂」", "免费申请别人漂出的绘本"),
        ("03", "邮费到付", "赠书方寄出 接漂方付运费"),
    ]
    y = 320
    for num, title, desc in steps:
        rounded_rect(draw, (100, y, W - 100, y + 200), 28, MINT)
        draw.text((130, y + 30), num, font=load_font(56, bold=True), fill=GREEN)
        draw.text((230, y + 40), title, font=load_font(38, bold=True), fill=INK)
        draw.text((230, y + 110), desc, font=load_font(30), fill=INK2)
        y += 230
    draw.text((100, y + 30), "公益积分 = 站内流转工具 不可提现", font=load_font(28), fill=INK3)
    return img


def slide_cta() -> Image.Image:
    img = Image.new("RGB", (W, H), GREEN)
    draw = ImageDraw.Draw(img)
    rounded_rect(draw, (80, 120, W - 80, H - 120), 48, WHITE)

    draw.text((120, 200), "想试试？", font=load_font(72, bold=True), fill=INK)
    draw.text((120, 310), "更多整理在主页置顶", font=load_font(40), fill=INK2)

    rounded_rect(draw, (120, 420, W - 120, 560), 32, MINT)
    draw.text((180, 470), "评论区可以问我", font=load_font(48, bold=True), fill=GREEN_INK)

    hints = [
        "接漂邮费到付 · 看清品相",
        "公益积分不可提现",
        "不是卖书 · 是让书流动",
    ]
    y = 620
    font = load_font(36)
    for h in hints:
        draw.text((140, y), h, font=font, fill=INK)
        y += 70

    draw.text((140, 920), "小红书不放二维码哦", font=load_font(30), fill=INK3)
    draw.text((140, 980), "评论区聊聊你们怎么处理闲置绘本👇", font=load_font(32), fill=GREEN_DEEP)
    return img


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    slides = [
        ("01-cover.png", slide_cover),
        ("02-pain.png", slide_pain),
        ("03-tried.png", slide_tried),
        ("04-app-pool.png", slide_app_pool),
        ("05-steps.png", slide_steps),
        ("06-cta.png", slide_cta),
    ]
    for name, fn in slides:
        path = OUT / name
        fn().save(path, "PNG", optimize=True)
        print(f"wrote {path}")


if __name__ == "__main__":
    main()
