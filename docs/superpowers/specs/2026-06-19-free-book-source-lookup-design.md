# 免费书源真实识别方案设计

**目标：** 让书架扫码录入与搜索优先返回真实图书信息和真实封面，不再依赖 20 本内置目录，也不再用“图书（后6位）”作为默认体验。

**范围：** 仅改 `shupiaopiao-cloud/` 云开发版；方案 A 暂不改动。

**外部书源：**
- Google Books API：`https://www.googleapis.com/books/v1/volumes`
- Open Library Books API：`https://openlibrary.org/api/books`
- Open Library Search API：`https://openlibrary.org/search.json`

---

## 背景与问题

当前体验版的书架录入链路是：

1. `wx.scanCode` 识别条码字符串。
2. 小程序调用 `api` 云函数 `books.isbn`。
3. 云函数先查 `books` 集合，再查内置 `bookCatalog.js`。
4. 非内置 ISBN 退化为占位书。

这导致三个直接问题：

- 扫码非内置 ISBN 时，无法展示真实书名、作者、简介。
- 搜索只覆盖云数据库已有数据和 20 本内置目录，真实覆盖率很低。
- 封面依赖本地 20 张 PNG 或旧的云封面；真实书封能力不稳定。

---

## 推荐架构

采用“缓存优先 + 免费书源实时补全 + 内置目录保底 + 手动补录兜底”。

### ISBN 查询顺序

1. 查 `books` 集合缓存。
2. 查内置 `bookCatalog.js`。
3. 查 Google Books `q=isbn:{isbn}`。
4. 查 Open Library Books API `bibkeys=ISBN:{isbn}`。
5. 若仍未命中，返回“未识别”，引导手动补录；不再自动创建假书名。

### 关键词搜索顺序

1. 查 `books` 集合缓存。
2. 查内置 `bookCatalog.js`。
3. 查 Google Books `q={keyword}&printType=books&maxResults=10`。
4. 查 Open Library Search API `q={keyword}&limit=10`。
5. 合并、去重、归一化后返回；可将前 10 条异步/顺序落库。

### 去重规则

优先级：

1. ISBN13。
2. ISBN10。
3. 标准化后的 `title + author`。

相同图书多源命中时，字段优先级：

1. 缓存中已有人工修正字段。
2. Google Books 字段。
3. Open Library 字段。
4. 内置目录字段。

---

## 数据模型

保持现有 `books` 集合兼容，新增可选字段：

```js
{
  isbn: '9787533256739',
  isbn10: '',
  title: '猜猜我有多爱你',
  author: '山姆·麦克布雷尼',
  publisher: '',
  pubDate: '',
  summary: '',
  category: '绘本',
  ageRange: '',
  cover: 'local:9787533256739',
  coverRemote: 'https://books.google.com/books/content?id=example&printsec=frontcover&img=1&zoom=1',
  coverSource: 'google_books',
  source: 'google_books',
  sourceId: '',
  lookupStatus: 'found',
  updatedAt: '2026-06-19T09:00:00.000Z'
}
```

字段约定：

- `cover` 保留兼容，继续支持 `cloud://`、`local:{isbn}`、`/assets/covers/default.png`。
- `coverRemote` 存外部真实封面 URL。
- `source` 标记 `cache`、`catalog`、`google_books`、`open_library`、`manual`。
- `lookupStatus` 使用 `found`、`not_found`、`manual_needed`。

---

## 云函数设计

新增 provider 适配层：

```text
cloudfunctions/api/lib/bookProviders/
├── index.js
├── googleBooks.js
└── openLibrary.js
```

接口：

```js
async function lookupByIsbn(isbn)
async function searchByKeyword(keyword, limit)
```

返回统一格式：

```js
{
  isbn,
  isbn10,
  title,
  author,
  publisher,
  pubDate,
  summary,
  category,
  coverRemote,
  source,
  sourceId
}
```

超时控制：

- 每个 provider 单次请求最多 1200ms。
- ISBN 查询总预算控制在 2500ms 内。
- 搜索每个 provider 最多 10 条结果。
- 任一 provider 失败只记录日志，不中断后续 provider。

实现约束：

- 使用 Node 内置 `https`，不新增依赖，降低云函数部署风险。
- 不在云函数中下载封面或上传云存储。
- 外部 API 只返回元数据和封面 URL。

---

## 前端设计

### 扫码页

状态：

- `idle`：等待扫码。
- `loading`：识别中。
- `found`：展示真实图书信息。
- `not_found`：展示“未识别，可手动补录”。

交互：

- 扫码识别 ISBN 后调用 `books.isbn`。
- 成功展示书名、作者、封面、来源。
- 失败不显示假图书，提供“重新扫码”“手动补录”入口。

### 搜索页

状态：

- 输入关键词后调用 `books.search`。
- 展示缓存 + 外部书源合并结果。
- 每条展示封面、书名、作者、来源。
- 无结果时提供“换关键词”“手动添加”。

### 封面显示顺序

前端 `displayCover` 调整为：

1. `cloud://` 云封面。
2. `coverRemote` 外部真实封面。
3. 本地 ISBN PNG。
4. 默认占位图。

图片加载失败时：

1. 若当前是 `coverRemote`，回退本地 ISBN PNG。
2. 若本地 ISBN PNG 不存在，回退默认占位。

---

## 合法域名与上线条件

体验版/正式版要展示远程封面并从客户端加载图片，需在微信公众平台配置 downloadFile 合法域名：

- `books.google.com`
- `www.googleapis.com`
- `openlibrary.org`
- `covers.openlibrary.org`

云函数访问外部 API 不依赖小程序 request 合法域名，但客户端 `<image>` 加载远程封面需要 downloadFile 域名配置。

若无法配置域名，短期策略：

- 仍返回真实书名/作者。
- 封面先显示本地默认占位。
- 后续再做客户端或后台异步封面入云存储。

---

## 错误处理

### ISBN 未命中

返回：

```js
{
  code: 404,
  msg: '未识别该 ISBN，可手动补录',
  data: { isbn, lookupStatus: 'manual_needed' }
}
```

前端展示手动补录入口。

### 外部书源超时

- 记录 provider 名称和错误。
- 继续尝试下一个 provider。
- 全部失败时返回缓存/内置结果；无结果则返回 `manual_needed`。

### 封面加载失败

不影响图书录入；只回退封面展示。

---

## 测试与验证

本地静态验证：

- Google/Open Library provider 字段归一化测试。
- ISBN 查询命中真实书源测试。
- 搜索合并去重测试。
- 非内置 ISBN 不再生成假书测试。
- 封面显示顺序测试。

云端验证：

```js
wx.cloud.callFunction({
  name: 'api',
  data: { action: 'books.isbn', data: { isbn: '9787533256739' } }
})
```

另选 2 个非内置 ISBN 做验证：

- 应返回真实图书信息，或明确 `manual_needed`。
- 不应返回“图书（后6位）”。

体验版验证：

- 书架扫码内置 ISBN：返回真实信息与封面。
- 书架扫码非内置 ISBN：优先返回外部书源真实信息。
- 搜索中文书名：有结果时可加入书架。
- 搜索英文书名：可返回外文结果。
- 远程封面失败时不阻断录入。

---

## 不做事项

- 不接付费国内 API。
- 不在云函数中下载封面。
- 不改方案 A。
- 不做批量真实封面替换。
- 不做复杂后台任务队列。

---

## 风险

- 免费书源对中文童书覆盖不稳定。
- Google/Open Library 在国内云函数环境可能偶发超时。
- 远程封面域名未配置时，体验版图片仍可能不显示。
- Google Books 封面质量和字段完整度不稳定。

应对策略：

- 双 provider 兜底。
- 超时快速失败。
- 云数据库缓存命中后减少外部依赖。
- 保留内置目录和手动补录入口。
