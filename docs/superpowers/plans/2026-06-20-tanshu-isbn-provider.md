# 探数 ISBN Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 探数 ISBN 数据查询 as the first external ISBN provider without committing the API key.

**Architecture:** Create a focused `tanshu.js` provider under `cloudfunctions/api/lib/bookProviders/`. It reads `TANSHU_API_KEY` from cloud function environment variables, normalizes 探数 response fields into the existing book metadata shape, and is used before Google Books/Open Library for ISBN lookups only.

**Tech Stack:** WeChat cloud function Node.js, existing `getJson()` HTTPS helper, existing provider orchestrator, plain Node.js test scripts.

---

### Task 1: Provider Unit Test

**Files:**
- Create: `scripts/test-tanshu-provider.js`
- Create/Modify later: `cloudfunctions/api/lib/bookProviders/tanshu.js`

- [ ] **Step 1: Write failing test**

Create `scripts/test-tanshu-provider.js` with a mocked HTTP helper. It must assert:
- no `TANSHU_API_KEY` returns `null`
- successful response maps `title/img/author/publisher/pubdate/price/summary` correctly
- provider does not implement keyword search to avoid wasting quota

- [ ] **Step 2: Run failing test**

Run: `node scripts/test-tanshu-provider.js`
Expected: fail because `cloudfunctions/api/lib/bookProviders/tanshu.js` does not exist.

### Task 2: Provider Implementation

**Files:**
- Create: `cloudfunctions/api/lib/bookProviders/tanshu.js`

- [ ] **Step 1: Implement `lookupByIsbn()`**

Read `process.env.TANSHU_API_KEY`; if missing, return `null`. Query `https://api2.tanshuapi.com/api/isbn_base/v1/index?key=...&isbn=...` with a 2500ms timeout.

- [ ] **Step 2: Implement normalization**

Map 探数字段 to existing shape:
- `title` → `title`
- `img` → `coverRemote`
- `author` → `author`
- `publisher` → `publisher`
- `pubdate` → `pubDate`
- `summary` → `summary`
- `price` → append to `summary` only if needed later; no price write for MVP provider
- `source`/`coverSource` → `tanshu`

- [ ] **Step 3: Run provider test**

Run: `node scripts/test-tanshu-provider.js`
Expected: pass.

### Task 3: Orchestrator Integration

**Files:**
- Modify: `cloudfunctions/api/lib/bookProviders/index.js`
- Modify: `scripts/test-book-provider-strategy.js`

- [ ] **Step 1: Put 探数 first**

Import `tanshu` and make provider order:
1. `tanshu`
2. `google_books`
3. `open_library`

- [ ] **Step 2: Keep keyword search safe**

If a provider has no `searchByKeyword`, skip it in search orchestration instead of throwing.

- [ ] **Step 3: Run strategy test**

Run: `node scripts/test-book-provider-strategy.js`
Expected: pass.

### Task 4: Verification and Deployment

**Files:**
- Modify: `README.md`
- Modify: `/Users/xumanna/Documents/tushupiaoliu/项目交接文档.md`

- [ ] **Step 1: Run full local tests**

Run all existing script tests and `node --check`.

- [ ] **Step 2: Run live 探数 smoke test**

Run with local env var only:
`TANSHU_API_KEY=<secret> node -e "..."`.
Expected: ISBN `9787533256739` returns Chinese book data.

- [ ] **Step 3: Deploy `api`**

Deploy cloud function after `TANSHU_API_KEY` is configured in the cloud environment.

- [ ] **Step 4: Update docs**

Record provider order, env var name, quota limitation, and cover domain `img.tanshuapi.com`.
