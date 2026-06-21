# Async Cover Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cache remote book covers returned by external ISBN sources into WeChat Cloud Storage without blocking scan/search flows.

**Architecture:** The mini program downloads remote cover images in the background, uploads them to `book-covers/{isbn}.{ext}`, and calls `books.updateCover` to persist the cloud file ID. Cloud functions do not download images, so book lookup remains fast and avoids cloud-function timeout risk.

**Tech Stack:** WeChat mini program `wx.downloadFile`, `wx.cloud.uploadFile`, existing `api` cloud function action `books.updateCover`, Node.js script tests.

---

### Task 1: Cover Cache Utility

**Files:**
- Modify: `miniprogram/utils/coverRefresh.js`
- Create: `scripts/test-cover-refresh-remote.js`

- [x] Add test coverage for cache eligibility, HTTPS normalization, cloud path generation, download/upload/update flow, failure skip, and batch limit.
- [x] Implement `cacheRemoteCover(book)` and `cacheRemoteCovers(books, limit)`.
- [x] Keep failures non-blocking and log-only.

### Task 2: Page Integration

**Files:**
- Modify: `miniprogram/pages/shelf/scan.js`
- Modify: `miniprogram/pages/shelf/search.js`

- [x] Start `cacheRemoteCover(book)` after successful scan lookup.
- [x] Start `cacheRemoteCovers(res.list)` after successful search lookup.
- [x] Do not await cache tasks; UI remains responsive.

### Task 3: Verification

**Files:**
- Modify: `README.md`
- Modify: `/Users/xumanna/Documents/tushupiaoliu/项目交接文档.md`

- [ ] Run `node scripts/test-cover-refresh-remote.js`.
- [ ] Run all script tests and `node --check`.
- [ ] Deploy the mini program package after confirming downloadFile legal domains include `static.tanshuapi.com` and `img.tanshuapi.com`.
