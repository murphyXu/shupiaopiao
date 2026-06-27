# 书漂漂 · 小红书 7 天内容库

按日期子文件夹存放，每日含：文案 txt、合规清单、截图指南、images/。

## 7 天日历

见 [CONTENT-CALENDAR.md](./CONTENT-CALENDAR.md)

## 一键生成 / 更新全部 7 天

```bash
rtk python3 scripts/social/generate_social_7days.py
```

## 真实截图（Day1 漂流广场示例）

```bash
# 1. 按 wechat或xhs/2026-06-26/screenshot-guide.md 截 raw 图
# 2. 合成贴图用 slide
rtk python3 scripts/composite-xhs-pool-slide.py   # 小红书
rtk python3 scripts/composite-wechat-pool-slide.py # 公众号
```

## 合规总则

- 简介/正文/图片：**不写**公众号、微信、小程序、二维码
- 引流：**置顶笔记 + 评论区**（用户主动问再私信）
- 积分：不可提现；接漂：邮费到付
- 图片：PIL 纯色设计 + 真实截图/照片，**不用 AI 图**

## 主页简介

见 `profile-bio.txt`（合规版）
