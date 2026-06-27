# 真实截图指南 · 2026-06-26

## 通用步骤（微信开发者工具）

1. 打开 **微信开发者工具** → 导入项目 `shupiaopiao-cloud`
2. 确认 `miniprogram/config/index.js` 云环境已配置
3. 编译运行 → 模拟器选 **iPhone 14**（390×844）
4. 截图方式（任选）：
   - macOS：`Cmd + Shift + 4` 框选模拟器区域
   - 或开发者工具菜单 **工具 → 截取屏幕**
5. 将截图保存到本目录 `images/`，**覆盖**下表对应文件名
6. 如有 `rtk python3 scripts/composite-xhs-pool-slide.py`，运行合成命令

## 打码要求

| 信息 | 处理 |
|------|------|
| 收货地址/手机号 | 马赛克 |
| 用户昵称（非必要） | 可打码 |
| 积分余额（可选） | 可保留或打码 |

### `04-app-pool.png`

- **页面路径**：`pages/pool/index`
- **原始截图保存为**：`images/04-app-pool-screenshot-raw.png`
- **操作步骤**：
  1. 打开小程序默认「漂流」Tab
  2. 确保广场有 2+ 本童书
  3. 截全屏含 Tab 栏
- **合成命令**：`rtk python3 scripts/composite-xhs-pool-slide.py`


## 无漂流数据时

先运行 seed 或在体验版手动上漂 2–3 本童书，再截漂流广场。
