# -*- coding: utf-8 -*-
"""生成 2026-06-27 小红书 post-b（绘本堆成山痛点切角）配图。纯色+文字，无 AI。"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import brand_canvas as bc

OUT = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "..", "xiaohongshu", "2026-06-27", "post-b", "images",
)
OUT = os.path.abspath(OUT)
os.makedirs(OUT, exist_ok=True)


def save(img, name):
    p = os.path.join(OUT, name)
    img.save(p)
    print("saved", p)


# 01 封面
save(
    bc.slide_cover(
        ["养娃3年", "绘本堆成山"],
        subtitle="扔了心疼 · 送人没渠道 · 卖不上价\n后来我找到了出路",
        footer="滑动看我怎么做 👉",
    ),
    "01-cover.png",
)

# 02 痛点
save(
    bc.slide_bullets(
        "你家是不是也这样",
        [
            "一本一本买，读完就压箱底",
            "娃长大了，低幼绘本用不上了",
            "扔掉舍不得，书还很新",
            "送人没门路，卖二手卖不上价",
        ],
        footer="闲置绘本，正在悄悄占满整个书架",
    ),
    "02-pain.png",
)

# 03 换个思路（对比）
save(
    bc.slide_compare(
        "换个思路：让书漂起来",
        [
            ("📤", "漂出去", "读腻的绘本免费赠给需要的家庭", bc.GREEN_INK, bc.MINT),
            ("📥", "接回来", "也能接别家娃的书，邮费到付", bc.GREEN_DEEP, bc.MINT),
            ("♻️", "一直循环", "不囤不浪费，书一直被读到", bc.GREEN, bc.MINT),
        ],
    ),
    "03-idea.png",
)

# 04 注意点
save(
    bc.slide_note(
        "接漂前看清这几点",
        "接别家的书时，页面会标清楚书的品相（全新/9新/8新…），可以看仔细再决定接不接。\n\n邮费是领书方到付，金额自己心里有数，不会有隐藏费用。\n\n整个过程图书在循环流动，旧书被重新读到，对环保也友好。",
        warn="温馨提示：公益循环，免费赠送，邮费到付",
    ),
    "04-tip.png",
)

# 05 真实截图占位（漂流广场）
save(
    bc.slide_photo_placeholder(
        "真实页面：漂流广场",
        "替换为小程序「漂流广场」真实截图",
        [
            "页面路径 pages/pool/index",
            "筛选「绘本」分类后截图",
            "地址/手机号等隐私信息打码",
        ],
    ),
    "05-app-pool.png",
)

# 06 CTA
save(
    bc.slide_cta_xhs(
        title="想试试的姐妹",
        lines=[
            "主页置顶有完整整理",
            "接漂邮费到付 · 看清品相",
            "免费赠送 · 公益循环",
        ],
    ),
    "06-cta.png",
)

print("DONE")
