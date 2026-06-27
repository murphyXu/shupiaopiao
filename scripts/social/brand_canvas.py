# -*- coding: utf-8 -*-
"""Shared PIL canvas helpers for social images. No AI — flat brand design only."""

from __future__ import annotations

import os
from typing import Iterable

from PIL import Image, ImageDraw, ImageFont

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
PAGE_BG = "#f4f8f5"


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


def wrap_text(draw, text: str, font, max_width: int) -> list[str]:
    lines: list[str] = []
    for paragraph in text.split("\n"):
        if not paragraph:
            lines.append("")
            continue
        cur = ""
        for ch in paragraph:
            test = cur + ch
            if draw.textlength(test, font=font) <= max_width:
                cur = test
            else:
                if cur:
                    lines.append(cur)
                cur = ch
        if cur:
            lines.append(cur)
    return lines


def draw_lines(draw, lines: Iterable[str], x: int, y: int, font, fill: str, gap: int = 16) -> int:
    for line in lines:
        draw.text((x, y), line, font=font, fill=fill)
        bbox = draw.textbbox((x, y), line, font=font)
        y += (bbox[3] - bbox[1]) + gap
    return y


def rr(draw, xy, radius=28, fill=WHITE, outline=None):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline)


def new_canvas(bg=MINT):
    return Image.new("RGB", (W, H), bg), ImageDraw.Draw(Image.new("RGB", (W, H), bg))


def canvas(bg=MINT):
    img = Image.new("RGB", (W, H), bg)
    return img, ImageDraw.Draw(img)


def header(draw, title: str, sub: str = "书漂漂 · 童书绘本"):
    draw.text((80, 72), sub, font=load_font(28), fill=GREEN_DEEP)
    draw_lines(draw, wrap_text(draw, title, load_font(52, True), W - 160), 80, 130, load_font(52, True), INK, 10)


def slide_cover(title_lines: list[str], subtitle: str = "", footer: str = "滑动看下一张 👉") -> Image.Image:
    img, draw = canvas(MINT)
    rr(draw, (60, 60, W - 60, H - 60), 48, WHITE)
    y = 180
    for i, line in enumerate(title_lines):
        draw.text((100, y), line, font=load_font(72 if i == 0 else 64, True), fill=GREEN_INK if i else INK)
        y += 100
    if subtitle:
        draw_lines(draw, wrap_text(draw, subtitle, load_font(36), W - 200), 100, y + 20, load_font(36), INK2, 14)
    rr(draw, (100, H - 360, W - 100, H - 260), 24, MINT)
    draw.text((130, H - 320), footer, font=load_font(34), fill=GREEN_DEEP)
    for i, c in enumerate([GREEN, GREEN_DEEP, "#7BE2A8", GREEN_INK]):
        rr(draw, (100 + i * 58, H - 220, 148 + i * 58, H - 80), 8, c)
    return img


def slide_bullets(title: str, items: list[str], footer: str = "") -> Image.Image:
    img, draw = canvas(WHITE)
    header(draw, title)
    y = 300
    for t in items:
        rr(draw, (80, y, W - 80, y + 110), 24, MINT)
        draw.text((110, y + 34), "· " + t, font=load_font(34), fill=INK)
        y += 130
    if footer:
        draw.text((80, y + 20), footer, font=load_font(30), fill=GREEN_DEEP)
    return img


def slide_compare(title: str, rows: list[tuple[str, str, str, str, str]]) -> Image.Image:
    img, draw = canvas(WHITE)
    header(draw, title)
    y = 280
    for mark, t, d, color, bg in rows:
        rr(draw, (80, y, W - 80, y + 150), 24, bg)
        draw.text((110, y + 24), mark, font=load_font(44))
        draw.text((180, y + 28), t, font=load_font(36, True), fill=color)
        draw.text((180, y + 88), d, font=load_font(28), fill=INK2)
        y += 170
    return img


def slide_steps(title: str, steps: list[tuple[str, str, str]]) -> Image.Image:
    img, draw = canvas(WHITE)
    header(draw, title)
    y = 260
    for num, t, d in steps:
        rr(draw, (80, y, W - 80, y + 180), 24, MINT)
        draw.text((110, y + 28), num, font=load_font(52, True), fill=GREEN)
        draw.text((210, y + 36), t, font=load_font(36, True), fill=INK)
        draw.text((210, y + 100), d, font=load_font(28), fill=INK2)
        y += 200
    return img


def slide_books(title: str, books: list[tuple[str, str]]) -> Image.Image:
    img, draw = canvas(MINT)
    rr(draw, (60, 60, W - 60, H - 60), 40, WHITE)
    draw.text((100, 100), title, font=load_font(48, True), fill=INK)
    colors = ["#ffd93d", "#ff9eb5", "#6ecbff", "#b8f4c8", "#e8d5ff"]
    y = 220
    for i, (age, name) in enumerate(books):
        c = colors[i % len(colors)]
        rr(draw, (100, y, 200, y + 100), 12, c)
        draw.text((230, y + 12), age, font=load_font(26), fill=INK3)
        draw.text((230, y + 48), name, font=load_font(34, True), fill=INK)
        y += 130
    return img


def slide_cta_xhs(title: str = "有问题评论区问我", lines: list[str] | None = None) -> Image.Image:
    img, draw = canvas(GREEN)
    rr(draw, (80, 140, W - 80, H - 140), 40, WHITE)
    draw.text((120, 220), title, font=load_font(56, True), fill=INK)
    lines = lines or [
        "主页置顶有整理汇总",
        "接漂邮费到付 · 看清品相",
        "公益积分不可提现",
    ]
    y = 360
    for line in lines:
        draw.text((140, y), "→ " + line, font=load_font(34), fill=INK2)
        y += 72
    draw.text((140, H - 280), "你们家闲置绘本怎么处理？👇", font=load_font(32), fill=GREEN_DEEP)
    return img


def slide_cta_wechat() -> Image.Image:
    img, draw = canvas(GREEN)
    rr(draw, (80, 140, W - 80, H - 140), 40, WHITE)
    draw.text((120, 220), "点击小程序卡片", font=load_font(52, True), fill=INK)
    draw.text((120, 310), "打开书漂漂 · 漂流广场", font=load_font(38), fill=INK2)
    rr(draw, (120, 400, W - 120, 500), 24, MINT)
    draw.text((160, 430), "菜单「开始漂流」也可进入", font=load_font(32), fill=GREEN_INK)
    return img


def slide_note(title: str, body: str, warn: str = "") -> Image.Image:
    img, draw = canvas(WHITE)
    header(draw, title)
    draw_lines(draw, wrap_text(draw, body, load_font(34), W - 160), 80, 300, load_font(34), INK2, 18)
    if warn:
        rr(draw, (80, H - 280, W - 80, H - 160), 20, "#fff8e6")
        draw_lines(draw, wrap_text(draw, warn, load_font(30, True), W - 200), 110, H - 250, load_font(30, True), GREEN_INK, 10)
    return img


def slide_photo_placeholder(title: str, hint: str, steps: list[str]) -> Image.Image:
    """Marks slot for real user photo — dashed frame + instructions on-image."""
    img, draw = canvas(PAGE_BG)
    draw.text((80, 60), title, font=load_font(44, True), fill=INK)
    rr(draw, (80, 140, W - 80, H - 420), 32, WHITE, outline=GREEN)
    draw.text((120, H // 2 - 80), "📷 请替换为真实照片", font=load_font(40, True), fill=INK3)
    draw.text((120, H // 2 - 10), hint, font=load_font(28), fill=INK2)
    y = H - 380
    for s in steps[:3]:
        draw.text((100, y), "· " + s, font=load_font(26), fill=INK2)
        y += 44
    return img
