#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generate 7-day Xiaohongshu + WeChat content folders."""

from __future__ import annotations

import json
import shutil
import textwrap
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "scripts" / "social"
import sys

sys.path.insert(0, str(SCRIPTS))
from brand_canvas import (  # noqa: E402
    slide_books,
    slide_bullets,
    slide_compare,
    slide_cover,
    slide_cta_wechat,
    slide_cta_xhs,
    slide_note,
    slide_photo_placeholder,
    slide_steps,
)

COMPLIANCE_XHS = textwrap.dedent("""
# 合规自检 · 小红书

发布前逐项打勾：

- [ ] 简介无公众号/微信/小程序/二维码
- [ ] 正文无「关注领」「私信领资料」
- [ ] 未承诺「完全免费包邮」→ 应写「邮费到付」
- [ ] 公益积分未描述为可提现/赚钱
- [ ] 无「最强」「必入」等绝对化用语
- [ ] 图片 marked REAL 已换真实截图/照片（非 AI）
- [ ] 评论自评无站外平台名（用户主动问再私信）

**本帖已审：**
- 标题/正文/标签：见同目录 txt 文件
- CTA 图：仅引导置顶/评论区，不写公众号
""").strip()

COMPLIANCE_WECHAT = textwrap.dedent("""
# 合规自检 · 微信公众号贴图

- [ ] 未写「关注送积分」「转发领奖」
- [ ] 公益积分 = 站内流转，不可提现
- [ ] 接漂说明邮费到付
- [ ] 小程序卡片路径为公开页面（非 admin）
- [ ] 真实截图已打码：地址、手机号、openid

**本帖已审：**
- 贴图可挂小程序卡片（平台允许）
""").strip()

SCREENSHOT_GUIDE_TEMPLATE = textwrap.dedent("""
# 真实截图指南 · {date}

## 通用步骤（微信开发者工具）

1. 打开 **微信开发者工具** → 导入项目 `{project}`
2. 确认 `miniprogram/config/index.js` 云环境已配置
3. 编译运行 → 模拟器选 **iPhone 14**（390×844）
4. 截图方式（任选）：
   - macOS：`Cmd + Shift + 4` 框选模拟器区域
   - 或开发者工具菜单 **工具 → 截取屏幕**
5. 将截图保存到本目录 `images/`，**覆盖**下表对应文件名
6. 如有 `{composite_cmd}`，运行合成命令

## 打码要求

| 信息 | 处理 |
|------|------|
| 收货地址/手机号 | 马赛克 |
| 用户昵称（非必要） | 可打码 |
| 积分余额（可选） | 可保留或打码 |

{slots}

## 无漂流数据时

先运行 seed 或在体验版手动上漂 2–3 本童书，再截漂流广场。
""").strip()


def write(path: Path, content: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content.rstrip() + "\n", encoding="utf-8")


def save_slide(img, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG", optimize=True)


DAYS = [
    {
        "date": "2026-06-26",
        "theme": "首发·闲置痛点",
        "xhs": {
            "title": "3岁娃的书架已经爆了｜我是怎么处理闲置绘本的",
            "body": """有同款吗？娃才3岁，书架已经两层满了😭
很多绘本买来58、68，翻三遍就吃灰

试过：
❌ 挂二手——麻烦，还要聊天砍价
❌ 送人——不知道送给谁
✅ 图书漂流——闲置送给需要的小朋友，也能接别人家的绘本

不是卖书，是流转，邮费到付
更多整理在主页置顶，评论区可问我

你们家闲置绘本一般怎么处理？👇""",
            "tags": "#闲置绘本 #童书推荐 #绘本 #育儿 #宝妈日常 #图书漂流 #环保育儿 #亲子阅读 #书架整理 #3岁宝宝",
            "comment": "补充：公益积分是站内流转用的，不可提现～邮费到付，接漂前看清品相哦",
            "slides": [
                ("01-cover.png", lambda: slide_cover(["3岁娃的书架", "已经爆了 📚"], "绘本五六十 · 翻三遍吃灰")),
                ("02-pain.png", lambda: slide_bullets("同款痛点？", ["书架两层满还在买", "绘本轮流少却占地方", "挂二手费妈 送人没对象", "扔又舍不得"], "继续滑 →")),
                ("03-tried.png", lambda: slide_compare("试过的方法", [
                    ("❌", "挂二手", "聊天砍价", "#e85d5d", "#fdeaea"),
                    ("❌", "送亲戚", "年龄不一定合适", "#e85d5d", "#fdeaea"),
                    ("✅", "图书漂流", "让童书继续被读", "#159E63", "#EAFBF2"),
                ])),
                ("04-app-pool.png", "REAL_POOL"),
                ("05-steps.png", lambda: slide_steps("图书漂流 3 步", [
                    ("01", "闲置童书上漂", "送给需要的小朋友"),
                    ("02", "广场接漂", "免费申请（邮费到付）"),
                    ("03", "确认收货", "完成一次流转"),
                ])),
                ("06-cta.png", lambda: slide_cta_xhs()),
            ],
            "screenshots": [{
                "file": "04-app-pool.png",
                "raw": "04-app-pool-screenshot-raw.png",
                "page": "pages/pool/index",
                "steps": ["打开小程序默认「漂流」Tab", "确保广场有 2+ 本童书", "截全屏含 Tab 栏"],
                "composite": "rtk python3 scripts/composite-xhs-pool-slide.py",
            }],
        },
        "wechat": {
            "title": "书漂漂来了：让童书漂起来",
            "caption": """绘本买一本五六十，翻三遍就不看了？📚

书漂漂——专注童书绘本的图书漂流：
· 闲置童书「上漂」
· 广场「接漂」（邮费到付）
· 公益积分仅站内流转，不可提现

滑动看图 👉 点击小程序卡片打开漂流广场""",
            "slides": [
                ("01-cover.png", lambda: slide_cover(["书漂漂来了", "让童书漂起来"], "童书绘本 · 图书漂流 · 邮费到付")),
                ("02-pain.png", lambda: slide_bullets("你有没有这种困扰？", ["绘本贵 孩子很快不看了", "书架越堆越高", "送人不知道送给谁"])),
                ("03-what.png", lambda: slide_bullets("书漂漂是什么？", ["专注童书绘本漂流", "闲置可上漂", "广场可接漂（邮费到付）"])),
                ("04-app-pool.png", "REAL_POOL"),
                ("05-steps.png", lambda: slide_steps("3 步上手", [
                    ("01", "加书到书架", "扫码或手动"),
                    ("02", "发起上漂", "填写品相"),
                    ("03", "接漂或等待", "广场浏览"),
                ])),
                ("06-points.png", lambda: slide_note("公益积分", "接漂占用 · 赠书获得流转积分\n不可提现、不可交易", "站内流转工具，非现金")),
                ("07-why.png", lambda: slide_note("为什么做", "好绘本值得多读几次\n让书在小朋友之间流动", "")),
                ("08-cta.png", lambda: slide_cta_wechat()),
            ],
            "screenshots": [{
                "file": "04-app-pool.png",
                "raw": "04-app-pool-screenshot-raw.png",
                "page": "pages/pool/index",
                "steps": ["编译进入漂流 Tab", "截模拟器全屏"],
                "composite": "rtk python3 scripts/composite-wechat-pool-slide.py",
            }],
        },
    },
    {
        "date": "2026-06-27",
        "theme": "0-3岁书单",
        "xhs": {
            "title": "0-3岁这10本绘本，读完就可以漂出去",
            "body": """0-3岁绘本买精不买多📚这10本我们读完了还在书架

经典值得留，读腻可以「漂出去」
也能接别家娃的绘本（邮费到付）

完整年龄对照在图里，收藏备用
更多整理见主页置顶 👆

你们家 0-3 岁最爱哪本？评论区告诉我""",
            "tags": "#0岁宝宝绘本 #1岁宝宝绘本 #2岁宝宝绘本 #绘本推荐 #亲子阅读 #闲置绘本 #图书漂流 #育儿",
            "comment": "书单是我家真实在读的～漂出去的是九成新，接漂记得看清品相描述",
            "slides": [
                ("01-cover.png", lambda: slide_cover(["0-3岁绘本", "读完可漂书单"], "买精不买多 · 收藏备用")),
                ("02-books-a.png", lambda: slide_books("0-1岁", [("0-1岁", "好饿的毛毛虫"), ("0-1岁", "猜猜我有多爱你"), ("1-2岁", "小熊宝宝绘本"), ("1-2岁", "噼里啪啦系列")])),
                ("03-books-b.png", lambda: slide_books("2-3岁", [("2-3岁", "我的情绪小怪兽"), ("2-3岁", "妈妈买绿豆"), ("2-3岁", "逃家小兔"), ("2-3岁", "彩虹色的花")])),
                ("04-tip.png", lambda: slide_note("怎么漂", "读腻的绘本可以上漂\n广场可接别家童书\n邮费到付 · 看清品相", "公益积分不可提现")),
                ("05-app-pool.png", "REAL_POOL"),
                ("06-cta.png", lambda: slide_cta_xhs("收藏备用", ["主页置顶有汇总", "评论区可问我"])),
            ],
            "screenshots": [{"file": "05-app-pool.png", "raw": "05-app-pool-screenshot-raw.png", "page": "pages/pool/index", "steps": ["筛选「绘本」「0-3岁」", "截广场列表"], "composite": None}],
        },
        "wechat": {
            "title": "接漂新手必看：5步完成第一次接书",
            "caption": """想接第一本漂出来的童书？按这 5 步走：

1 逛漂流广场  2 看品相和积分
3 申请接漂  4 等发货（到付）
5 收货确认

公益积分先占用，收货后结算。不可提现。
👉 点击小程序卡片开始""",
            "slides": [
                ("01-cover.png", lambda: slide_cover(["接漂新手指南", "5 步完成"], "第一次接书必看")),
                ("02-step.png", lambda: slide_steps("接漂 5 步", [
                    ("01", "浏览漂流广场", "未登录也可看"),
                    ("02", "查看详情", "品相·积分·寄出地"),
                    ("03", "申请接漂", "需登录"),
                    ("04", "等待发货", "邮费到付"),
                    ("05", "确认收货", "积分正式结算"),
                ])),
                ("03-note.png", lambda: slide_note("注意", "在途最多 2 单\n接漂前看清品相\n邮费到付", "")),
                ("04-pool-detail.png", "REAL_DETAIL"),
                ("05-claim.png", "REAL_CLAIM"),
                ("06-cta.png", lambda: slide_cta_wechat()),
            ],
            "screenshots": [
                {"file": "04-pool-detail.png", "raw": "04-pool-detail-raw.png", "page": "pages/pool/detail", "steps": ["点进任意一本漂出书", "截详情含「申请接漂」"], "composite": None},
                {"file": "05-claim.png", "raw": "05-claim-raw.png", "page": "pages/drift/claim", "steps": ["进入接漂确认页（勿提交真实订单）", "截地址/积分说明，打码地址"], "composite": None},
            ],
        },
    },
    {
        "date": "2026-06-28",
        "theme": "接漂开箱",
        "xhs": {
            "title": "实拍｜第一次接漂绘本开箱，没翻车",
            "body": """交作业：第一次接漂童书开箱📦

流程：选书 → 申请 → 等发货 → 到付收货
品相和描述基本一致，娃很喜欢

邮费到付！接前看清寄出地
更多细节在图里，置顶也有汇总

你们接二手绘本最担心什么？评论区说""",
            "tags": "#绘本开箱 #二手绘本 #闲置绘本 #图书漂流 #亲子阅读 #真实测评 #宝妈日常",
            "comment": "我最先看品相描述和寄出地～远的话运费会高一些",
            "slides": [
                ("01-cover.png", lambda: slide_photo_placeholder("接漂开箱", "替换为快递+绘本实拍", ["快递盒+绘本封面", "自然光拍摄", "勿用滤镜过度"])),
                ("02-pool.png", "REAL_DETAIL"),
                ("03-order.png", "REAL_ORDER"),
                ("04-unbox.png", lambda: slide_photo_placeholder("开箱品相", "替换为内页实拍", ["拍封面+内页 2-3 张", "展示真实品相", "与描述对照"])),
                ("05-read.png", lambda: slide_photo_placeholder("娃在读", "替换为孩子阅读照", ["侧面照即可", "可不露正脸"])),
                ("06-cta.png", lambda: slide_cta_xhs("接漂前看这三点", ["看清品相描述", "看清寄出地（运费）", "公益积分不可提现"])),
            ],
            "screenshots": [
                {"file": "02-pool.png", "raw": "02-pool-raw.png", "page": "pages/pool/detail", "steps": ["截申请前的详情页"], "composite": None},
                {"file": "03-order.png", "raw": "03-order-raw.png", "page": "pages/drift/received", "steps": ["我的漂流(领取) 在途/待收货", "打码地址"], "composite": None},
            ],
        },
        "wechat": {
            "title": "第一本漂出去的书：从北京到广州",
            "caption": """一个完整的漂流故事 🌿

北京妈妈上漂《好饿的毛毛虫》
广州爸爸接漂，3 天到手
双方确认收货，完成流转

邮费到付 · 按时发货维护信用分
👉 你也有一本读腻的绘本吗？""",
            "slides": [
                ("01-cover.png", lambda: slide_cover(["漂流故事", "好饿的毛毛虫"], "从北京 → 广州")),
                ("02-giver.png", lambda: slide_bullets("赠书方", ["1岁生日礼物 读了20遍", "品相九成新 内页无涂画", "审核半天通过"])),
                ("03-taker.png", lambda: slide_bullets("接漂方", ["孩子2岁正合适", "看品相和寄出地", "开箱与描述一致"])),
                ("04-ship.png", "REAL_GIVEN"),
                ("05-done.png", lambda: slide_note("完成", "确认收货后\n赠书方获流转积分\n双方信用 +2", "")),
                ("06-cta.png", lambda: slide_cta_wechat()),
            ],
            "screenshots": [
                {"file": "04-ship.png", "raw": "04-ship-raw.png", "page": "pages/drift/given", "steps": ["我的漂流(赠出) 待发货/已发货", "可打码物流单号"], "composite": None},
            ],
        },
    },
    {
        "date": "2026-06-29",
        "theme": "上漂教程",
        "xhs": {
            "title": "第一次上漂｜我寄出了3本闲置绘本",
            "body": """书架整理完，第一次上漂 3 本绘本📚

流程：书架加书 → 填品相 → 提交审核
审核通过出现在广场，等有缘人接

品相如实写！减少纠纷
上漂指南见置顶，评论区可问

你们舍得漂哪些书？👇""",
            "tags": "#闲置绘本 #绘本整理 #图书漂流 #亲子阅读 #书架整理 #童书 #上漂",
            "comment": "品相描述我写：封面角轻微折痕、内页无涂画，接漂方反馈准确",
            "slides": [
                ("01-cover.png", lambda: slide_cover(["第一次上漂", "3本闲置绘本"], "书架整理实录")),
                ("02-shelf.png", "REAL_SHELF"),
                ("03-publish.png", "REAL_PUBLISH"),
                ("04-condition.png", lambda: slide_bullets("品相怎么填", ["如实选档位", "写清折痕/涂画/缺页", "寄出地帮对方估运费", "72小时内发货"])),
                ("05-check.png", "REAL_CHECK"),
                ("06-cta.png", lambda: slide_cta_xhs()),
            ],
            "screenshots": [
                {"file": "02-shelf.png", "raw": "02-shelf-raw.png", "page": "pages/shelf/index", "steps": ["书架 Tab 有书列表"], "composite": None},
                {"file": "03-publish.png", "raw": "03-publish-raw.png", "page": "pages/drift/publish", "steps": ["发起上漂表单页", "勿暴露真实地址"], "composite": None},
                {"file": "05-check.png", "raw": "05-check-raw.png", "page": "pages/drift/check-result", "steps": ["审核通过结果页"], "composite": None},
            ],
        },
        "wechat": {
            "title": "上漂指南：品相怎么填才不会踩坑",
            "caption": """赠书方看这篇就够了：

✓ 品相档位 + 文字描述
✓ 可选填寄出参考地
✓ 72 小时内发货
✓ 信用分影响后续功能

发货前可取消上漂
👉 菜单「开始漂流」→ 书架""",
            "slides": [
                ("01-cover.png", lambda: slide_cover(["上漂指南", "品相怎么填"], "赠书方必读")),
                ("02-form.png", "REAL_PUBLISH"),
                ("03-levels.png", lambda: slide_bullets("品相档位", ["全新：无使用痕迹", "九成新：轻微折痕", "八成新：明显使用", "如实选择最重要"])),
                ("04-ship.png", lambda: slide_steps("发货约定", [("01", "有人接漂", "收到通知"), ("02", "72h内寄出", "填物流单号"), ("03", "接漂方到付", "赠书方寄出")])),
                ("05-cancel.png", lambda: slide_note("取消", "发货前可取消\n书回到可漂流状态", "")),
                ("06-cta.png", lambda: slide_cta_wechat()),
            ],
            "screenshots": [
                {"file": "02-form.png", "raw": "02-form-raw.png", "page": "pages/drift/publish", "steps": ["上漂表单全貌"], "composite": None},
            ],
        },
    },
    {
        "date": "2026-06-30",
        "theme": "积分科普",
        "xhs": {
            "title": "公益积分是什么？一篇讲清楚（不能提现）",
            "body": """被问最多的：公益积分到底干嘛用？

不是钱，不能提现❌
是站内接漂/上漂的流转工具

怎么获得、怎么占用，图里写了
规则以小程序内说明为准

还有疑问评论区问～""",
            "tags": "#图书漂流 #公益积分 #童书 #育儿干货 #绘本 #宝妈日常",
            "comment": "强调：不可提现、不可转让，别和现金挂钩理解就对了",
            "slides": [
                ("01-cover.png", lambda: slide_cover(["公益积分", "一篇讲清楚"], "不能提现 · 不能交易")),
                ("02-what.png", lambda: slide_note("是什么", "站内图书漂流流转工具\n接漂时先占用\n收货后正式扣除", "不具备现金属性")),
                ("03-earn.png", lambda: slide_bullets("怎么获得", ["上漂审核通过（有上限）", "完成赠书获流转积分", "首次完成赠书有额外奖励", "1积分=10书架容量"])),
                ("04-use.png", lambda: slide_bullets("怎么用", ["接漂占用积分", "取消接漂会释放", "兑换书架收藏额度"])),
                ("05-wallet.png", "REAL_WALLET"),
                ("06-cta.png", lambda: slide_cta_xhs("以小程序内规则为准", ["我的 → 设置 查看完整规则"])),
            ],
            "screenshots": [
                {"file": "05-wallet.png", "raw": "05-wallet-raw.png", "page": "pages/mine/wallet", "steps": ["公益积分明细页", "余额可打码"], "composite": None},
            ],
        },
        "wechat": {
            "title": "公益积分 & 信用积分：双积分怎么理解",
            "caption": """公益积分 → 流转工具（不可提现）
信用积分 → 履约记录（初始100）

加分：按时发货/确认收货
扣分：取消、超时、纠纷

信用低于60暂不可上漂
👉 小程序「我的」查看明细""",
            "slides": [
                ("01-cover.png", lambda: slide_cover(["双积分说明", "公益 + 信用"], "规则摘要")),
                ("02-coin.png", lambda: slide_bullets("公益积分", ["接漂占用·赠书获得", "不可提现转让", "换书架容量"])),
                ("03-credit.png", lambda: slide_bullets("信用积分", ["初始100分", "完成+2 超时-10", "过低限制上漂/接漂"])),
                ("04-wallet.png", "REAL_WALLET"),
                ("05-credit-page.png", "REAL_CREDIT"),
                ("06-cta.png", lambda: slide_cta_wechat()),
            ],
            "screenshots": [
                {"file": "04-wallet.png", "raw": "04-wallet-raw.png", "page": "pages/mine/wallet", "steps": ["公益积分明细"], "composite": None},
                {"file": "05-credit-page.png", "raw": "05-credit-raw.png", "page": "pages/mine/credit", "steps": ["信用积分明细"], "composite": None},
            ],
        },
    },
    {
        "date": "2026-07-01",
        "theme": "书架整理FAQ",
        "xhs": {
            "title": "周末整理书架｜这3类童书最适合漂出去",
            "body": """周末带娃整理书架，分了三堆：

✅ 适合漂：0-3经典读腻的
⚠️ 暂留：娃还会反复看的
❌ 不建议：缺页严重/涂画太重

整理完上漂了 2 本
FAQ 见置顶

你们整理书架吗？👇""",
            "tags": "#书架整理 #闲置绘本 #绘本整理 #亲子日常 #图书漂流 #育儿 #童书",
            "comment": "缺页严重的我一般不漂，品相不好容易纠纷",
            "slides": [
                ("01-cover.png", lambda: slide_cover(["周末整理书架", "3类书怎么分"], "实操分享")),
                ("02-yes.png", lambda: slide_bullets("适合漂", ["0-3经典已读腻", "九成新以上", "无涂画缺页"])),
                ("03-no.png", lambda: slide_bullets("暂不建议", ["缺页/水渍严重", "涂画过多", "娃还会反复看"])),
                ("04-faq.png", lambda: slide_bullets("常见问", ["邮费谁出？到付", "能接几本？在途2单", "积分从哪来？上漂/完成赠书"])),
                ("05-shelf.png", "REAL_SHELF"),
                ("06-cta.png", lambda: slide_cta_xhs()),
            ],
            "screenshots": [
                {"file": "05-shelf.png", "raw": "05-shelf-raw.png", "page": "pages/shelf/index", "steps": ["书架列表", "或真实书架照片替换本张"], "composite": None},
            ],
        },
        "wechat": {
            "title": "FAQ：接漂/上漂 5个最常见问题",
            "caption": """1 书免费吗？→ 书费无，邮费到付
2 品相？→ 以详情描述为准
3 接几本？→ 在途最多2单
4 积分？→ 站内流转，不可提现
5 取消？→ 发货前可取消

👉 菜单「开始漂流」""",
            "slides": [
                ("01-cover.png", lambda: slide_cover(["FAQ", "5个最常见问题"], "收藏备用")),
                ("02-q1.png", lambda: slide_note("Q1 书免费吗", "接漂不另收书费\n邮费到付", "")),
                ("03-q2.png", lambda: slide_note("Q2 品相", "以详情页描述为准\n接前看清", "")),
                ("04-q3.png", lambda: slide_note("Q3 能接几本", "在途未收货最多2单", "")),
                ("05-q4.png", lambda: slide_note("Q4 积分", "站内流转\n不可提现", "")),
                ("06-cta.png", lambda: slide_cta_wechat()),
            ],
            "screenshots": [],
        },
    },
    {
        "date": "2026-07-02",
        "theme": "召唤首波赠书",
        "xhs": {
            "title": "漂流池还空着｜来做第一个赠书人吧",
            "body": """这周开始分享图书漂流
广场需要第一批童书 📚

如果你也有读腻的绘本：
上漂 1 本就能帮后面的人接到书

第一次上漂流程见前面笔记
置顶有汇总

愿意试试的评论区扣「1」""",
            "tags": "#图书漂流 #童书 #绘本 #闲置绘本 #赠书 #环保育儿 #亲子阅读",
            "comment": "第一次上漂审核通过有少量公益积分（有上限），详情见小程序规则",
            "slides": [
                ("01-cover.png", lambda: slide_cover(["来做第一个", "赠书人吧"], "让广场有书可接")),
                ("02-empty.png", "REAL_POOL"),
                ("03-give.png", lambda: slide_steps("上漂 3 步", [
                    ("01", "书架加书", ""),
                    ("02", "发起上漂", "填品相"),
                    ("03", "等接漂发货", "72h内"),
                ])),
                ("04-reward.png", lambda: slide_note("完成赠书", "获流转公益积分\n维护信用分", "不可提现")),
                ("05-you.png", lambda: slide_bullets("适合第一本书", ["短绘本 重量轻", "品相好 描述简单", "经典款更好接"])),
                ("06-cta.png", lambda: slide_cta_xhs("前面笔记有教程", ["置顶有汇总"])),
            ],
            "screenshots": [
                {"file": "02-empty.png", "raw": "02-empty-raw.png", "page": "pages/pool/index", "steps": ["广场空态或仅少量书", "真实状态即可"], "composite": None},
            ],
        },
        "wechat": {
            "title": "本周小结：感谢每一位愿意漂出书的你",
            "caption": """书漂漂上线第一周 🌿

已有家长开始上漂/接漂
还需要更多童书进入广场

如果你愿意：
→ 书架选一本读腻的绘本
→ 发起上漂

👉 小程序卡片 · 漂流广场""",
            "slides": [
                ("01-cover.png", lambda: slide_cover(["第一周", "感谢赠书的你"], "书漂漂 · 小结")),
                ("02-week.png", lambda: slide_bullets("这周", ["官宣 & 新手指南", "积分规则说明", "FAQ 整理"])),
                ("03-need.png", lambda: slide_note("还需要", "更多童书进入漂流池\n让接漂有的选", "")),
                ("04-pool.png", "REAL_POOL"),
                ("05-first.png", lambda: slide_bullets("第一本书建议", ["绘本 重量轻", "九成新", "经典书名"])),
                ("06-cta.png", lambda: slide_cta_wechat()),
            ],
            "screenshots": [
                {"file": "04-pool.png", "raw": "04-pool-raw.png", "page": "pages/pool/index", "steps": ["当前广场状态"], "composite": None},
            ],
        },
    },
]


def format_screenshot_guide(date: str, slots: list[dict]) -> str:
    if not slots:
        return "# 真实截图指南\n\n本帖全部为文字设计图，**无需**小程序截图。可用真实照片替换 marked `REAL_PHOTO` 占位图。\n"
    rows = []
    for s in slots:
        comp = s.get("composite") or "（直接覆盖 images/ 下对应 png，无需合成）"
        rows.append(f"### `{s['file']}`\n\n- **页面路径**：`{s['page']}`\n- **原始截图保存为**：`images/{s['raw']}`\n- **操作步骤**：\n" + "\n".join(f"  {i+1}. {st}" for i, st in enumerate(s["steps"])) + f"\n- **合成命令**：`{comp}`\n")
    composite = slots[0].get("composite") or "无"
    return SCREENSHOT_GUIDE_TEMPLATE.format(
        date=date,
        project="shupiaopiao-cloud",
        composite_cmd=composite,
        slots="\n".join(rows),
    )


def build_post_md(platform: str, day: dict, cfg: dict) -> str:
    if platform == "xhs":
        return textwrap.dedent(f"""
# 小红书 · {day['date']} · {day['theme']}

| 项目 | 内容 |
|------|------|
| 标题 | 见 `title.txt` |
| 类型 | 图文轮播 |
| 衔接 | 见 `CONTENT-CALENDAR.md` |

## 图片顺序

{chr(10).join(f"- `{s[0]}`" + (" ⚠️需真实截图" if isinstance(s[1], str) and s[1].startswith("REAL") else "") for s in cfg['slides'])}

## 发布

1. 按序上传 `images/` 下 PNG
2. 复制 title/body/tags
3. 2h 后发 `comment-followup.txt`

详见 `compliance-checklist.md` · `screenshot-guide.md`
""").strip()
    return textwrap.dedent(f"""
# 微信公众号贴图 · {day['date']} · {day['theme']}

| 项目 | 内容 |
|------|------|
| 标题 | 见 `title.txt` |
| 描述 | 见 `caption.txt` |
| 小程序 | `pages/pool/index`（或 screenshot-guide 指定页） |

## 图片顺序

{chr(10).join(f"- `{s[0]}`" + (" ⚠️需真实截图" if isinstance(s[1], str) and s[1].startswith("REAL") else "") for s in cfg['slides'])}

## 发布

贴图 → 上传图片 → 标题/描述 → 挂小程序卡片

详见 `compliance-checklist.md` · `screenshot-guide.md`
""").strip()


def real_placeholder(kind: str) -> "Image":
    hints = {
        "REAL_POOL": ("小程序截图位", "pages/pool/index", ["打开漂流 Tab", "截全屏"]),
        "REAL_DETAIL": ("详情页截图", "pages/pool/detail", ["点一本漂出书", "截详情页"]),
        "REAL_CLAIM": ("接漂确认页", "pages/drift/claim", ["打码地址"]),
        "REAL_ORDER": ("订单页截图", "pages/drift/received", ["我的漂流-领取"]),
        "REAL_GIVEN": ("赠出订单", "pages/drift/given", ["我的漂流-赠出"]),
        "REAL_SHELF": ("书架截图", "pages/shelf/index", ["书架 Tab"]),
        "REAL_PUBLISH": ("上漂表单", "pages/drift/publish", ["发起上漂页"]),
        "REAL_CHECK": ("审核结果", "pages/drift/check-result", ["审核通过页"]),
        "REAL_WALLET": ("积分明细", "pages/mine/wallet", ["打码余额可选"]),
        "REAL_CREDIT": ("信用明细", "pages/mine/credit", []),
    }
    title, _, steps = hints.get(kind, ("截图位", "", ["见 screenshot-guide.md"]))
    return slide_photo_placeholder(title, "见 screenshot-guide.md", steps or ["按指南操作"])


def generate_day(day: dict):
    date = day["date"]
    for platform, key, root_name in [("xhs", "xhs", "xiaohongshu"), ("wechat", "wechat", "wechat")]:
        cfg = day[key]
        base = ROOT / root_name / date
        img_dir = base / "images"
        img_dir.mkdir(parents=True, exist_ok=True)

        if platform == "xhs":
            write(base / "title.txt", cfg["title"])
            write(base / "body.txt", cfg["body"])
            write(base / "tags.txt", cfg["tags"])
            write(base / "comment-followup.txt", cfg["comment"])
        else:
            write(base / "title.txt", cfg["title"])
            write(base / "caption.txt", cfg["caption"])
            write(base / "author.txt", "书漂漂")
            write(base / "paste-order.txt", "\n".join(f"{i+1}. {s[0]}" for i, s in enumerate(cfg["slides"])))

        write(base / "post.md", build_post_md(platform, day, cfg))
        write(base / "compliance-checklist.md", COMPLIANCE_XHS if platform == "xhs" else COMPLIANCE_WECHAT)
        write(base / "screenshot-guide.md", format_screenshot_guide(date, cfg.get("screenshots", [])))

        for fname, spec in cfg["slides"]:
            path = img_dir / fname
            if isinstance(spec, str):
                if spec.startswith("REAL"):
                    save_slide(real_placeholder(spec), path)
                else:
                    continue
            else:
                save_slide(spec(), path)
            print(f"wrote {path}")

        meta = {"date": date, "theme": day["theme"], "platform": platform, "real_shots": cfg.get("screenshots", [])}
        write(base / "meta.json", json.dumps(meta, ensure_ascii=False, indent=2))


def write_calendars():
    lines = ["# 7 天内容日历\n", "| 天 | 日期 | 主题 | 小红书 | 微信公众号 | 衔接 |", "|---|---|---|---|---|---|"]
    links = [
        "首发痛点",
        "Day1痛点→Day2书单",
        "Day2接漂→Day3开箱",
        "Day3接漂→Day4上漂",
        "Day4流程→Day5积分",
        "Day5规则→Day6FAQ",
        "Week1闭环召唤赠书",
    ]
    for i, d in enumerate(DAYS):
        lines.append(f"| D{i+1} | {d['date']} | {d['theme']} | {d['xhs']['title'][:20]}… | {d['wechat']['title'][:20]}… | {links[i]} |")
    cal = "\n".join(lines) + "\n"
    write(ROOT / "xiaohongshu" / "CONTENT-CALENDAR.md", cal)
    write(ROOT / "wechat" / "CONTENT-CALENDAR.md", cal)


def copy_pool_html():
    src = ROOT / "xiaohongshu" / "2026-06-26" / "images" / "04-app-pool.html"
    if not src.exists():
        return
    for d in DAYS:
        for root in ("xiaohongshu", "wechat"):
            dst = ROOT / root / d["date"] / "images" / "04-app-pool.html"
            dst.parent.mkdir(parents=True, exist_ok=True)
            if src.resolve() != dst.resolve():
                shutil.copy2(src, dst)


def main():
    write_calendars()
    copy_pool_html()
    for day in DAYS:
        generate_day(day)
    print(f"done: {len(DAYS)} days × 2 platforms")


if __name__ == "__main__":
    main()
