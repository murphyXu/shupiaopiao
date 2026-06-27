# 书漂漂 · 小程序截图总指南

适用于 `xiaohongshu/` 与 `wechat/` 各日期文件夹中带 **📷 请替换为真实截图** 占位图的位置。

## 一、准备工作

1. **微信开发者工具** 导入 `shupiaopiao-cloud`
2. 配置云环境（`miniprogram/config/index.js`）
3. 上传云函数 `api`、`init-db`、`seed`（若未做）
4. 调试器执行 seed，保证**漂流广场至少有 2–3 本童书**（Day7 空态帖可截空广场）
5. 模拟器设备：**iPhone 14**（宽 390px）

## 二、截图方法

| 方法 | 操作 |
|------|------|
| A 框选 | macOS `Cmd+Shift+4` 框选模拟器（不含工具栏） |
| B 工具 | 菜单 **工具 → 截取屏幕** |
| C 真机 | 体验版扫码 → 音量键+电源，AirDrop 到电脑 |

保存为各 day 文件夹 `screenshot-guide.md` 指定的 `*-raw.png` 文件名，**直接覆盖**同名的占位 PNG 或先替换 raw 再跑合成脚本。

## 三、页面路径速查

| 页面 | 路径 | 如何进入 |
|------|------|----------|
| 漂流广场 | `pages/pool/index` | 默认 Tab「漂流」 |
| 漂流详情 | `pages/pool/detail?id=xxx` | 广场点一本书 |
| 接漂确认 | `pages/drift/claim?driftId=xxx` | 详情页点申请接漂 |
| 我的领取 | `pages/drift/received` | 我的 → 我的漂流（领取） |
| 我的赠出 | `pages/drift/given` | 我的 → 我的漂流（赠出） |
| 书架 | `pages/shelf/index` | Tab「书架」 |
| 上漂表单 | `pages/drift/publish` | 书架 → 书籍 → 发起漂流 |
| 审核结果 | `pages/drift/check-result` | 提交上漂后 |
| 公益积分 | `pages/mine/wallet` | 我的 → 公益积分明细 |
| 信用积分 | `pages/mine/credit` | 我的 → 信用积分明细 |

编译模式直达：开发者工具「编译模式」添加启动参数，如 `pages/pool/detail?id=漂记录ID`。

## 四、打码清单（发布前必做）

- [ ] 收货人姓名、手机号、详细地址
- [ ] 物流单号（可选）
- [ ] 他人昵称（若出现在订单页）

**可保留：** 书名、品相描述、积分数字、页面 UI 结构

## 五、合成命令（仅 Day1 广场横版 slide）

```bash
# 小红书 Day1
rtk python3 scripts/composite-xhs-pool-slide.py

# 公众号 Day1
rtk python3 scripts/composite-wechat-pool-slide.py
```

其他日期 raw 截图通常**直接覆盖** `images/xx-xxx.png`，无需合成。

## 六、真实照片（Day3 开箱等）

占位图 `01-cover.png`、`04-unbox.png` 建议替换为：

- 快递盒 + 绘本（自然光，无 heavy 滤镜）
- 内页品相 2–3 张
- 孩子阅读侧面照（可不露正脸）

**不要：** AI 生成书封、网图盗用、带其他平台水印

## 七、按日期需截图汇总

| 日期 | 小红书 | 公众号 |
|------|--------|--------|
| 06-26 | 漂流广场 | 漂流广场 |
| 06-27 | 广场筛选 | 详情 + 接漂页 |
| 06-28 | 详情 + 订单 | 赠出订单 |
| 06-29 | 书架 + 上漂 + 审核 | 上漂表单 |
| 06-30 | 积分明细 | 积分 + 信用 |
| 07-01 | 书架或真书架照 | 无 |
| 07-02 | 广场现状 | 广场现状 |

各 day 细节见 `{platform}/{date}/screenshot-guide.md`。
