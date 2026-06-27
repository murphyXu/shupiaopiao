# 书漂漂 · 微信云开发版

与仓库根目录 **自建 API 方案**（`miniprogram/` + `server/`）并行，本目录为 **云开发独立项目**，无需域名备案、无需 HTTPS 服务器。

## 项目结构

```
shupiaopiao-cloud/
├── project.config.json      # 微信项目配置（含 cloudfunctionRoot）
├── cloudfunctions/
│   ├── init-db/             # 创建云数据库集合
│   ├── api/                 # 统一业务云函数（action 路由）
│   └── seed/                # 初始化书目/书单种子数据
└── miniprogram/             # 小程序前端（UI 与自建版一致，API 走云函数）
```

## 与自建 API 版差异

| 项目 | 自建 API 版 | 云开发版（本目录） |
|------|-------------|-------------------|
| 路径 | `../miniprogram` + `../server` | `shupiaopiao-cloud/` |
| 网络 | `wx.request` → HTTPS 域名 | `wx.cloud.callFunction` |
| 登录 | code → 后端 JWT | 云函数 `getWXContext().OPENID` |
| 图片上传 | HTTP uploadFile | 云存储 `wx.cloud.uploadFile` |
| 数据库 | SQLite | 云数据库集合 |
| 上线要求 | 域名 + 备案 + 服务器 | 开通云开发即可 |

## 快速开始

### 1. 导入项目

微信开发者工具 → **导入** → 选择本目录：

```
tushupiaoliu/shupiaopiao-cloud
```

AppID 使用你的小程序 AppID（与自建版相同 AppID 亦可，云环境与 request 域名互不影响）。

### 2. 开通云开发

1. 开发者工具顶部 **云开发** → **开通**
2. 创建环境（如 `shupiaopiao-dev`）
3. （可选）在 `miniprogram/config/index.js` 填写 `cloudEnvId`

### 3. 上传云函数

右键以下目录 → **上传并部署：云端安装依赖**：

- `cloudfunctions/init-db`（创建数据库集合）
- `cloudfunctions/seed`（种子数据）
- `cloudfunctions/api`（业务接口）

### 4. 初始化数据库（首次必做）

云数据库**不会**在首次写入时自动建表，须先 `init-db` 再 `seed`。

调试器 Console **按顺序**执行：

```javascript
wx.cloud.callFunction({ name: 'init-db' }).then(console.log)
wx.cloud.callFunction({ name: 'seed' }).then(console.log)
```

成功应看到 `collections ready` 和 `seed ok`（`books: 20`）。

**备选**：云开发控制台 → **数据库** → **添加集合**，手动创建 `books`、`users` 等（完整列表见 `cloudfunctions/seed/collections.js`），再运行 `seed`。

### 体验版：同步内置书目与封面

若已 seed 过，在调试器执行一次（补全书目、把豆瓣外链封面改为本地封面标记）：

```javascript
wx.cloud.callFunction({ name: 'seed', data: { syncCatalog: true } }).then(console.log)
```

`syncCatalog` 默认假设已先运行 `init-db`，避免每次补数据都重复建集合导致云函数 3 秒超时。

### 5. 编译运行

- 默认进入 **漂流** Tab，未登录可浏览
- **我的** → 微信一键登录
- 完整流程：加书 → 上漂 → 漂流广场 → 接漂 → 订单

## 云数据库集合

云函数读写以下集合（须先运行 `init-db` 创建）：

| 集合 | 说明 |
|------|------|
| `users` | 用户 |
| `books` | 书目库 |
| `shelf_books` | 书架 |
| `drifts` | 漂流记录 |
| `drift_orders` | 订单 |
| `coin_transactions` | 书漂币流水 |
| `credit_logs` | 信用分记录 |
| `addresses` | 收货地址 |
| `pricing_cache` | 核价缓存 |
| `reviews` | 评价 |
| `events` | 行为埋点明细（保留 90 天） |
| `daily_metrics` | 日聚合指标快照 |

> 所有数据经 `api` 云函数访问，客户端不直连数据库，无需额外配置 DB 权限规则。

## 数据埋点与运营看板

### 架构概览

- **采集**：前端 `miniprogram/utils/track.js`（页面浏览、关键点击）+ 云函数 API 中间件（业务 action 自动埋点）
- **明细**：`events`（行为）、`coin_transactions` / `credit_logs` / `drift_order_events`（业务流水）
- **聚合**：`daily_metrics`（每天 00:30 定时任务 `scheduledTasks` 自动写入）
- **看板**：小程序内 `pages/admin/dashboard`（概览、趋势、漏斗、分析结论）+ `pages/admin/logs`（明细查询）

### 首次上线 Checklist

1. 上传并部署 `cloudfunctions/api`（含 `config.json` 定时器）
2. 云函数 `api` 环境变量配置管理员 openid：

   ```text
   ADMIN_OPENIDS=你的openid
   ```

3. 运行 `init-db` 或调用 `system.initDb` 创建 `events`、`daily_metrics` 集合
4. 云数据库控制台为 `events` 创建索引：`day`+`type`、`day`+`uidHash`、`ts`（降序）
5. 调试器手动回填近 7 天聚合：

   ```javascript
   wx.cloud.callFunction({ name: 'api', data: { action: 'admin.rebuild', data: { days: 7 } } }).then(console.log)
   ```

6. 管理员访问看板：开发者工具编译后跳转 `pages/admin/dashboard`（**不在公开导航中暴露**）

### 过审说明

- 看板页无 Tab/首页入口，普通用户无法触达；服务端 `ADMIN_OPENIDS` 白名单拦截，非管理员只看到「无权访问」
- 埋点仅采集行为事件与匿名 uidHash，不上报手机号/地址等 PII；需在隐私政策中说明「用于产品优化与运营统计」
- 审核人员无白名单 openid 时，即使知道路径也无法看到任何业务数据

### 管理 API

| action | 说明 |
|--------|------|
| `admin.overview` | 今日 + 近 7 天概览 |
| `admin.trend` | 趋势序列（days: 7/14/30） |
| `admin.funnel` | 漂流漏斗 |
| `admin.conclusion` | 规则引擎分析结论 |
| `admin.events` | 行为事件明细 |
| `admin.ledger` | 业务流水明细（kind: coin/credit/order） |
| `admin.rebuild` | 手动重算聚合 |
| `admin.export` | 导出 daily_metrics JSON |

## API 云函数 action 列表

客户端通过 `utils/api.js` 调用，内部格式：

```javascript
wx.cloud.callFunction({
  name: 'api',
  data: { action: 'pool.list', data: { keyword: '' } }
})
```

主要 action：`auth.login`、`shelf.list`、`drift.publish`、`pool.list`、`drift.claim` 等，与自建 REST 接口一一对应。

## 发布体验版

1. 确认云函数已部署到 **正式环境**（云开发控制台可创建 prod 环境）
2. `config/index.js` 中 `cloudEnvId` 指向正式环境 ID
3. 开发者工具 **上传** → 公众平台设为体验版
4. **无需** 配置 request 合法域名

若使用动态本地封面路径（`/assets/covers/${isbn}.png`），上传前确认开发者工具未过滤未引用文件；本项目本机配置已将 `ignoreDevUnusedFiles` 设为 `false`。

## 注意事项

- 云开发免费额度用完后需按量付费，见[微信云开发定价](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/billing/pricing.html)
- 物流查询、二手核价 MVP 阶段为演示数据，与自建版一致
- 两版共用同一 AppID 时，注意不要混淆导入目录

### 免费书源试跑

扫码/搜索真实识别试跑使用探数 ISBN API + Google Books + Open Library。当前策略：

- ISBN 查询优先走探数 `ISBN数据查询_基础版`，命中后写入 `books` 缓存，后续同 ISBN 不再消耗探数额度
- 云函数 provider 并发查询，避免单个免费源拖慢整次查书
- Open Library 关键词搜索使用 `title/q + fields` 两路并发精简查询，ISBN 搜索直接走 `api/books`
- 外部 HTTP 请求有硬超时，当前 Open Library 元数据预算为 5 秒，避免连接阶段卡到云函数总超时
- Google Books 无 key 访问可能返回 `HTTP_429`，不能作为稳定主源

探数密钥不要写入仓库。请在云函数 `api` 的环境变量中配置：

```text
TANSHU_API_KEY=你的探数 key
```

客户端展示远程封面时，体验版/正式版需要在微信公众平台配置 downloadFile 合法域名：

- `static.tanshuapi.com`
- `img.tanshuapi.com`
- `books.google.com`
- `www.googleapis.com`
- `openlibrary.org`
- `covers.openlibrary.org`

未配置域名时，图书元数据仍可返回，但远程封面可能不显示。

扫码/搜索返回远程封面后，客户端会后台执行封面缓存：`wx.downloadFile` 下载远程封面 → `wx.cloud.uploadFile` 上传到 `book-covers/{isbn}.{ext}` → `books.updateCover` 写回云数据库。该流程不阻塞录入；失败只记录日志。

## 相关文档

- 自建 API 部署：`../server/DEPLOY.md`
- 产品 MVP 清单：`../output/ad66d89f-4959-4a20-9f86-ce84f5327dc1/书漂漂-MVP功能开发清单.md`
