# Booklist Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the方案 C booklist experience: double-column feed, shelf-first recommendations, cold-start fallback, generated 1000-topic content pool, and long-article detail with inline book entries.

**Architecture:** Keep generated booklist content in code instead of bulk seeding 1000 long documents into cloud database. Backend exposes `booklist.feed` and extends `booklist.detail`; frontend records lightweight local behavior signals and sends them with feed requests. Existing `booklists` collections remain compatible.

**Tech Stack:** WeChat Mini Program, CloudBase cloud function `api`, CommonJS, cloud database `books/shelf_books/booklists/booklist_items`, local storage via `wx.setStorageSync`.

---

### Task 1: Generated Booklist Domain

**Files:**
- Create: `cloudfunctions/api/lib/booklistContent.js`
- Test: `scripts/test-booklist-content.js`

- [ ] Write failing tests for 1000 generated cards, diverse styles, cold-start scoring, and article sections with inline book slots.
- [ ] Run `node scripts/test-booklist-content.js` and verify it fails because module is missing.
- [ ] Implement deterministic 1000-topic pool from curated seeds, themes, age ranges, scenes, and tones.
- [ ] Run `node scripts/test-booklist-content.js` and verify it passes.

### Task 2: Backend Feed and Detail API

**Files:**
- Modify: `cloudfunctions/api/handlers/booklist.js`
- Modify: `cloudfunctions/api/index.js`
- Test: `scripts/test-booklist-handler-shape.js`

- [ ] Write failing tests for feed shape and detail shape using generated content helpers.
- [ ] Add `booklist.feed` route.
- [ ] Extend detail to return generated long article when id starts with `gen-` while preserving existing DB detail.
- [ ] Run targeted tests.

### Task 3: Frontend Behavior Signals

**Files:**
- Create: `miniprogram/utils/booklistSignals.js`
- Modify: `miniprogram/pages/shelf/search.js`
- Modify: `miniprogram/pages/book/catalog.js`
- Modify: `miniprogram/pages/booklist/detail.js`

- [ ] Add local recent keyword/book/list signal helpers.
- [ ] Record search keyword after successful search attempt.
- [ ] Record catalog/detail browsing after book detail loads.
- [ ] Record booklist browsing on detail open.

### Task 4: Double-Column Feed UI

**Files:**
- Modify: `miniprogram/utils/api.js`
- Replace: `miniprogram/pages/booklist/index.js`
- Replace: `miniprogram/pages/booklist/index.wxml`
- Replace: `miniprogram/pages/booklist/index.wxss`

- [ ] Add `getBooklistFeed` API wrapper.
- [ ] Load feed with local signals and append pagination.
- [ ] Render double-column cards with tone/age/theme labels and reason text.
- [ ] Keep empty/error fallback simple.

### Task 5: Long Article Detail UI

**Files:**
- Modify: `miniprogram/utils/api.js`
- Replace: `miniprogram/pages/booklist/detail.wxml`
- Replace: `miniprogram/pages/booklist/detail.wxss`

- [ ] Normalize inline books and related books in API response.
- [ ] Render article sections, inline book cards, footer books, and related list links.
- [ ] Preserve `加入想读` and `去漂流找同款` actions.

### Task 6: Verification and Documentation

**Files:**
- Modify: `/Users/xumanna/Documents/tushupiaoliu/项目交接文档.md`

- [ ] Run targeted tests and `node --check`.
- [ ] Deploy `api` and upload a new mini-program development version.
- [ ] Update handoff document with progress, validation, and caveats.
