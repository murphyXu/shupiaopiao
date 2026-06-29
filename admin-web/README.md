# 免费版 / 无匿名登录 — 本地运营后台

Web 后台通过**本机代理**调用云函数，使用与 `scripts/` 相同的 **TCB API 密钥**，不需要：

- 匿名登录
- HTTP 访问服务
- 静态网站托管（可选）

## 1. 配置云函数账号密码

在云函数 `api` 环境变量中设置：

```text
ADMIN_USERNAME=admin
ADMIN_PASSWORD=你的密码
ADMIN_JWT_SECRET=随机长字符串
```

重新上传部署 `api`。

## 2. 配置 API 密钥（仓库根目录）

在 `shupiaopiao-cloud/.env.local`（与跑脚本时相同）：

```text
TCB_ENV=cloud1-6gngg7ipd8f073ed
TCB_SECRET_ID=你的SecretId
TCB_SECRET_KEY=你的SecretKey
```

密钥获取：腾讯云控制台 → [访问管理 CAM](https://console.cloud.tencent.com/cam/capi) → API 密钥。

子账号需有云开发/云函数调用权限（与跑 `grant-user-credit.js` 相同）。

## 3. 启动

```bash
cd admin-web
npm install
npm run dev        # 开发：http://localhost:5174
# 或
npm run build && npm run start   # 本地正式：http://localhost:8787
```

浏览器登录：`ADMIN_USERNAME` / `ADMIN_PASSWORD`。

## 原理

```
浏览器 → 本机 /admin-api → Node 代理（TCB 密钥）→ 云函数 api → 云数据库
```

仅在你本机运行，密钥不进入浏览器、不上传静态托管。

## 其他方式（了解即可）

| 方式 | 条件 |
|------|------|
| **本机代理（当前）** | `.env.local` + 本机 `npm run start` |
| HTTP 访问 | 腾讯云付费/完整版权限，配置 `/admin` 路由 + `VITE_API_BASE` |
| 小程序 admin 页 | `ADMIN_OPENIDS` 白名单，手机/开发者工具打开隐藏页 |

## 环境变量（admin-web，可选）

```text
# 默认 proxy 模式，无需配置

# 若以后开通了 HTTP 访问，可改为：
# VITE_ADMIN_MODE=http
# VITE_API_BASE=https://cloud1-6gngg7ipd8f073ed.ap-shanghai.app.tcloudbase.com/admin
```
