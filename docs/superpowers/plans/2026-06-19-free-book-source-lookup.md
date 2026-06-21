# 免费书源真实识别 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 接入 Google Books + Open Library 免费书源，让书架扫码和搜索优先返回真实图书信息、真实封面 URL，并保留云数据库缓存和内置书目兜底。

**Architecture:** 云函数 `api` 增加 provider 适配层，统一归一化外部书源字段；`bookLookup` 改为缓存 → 内置目录 → 外部书源 → 手动补录状态。前端扩展封面展示和扫码/搜索状态，不再对非内置 ISBN 生成假书名。

**Tech Stack:** 微信云开发云函数 Node.js 16、`wx-server-sdk`、Node 内置 `https`、小程序原生 WXML/WXSS/JS、无新增 npm 依赖。

**Project Constraint:** 不提交 git commit；实施完成后只汇报变更和验证结果。

---

## File Map

- Create: `cloudfunctions/api/lib/bookProviders/http.js` — 带超时的 JSON GET 工具。
- Create: `cloudfunctions/api/lib/bookProviders/googleBooks.js` — Google Books 查询与字段归一化。
- Create: `cloudfunctions/api/lib/bookProviders/openLibrary.js` — Open Library 查询与字段归一化。
- Create: `cloudfunctions/api/lib/bookProviders/index.js` — provider 编排、失败兜底、去重。
- Create: `cloudfunctions/api/lib/bookLookupPolicy.js` — 纯函数：去重、字段合并、手动补录结果。
- Modify: `cloudfunctions/api/lib/bookLookup.js` — 接入 provider 编排，取消默认假书名落库。
- Modify: `cloudfunctions/api/lib/db.js` — `formatBook()` 输出 `coverRemote/source/lookupStatus/publisher/pubDate`。
- Modify: `cloudfunctions/api/handlers/books.js` — ISBN 未命中返回 `manual_needed` 数据；搜索分页保留。
- Modify: `cloudfunctions/api/lib/utils.js` — `fail(code, msg, data = null)` 兼容业务数据。
- Modify: `miniprogram/utils/cover.js` — 支持 `coverRemote` 展示顺序和远程封面失败回退。
- Modify: `miniprogram/utils/api.js` — `normalizeBook()` 传递 `coverRemote/source/lookupStatus`。
- Modify: `miniprogram/pages/shelf/scan.js` / `.wxml` / `.wxss` — 增加识别状态、来源、未识别提示。
- Modify: `miniprogram/pages/shelf/search.js` / `.wxml` / `.wxss` — 增加来源展示、远程封面错误兜底。
- Modify: `README.md` — 增加免费书源和合法域名说明。
- Modify: `/Users/xumanna/Documents/tushupiaoliu/项目交接文档.md` — 更新 §3、§6、§7。
- Create: `scripts/test-book-provider-normalization.js` — provider 字段归一化测试。
- Create: `scripts/test-book-lookup-policy.js` — 去重、手动补录、合并策略测试。
- Create: `scripts/test-cover-normalization.js` — 前端封面优先级测试。

---

### Task 1: Provider Normalization

**Files:**
- Create: `scripts/test-book-provider-normalization.js`
- Create: `cloudfunctions/api/lib/bookProviders/googleBooks.js`
- Create: `cloudfunctions/api/lib/bookProviders/openLibrary.js`

- [ ] **Step 1: Write failing normalization test**

Create `scripts/test-book-provider-normalization.js`:

```js
const assert = require('assert');
const {
  normalizeGoogleVolume,
} = require('../cloudfunctions/api/lib/bookProviders/googleBooks');
const {
  normalizeOpenLibraryBook,
  normalizeOpenLibrarySearchDoc,
} = require('../cloudfunctions/api/lib/bookProviders/openLibrary');

const googleVolume = {
  id: 'google-1',
  volumeInfo: {
    title: 'Guess How Much I Love You',
    authors: ['Sam McBratney'],
    publisher: 'Walker Books',
    publishedDate: '2007',
    description: 'A warm parent-child picture book.',
    categories: ['Juvenile Fiction'],
    industryIdentifiers: [
      { type: 'ISBN_10', identifier: '1406300405' },
      { type: 'ISBN_13', identifier: '9781406300406' },
    ],
    imageLinks: {
      thumbnail: 'http://books.google.com/books/content?id=google-1&printsec=frontcover&img=1&zoom=1',
    },
  },
};

const googleBook = normalizeGoogleVolume(googleVolume);
assert.strictEqual(googleBook.isbn, '9781406300406');
assert.strictEqual(googleBook.isbn10, '1406300405');
assert.strictEqual(googleBook.title, 'Guess How Much I Love You');
assert.strictEqual(googleBook.author, 'Sam McBratney');
assert.strictEqual(googleBook.publisher, 'Walker Books');
assert.strictEqual(googleBook.pubDate, '2007');
assert.strictEqual(googleBook.source, 'google_books');
assert.strictEqual(googleBook.sourceId, 'google-1');
assert.ok(googleBook.coverRemote.startsWith('https://books.google.com/'));

const openLibraryBook = normalizeOpenLibraryBook('ISBN:9781406300406', {
  title: 'Guess How Much I Love You',
  authors: [{ name: 'Sam McBratney' }],
  publishers: [{ name: 'Walker Books' }],
  publish_date: '2007',
  cover: { medium: 'https://covers.openlibrary.org/b/id/12345-M.jpg' },
  subjects: [{ name: 'Juvenile fiction' }],
});
assert.strictEqual(openLibraryBook.isbn, '9781406300406');
assert.strictEqual(openLibraryBook.title, 'Guess How Much I Love You');
assert.strictEqual(openLibraryBook.author, 'Sam McBratney');
assert.strictEqual(openLibraryBook.source, 'open_library');
assert.strictEqual(openLibraryBook.coverRemote, 'https://covers.openlibrary.org/b/id/12345-M.jpg');

const searchDoc = normalizeOpenLibrarySearchDoc({
  isbn: ['9781406300406', '1406300405'],
  title: 'Guess How Much I Love You',
  author_name: ['Sam McBratney'],
  publisher: ['Walker Books'],
  first_publish_year: 2007,
  cover_i: 12345,
  key: '/works/OL123W',
});
assert.strictEqual(searchDoc.isbn, '9781406300406');
assert.strictEqual(searchDoc.isbn10, '1406300405');
assert.strictEqual(searchDoc.sourceId, '/works/OL123W');
assert.strictEqual(searchDoc.coverRemote, 'https://covers.openlibrary.org/b/id/12345-M.jpg');

console.log('book provider normalization ok');
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node scripts/test-book-provider-normalization.js
```

Expected: FAIL with `Cannot find module '../cloudfunctions/api/lib/bookProviders/googleBooks'`.

- [ ] **Step 3: Implement Google Books normalizer and lookup wrapper**

Create `cloudfunctions/api/lib/bookProviders/googleBooks.js`:

```js
const { getJson } = require('./http');
const { normalizeIsbn } = require('../bookCatalog');

const GOOGLE_BOOKS_ENDPOINT = 'https://www.googleapis.com/books/v1/volumes';

function httpsImage(url) {
  if (!url) return '';
  return String(url).replace(/^http:\/\//, 'https://');
}

function pickIdentifiers(identifiers = []) {
  const result = { isbn: '', isbn10: '' };
  identifiers.forEach((item) => {
    const clean = normalizeIsbn(item.identifier);
    if (item.type === 'ISBN_13' && clean.length === 13) result.isbn = clean;
    if (item.type === 'ISBN_10' && clean.length === 10) result.isbn10 = clean;
  });
  if (!result.isbn && result.isbn10) result.isbn = result.isbn10;
  return result;
}

function normalizeGoogleVolume(volume) {
  const info = volume.volumeInfo || {};
  const ids = pickIdentifiers(info.industryIdentifiers || []);
  if (!ids.isbn || !info.title) return null;
  return {
    isbn: ids.isbn,
    isbn10: ids.isbn10,
    title: info.title || '',
    author: (info.authors || []).join('、') || '未知作者',
    publisher: info.publisher || '',
    pubDate: info.publishedDate || '',
    summary: info.description || '',
    category: (info.categories && info.categories[0]) || '童书',
    ageRange: '',
    coverRemote: httpsImage((info.imageLinks || {}).thumbnail || (info.imageLinks || {}).smallThumbnail || ''),
    coverSource: 'google_books',
    source: 'google_books',
    sourceId: volume.id || '',
    lookupStatus: 'found',
  };
}

async function lookupByIsbn(isbn) {
  const url = `${GOOGLE_BOOKS_ENDPOINT}?q=isbn:${encodeURIComponent(isbn)}&maxResults=1`;
  const data = await getJson(url, 1200);
  const item = (data.items || [])[0];
  return item ? normalizeGoogleVolume(item) : null;
}

async function searchByKeyword(keyword, limit = 10) {
  const url = `${GOOGLE_BOOKS_ENDPOINT}?q=${encodeURIComponent(keyword)}&printType=books&maxResults=${limit}`;
  const data = await getJson(url, 1200);
  return (data.items || []).map(normalizeGoogleVolume).filter(Boolean);
}

module.exports = {
  normalizeGoogleVolume,
  lookupByIsbn,
  searchByKeyword,
};
```

- [ ] **Step 4: Implement Open Library normalizer and lookup wrapper**

Create `cloudfunctions/api/lib/bookProviders/openLibrary.js`:

```js
const { getJson } = require('./http');
const { normalizeIsbn } = require('../bookCatalog');

function firstName(list) {
  return Array.isArray(list) && list[0] ? (list[0].name || list[0]) : '';
}

function pickIsbns(isbns = []) {
  const result = { isbn: '', isbn10: '' };
  isbns.map(normalizeIsbn).forEach((clean) => {
    if (!result.isbn && clean.length === 13) result.isbn = clean;
    if (!result.isbn10 && clean.length === 10) result.isbn10 = clean;
  });
  if (!result.isbn && result.isbn10) result.isbn = result.isbn10;
  return result;
}

function coverById(coverId) {
  return coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : '';
}

function normalizeOpenLibraryBook(bibKey, raw) {
  const isbn = normalizeIsbn(String(bibKey || '').replace(/^ISBN:/, ''));
  if (!isbn || !raw || !raw.title) return null;
  return {
    isbn,
    isbn10: isbn.length === 10 ? isbn : '',
    title: raw.title || '',
    author: (raw.authors || []).map((a) => a.name).filter(Boolean).join('、') || '未知作者',
    publisher: firstName(raw.publishers),
    pubDate: raw.publish_date || '',
    summary: raw.notes || '',
    category: firstName(raw.subjects) || '童书',
    ageRange: '',
    coverRemote: (raw.cover && (raw.cover.medium || raw.cover.large || raw.cover.small)) || '',
    coverSource: 'open_library',
    source: 'open_library',
    sourceId: bibKey || '',
    lookupStatus: 'found',
  };
}

function normalizeOpenLibrarySearchDoc(doc) {
  const ids = pickIsbns(doc.isbn || []);
  if (!ids.isbn || !doc.title) return null;
  return {
    isbn: ids.isbn,
    isbn10: ids.isbn10,
    title: doc.title || '',
    author: (doc.author_name || []).join('、') || '未知作者',
    publisher: (doc.publisher || [])[0] || '',
    pubDate: doc.first_publish_year ? String(doc.first_publish_year) : '',
    summary: '',
    category: (doc.subject || [])[0] || '童书',
    ageRange: '',
    coverRemote: coverById(doc.cover_i),
    coverSource: 'open_library',
    source: 'open_library',
    sourceId: doc.key || '',
    lookupStatus: 'found',
  };
}

async function lookupByIsbn(isbn) {
  const bibKey = `ISBN:${isbn}`;
  const url = `https://openlibrary.org/api/books?bibkeys=${bibKey}&jscmd=data&format=json`;
  const data = await getJson(url, 1200);
  return normalizeOpenLibraryBook(bibKey, data[bibKey]);
}

async function searchByKeyword(keyword, limit = 10) {
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(keyword)}&limit=${limit}`;
  const data = await getJson(url, 1200);
  return (data.docs || []).map(normalizeOpenLibrarySearchDoc).filter(Boolean);
}

module.exports = {
  normalizeOpenLibraryBook,
  normalizeOpenLibrarySearchDoc,
  lookupByIsbn,
  searchByKeyword,
};
```

- [ ] **Step 5: Run normalization test to verify progress**

Run:

```bash
node scripts/test-book-provider-normalization.js
```

Expected: FAIL with `Cannot find module './http'`. This confirms parser files load and the remaining dependency is the HTTP helper.

---

### Task 2: HTTP Helper and Provider Orchestration

**Files:**
- Create: `cloudfunctions/api/lib/bookProviders/http.js`
- Create: `cloudfunctions/api/lib/bookProviders/index.js`
- Create: `scripts/test-book-lookup-policy.js`
- Create: `cloudfunctions/api/lib/bookLookupPolicy.js`

- [ ] **Step 1: Write failing policy test**

Create `scripts/test-book-lookup-policy.js`:

```js
const assert = require('assert');
const {
  dedupeBooks,
  mergeBookMeta,
  manualNeeded,
} = require('../cloudfunctions/api/lib/bookLookupPolicy');

const duplicateResults = dedupeBooks([
  { isbn: '9781406300406', title: 'Guess How Much I Love You', author: 'Sam McBratney', source: 'google_books' },
  { isbn: '9781406300406', title: 'Guess How Much I Love You', author: 'Sam McBratney', source: 'open_library' },
  { isbn: '', title: 'Guess How Much I Love You', author: 'Sam McBratney', source: 'manual' },
]);
assert.strictEqual(duplicateResults.length, 1);
assert.strictEqual(duplicateResults[0].source, 'google_books');

const merged = mergeBookMeta(
  { isbn: '9781406300406', title: 'Old', author: 'Old Author', cover: 'cloud://abc', source: 'cache' },
  { isbn: '9781406300406', title: 'New', author: 'New Author', coverRemote: 'https://books.google.com/cover.jpg', source: 'google_books' }
);
assert.strictEqual(merged.title, 'Old');
assert.strictEqual(merged.cover, 'cloud://abc');
assert.strictEqual(merged.coverRemote, 'https://books.google.com/cover.jpg');

const manual = manualNeeded('9780000000002');
assert.strictEqual(manual.lookupStatus, 'manual_needed');
assert.strictEqual(manual.isbn, '9780000000002');
assert.strictEqual(manual.title, '');

console.log('book lookup policy ok');
```

- [ ] **Step 2: Run policy test to verify it fails**

Run:

```bash
node scripts/test-book-lookup-policy.js
```

Expected: FAIL with `Cannot find module '../cloudfunctions/api/lib/bookLookupPolicy'`.

- [ ] **Step 3: Implement HTTP helper**

Create `cloudfunctions/api/lib/bookProviders/http.js`:

```js
const https = require('https');

function getJson(url, timeoutMs = 1200) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'shupiaopiao-cloud/1.0',
        Accept: 'application/json',
      },
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP_${res.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(new Error('INVALID_JSON'));
        }
      });
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('REQUEST_TIMEOUT'));
    });
    req.on('error', reject);
  });
}

module.exports = { getJson };
```

- [ ] **Step 4: Implement lookup policy**

Create `cloudfunctions/api/lib/bookLookupPolicy.js`:

```js
const { normalizeIsbn } = require('./bookCatalog');

function bookKey(book) {
  const isbn = normalizeIsbn(book.isbn);
  if (isbn) return `isbn:${isbn}`;
  return `text:${String(book.title || '').trim().toLowerCase()}|${String(book.author || '').trim().toLowerCase()}`;
}

function dedupeBooks(books) {
  const map = new Map();
  books.filter(Boolean).forEach((book) => {
    const key = bookKey(book);
    if (!key || key === 'text:|') return;
    if (!map.has(key)) map.set(key, book);
  });
  return [...map.values()];
}

function mergeBookMeta(existing = {}, incoming = {}) {
  return {
    ...incoming,
    ...existing,
    coverRemote: existing.coverRemote || incoming.coverRemote || '',
    coverSource: existing.coverSource || incoming.coverSource || incoming.source || '',
    source: existing.source || incoming.source || 'cache',
    lookupStatus: existing.lookupStatus || incoming.lookupStatus || 'found',
  };
}

function manualNeeded(isbn) {
  return {
    isbn: normalizeIsbn(isbn),
    isbn10: '',
    title: '',
    author: '',
    publisher: '',
    pubDate: '',
    summary: '',
    category: '童书',
    ageRange: '',
    cover: '',
    coverRemote: '',
    coverSource: '',
    source: 'manual',
    sourceId: '',
    lookupStatus: 'manual_needed',
  };
}

module.exports = {
  dedupeBooks,
  mergeBookMeta,
  manualNeeded,
};
```

- [ ] **Step 5: Implement provider orchestration**

Create `cloudfunctions/api/lib/bookProviders/index.js`:

```js
const googleBooks = require('./googleBooks');
const openLibrary = require('./openLibrary');
const { dedupeBooks } = require('../bookLookupPolicy');

const PROVIDERS = [googleBooks, openLibrary];

async function tryProvider(providerName, operation) {
  try {
    return await operation();
  } catch (err) {
    console.warn(`[bookProviders] ${providerName}`, err.message || err);
    return null;
  }
}

async function lookupByIsbn(isbn) {
  for (const provider of PROVIDERS) {
    const result = await tryProvider(provider.name || provider.constructor.name, () => provider.lookupByIsbn(isbn));
    if (result) return result;
  }
  return null;
}

async function searchByKeyword(keyword, limit = 10) {
  const results = [];
  for (const provider of PROVIDERS) {
    const list = await tryProvider(provider.name || provider.constructor.name, () => provider.searchByKeyword(keyword, limit));
    if (Array.isArray(list)) results.push(...list);
  }
  return dedupeBooks(results).slice(0, limit);
}

module.exports = {
  lookupByIsbn,
  searchByKeyword,
};
```

- [ ] **Step 6: Run provider and policy tests**

Run:

```bash
node scripts/test-book-provider-normalization.js
node scripts/test-book-lookup-policy.js
```

Expected: both PASS and print:

```text
book provider normalization ok
book lookup policy ok
```

---

### Task 3: Backend Lookup Integration

**Files:**
- Modify: `cloudfunctions/api/lib/bookLookup.js`
- Modify: `cloudfunctions/api/lib/db.js`
- Modify: `cloudfunctions/api/handlers/books.js`
- Modify: `cloudfunctions/api/lib/utils.js`

- [ ] **Step 1: Add failing contract check for fake-book removal**

Create temporary command expectation:

```bash
node -e "const fs=require('fs'); const src=fs.readFileSync('cloudfunctions/api/lib/bookLookup.js','utf8'); if(src.includes('stubForIsbn(clean)')) throw new Error('stub fallback still active');"
```

Expected before implementation: FAIL with `stub fallback still active`.

- [ ] **Step 2: Update `fail()` to carry data**

Modify `cloudfunctions/api/lib/utils.js`:

```js
function fail(code, msg, data = null) {
  return { code, msg, data };
}
```

Keep existing callers compatible because the third argument defaults to `null`.

- [ ] **Step 3: Extend `formatBook()`**

Modify `cloudfunctions/api/lib/db.js` `formatBook()`:

```js
function formatBook(b) {
  return {
    id: b._id,
    isbn: b.isbn,
    isbn10: b.isbn10 || '',
    title: b.title,
    author: b.author,
    publisher: b.publisher || '',
    pubDate: b.pubDate || '',
    cover: b.cover,
    coverRemote: b.coverRemote || '',
    coverSource: b.coverSource || '',
    summary: b.summary,
    category: b.category,
    ageRange: b.ageRange,
    source: b.source || 'cache',
    sourceId: b.sourceId || '',
    lookupStatus: b.lookupStatus || 'found',
  };
}
```

- [ ] **Step 4: Integrate providers into `bookLookup.js`**

Modify imports in `cloudfunctions/api/lib/bookLookup.js`:

```js
const providers = require('./bookProviders');
const { mergeBookMeta, manualNeeded } = require('./bookLookupPolicy');
const {
  normalizeIsbn, isValidIsbn, findInCatalog, searchCatalog,
} = require('./bookCatalog');
```

Replace `upsertBook()` doc construction with:

```js
const cover = (existing[0] && existing[0].cover && existing[0].cover.startsWith('cloud://'))
  ? existing[0].cover
  : (meta.cover || (meta.coverRemote ? meta.coverRemote : `local:${isbn}`));

const doc = {
  isbn,
  isbn10: meta.isbn10 || '',
  title: meta.title || '未知书名',
  author: meta.author || '未知作者',
  publisher: meta.publisher || '',
  pubDate: meta.pubDate || '',
  cover,
  coverRemote: meta.coverRemote || '',
  coverSource: meta.coverSource || meta.source || '',
  summary: meta.summary || '',
  category: meta.category || '童书',
  ageRange: meta.ageRange || '',
  source: meta.source || 'catalog',
  sourceId: meta.sourceId || '',
  lookupStatus: meta.lookupStatus || 'found',
  updatedAt: nowIso(),
};
```

Replace `resolveByIsbn()` fallback section:

```js
const catalog = findInCatalog(clean);
if (catalog) return upsertBook(db, { ...catalog, cover: `local:${catalog.isbn}`, source: 'catalog', lookupStatus: 'found' });

const external = await providers.lookupByIsbn(clean);
if (external) return upsertBook(db, external);

return manualNeeded(clean);
```

Update `searchBooks()` after catalog merge:

```js
const externalBooks = await providers.searchByKeyword(kw, size);
externalBooks.forEach((meta) => {
  if (!map.has(meta.isbn)) map.set(meta.isbn, meta);
});
```

Ensure upsert loop skips `manual_needed`:

```js
const toUpsert = merged.filter((b) => !b._id && b.lookupStatus !== 'manual_needed').slice(0, 10);
```

- [ ] **Step 5: Update `books.byIsbn()` manual-needed behavior**

Modify `cloudfunctions/api/handlers/books.js`:

```js
const book = await resolveByIsbn(db, clean);
if (!book || book.lookupStatus === 'manual_needed') {
  return fail(404, '未识别该 ISBN，可手动补录', book || { isbn: clean, lookupStatus: 'manual_needed' });
}
return ok(formatBook(book));
```

- [ ] **Step 6: Run backend checks**

Run:

```bash
node scripts/test-book-provider-normalization.js
node scripts/test-book-lookup-policy.js
node -e "const fs=require('fs'); const src=fs.readFileSync('cloudfunctions/api/lib/bookLookup.js','utf8'); if(src.includes('stubForIsbn(clean)')) throw new Error('stub fallback still active'); console.log('stub fallback removed');"
node --check cloudfunctions/api/lib/bookLookup.js
node --check cloudfunctions/api/handlers/books.js
node --check cloudfunctions/api/lib/db.js
node --check cloudfunctions/api/lib/utils.js
```

Expected: all PASS; final static check prints `stub fallback removed`.

---

### Task 4: Frontend Cover and API Normalization

**Files:**
- Create: `scripts/test-cover-normalization.js`
- Modify: `miniprogram/utils/cover.js`
- Modify: `miniprogram/utils/api.js`

- [ ] **Step 1: Write failing cover normalization test**

Create `scripts/test-cover-normalization.js`:

```js
const assert = require('assert');
const {
  displayCover,
  normalizeBook,
  onCoverError,
} = require('../miniprogram/utils/cover');

assert.strictEqual(
  displayCover('', '9780000000002', 'https://books.google.com/books/content?id=x&img=1'),
  'https://books.google.com/books/content?id=x&img=1'
);

const normalized = normalizeBook({
  isbn: '9780000000002',
  title: 'External Book',
  cover: '',
  coverRemote: 'https://covers.openlibrary.org/b/id/123-M.jpg',
});
assert.strictEqual(normalized.cover, 'https://covers.openlibrary.org/b/id/123-M.jpg');

const calls = [];
onCoverError.call({
  data: {
    books: [{ isbn: '9787533256739', coverRemote: 'https://bad.example/cover.jpg' }],
  },
  setData: (patch) => calls.push(patch),
}, {
  currentTarget: {
    dataset: { index: 0, listKey: 'books', isbn: '9787533256739' },
  },
});
assert.strictEqual(calls[0]['books[0].cover'], '/assets/covers/9787533256739.png');

console.log('cover normalization ok');
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node scripts/test-cover-normalization.js
```

Expected: FAIL because `displayCover()` does not yet accept `coverRemote`.

- [ ] **Step 3: Update `displayCover()` and `normalizeBook()`**

Modify `miniprogram/utils/cover.js`:

```js
function isRemoteCover(cover) {
  return typeof cover === 'string' && /^https?:\/\//.test(cover);
}

function displayCover(cover, isbn, coverRemote) {
  if (isCloudCover(cover)) return cover;
  if (isRemoteCover(coverRemote)) return coverRemote;
  if (isRemoteCover(cover)) return cover;
  if (typeof cover === 'string' && cover.startsWith('local:')) {
    const local = localCoverByIsbn(cover.slice(6));
    if (local) return local;
  }
  const local = localCoverByIsbn(isbn);
  if (local) return local;
  if (typeof cover === 'string' && cover.startsWith('/assets/')) return cover;
  return DEFAULT_COVER;
}

function normalizeBook(book) {
  if (!book || typeof book !== 'object') return book;
  return { ...book, cover: displayCover(book.cover, book.isbn, book.coverRemote) };
}
```

Export `isRemoteCover`.

- [ ] **Step 4: Run cover test**

Run:

```bash
node scripts/test-cover-normalization.js
```

Expected: PASS with `cover normalization ok`.

---

### Task 5: Scan Page UX

**Files:**
- Modify: `miniprogram/pages/shelf/scan.js`
- Modify: `miniprogram/pages/shelf/scan.wxml`
- Modify: `miniprogram/pages/shelf/scan.wxss`

- [ ] **Step 1: Add scan states in JS**

Modify `data` in `scan.js`:

```js
data: {
  book: null,
  estimate: {},
  category: 'want_read',
  categories: CATEGORIES,
  shelfId: null,
  lookupStatus: 'idle',
  scannedIsbn: '',
  lookupError: '',
},
```

In `doScan()` before API call:

```js
this.setData({
  book: null,
  shelfId: null,
  lookupStatus: 'loading',
  scannedIsbn: isbn,
  lookupError: '',
});
```

In success:

```js
this.setData({ book, estimate, lookupStatus: 'found' });
```

In catch:

```js
this.setData({
  lookupStatus: 'not_found',
  lookupError: e.message || '未识别该 ISBN，可手动补录',
});
wx.showToast({ title: this.data.lookupError, icon: 'none' });
```

Add method:

```js
manualAdd() {
  wx.showToast({ title: '手动补录入口将在下一步完善', icon: 'none' });
}
```

- [ ] **Step 2: Update scan WXML**

Add status blocks after scan card:

```xml
<view wx:if="{{lookupStatus === 'loading'}}" class="card status-card">正在识别 ISBN {{scannedIsbn}}...</view>

<view wx:if="{{lookupStatus === 'not_found'}}" class="card status-card">
  <view class="title">未识别该图书</view>
  <view class="muted">{{lookupError}}</view>
  <view class="muted">ISBN {{scannedIsbn}}</view>
  <view class="btn-primary" bindtap="doScan">重新扫码</view>
  <view class="btn-ghost" bindtap="manualAdd">手动补录</view>
</view>
```

Add source display in found block:

```xml
<view wx:if="{{book.source}}" class="badge">来源：{{book.source}}</view>
```

- [ ] **Step 3: Update scan WXSS**

Add:

```css
.status-card { text-align: center; }
.status-card .btn-primary { margin-top: 24rpx; }
.status-card .btn-ghost { margin-top: 16rpx; }
```

- [ ] **Step 4: Run syntax checks**

Run:

```bash
node --check miniprogram/pages/shelf/scan.js
```

Expected: PASS.

---

### Task 6: Search Page UX

**Files:**
- Modify: `miniprogram/pages/shelf/search.wxml`
- Modify: `miniprogram/pages/shelf/search.js`
- Modify: `miniprogram/pages/shelf/search.wxss`

- [ ] **Step 1: Add loading and manual state**

Modify `data` in `search.js`:

```js
data: { keyword: '', books: [], searched: false, loading: false },
```

In `doSearch()`:

```js
this.setData({ loading: true });
```

In finally:

```js
this.setData({ loading: false });
```

Add:

```js
manualAdd() {
  wx.showToast({ title: '手动补录入口将在下一步完善', icon: 'none' });
}
```

- [ ] **Step 2: Update search WXML result card**

Replace badge line:

```xml
<view class="badge">{{item.category || '童书'}} · {{item.ageRange || '全年龄'}} <text wx:if="{{item.source}}">· {{item.source}}</text></view>
```

Add loading and empty actions:

```xml
<view wx:if="{{loading}}" class="empty">正在搜索免费书源...</view>
<view wx:if="{{searched && !books.length && !loading}}" class="empty">
  <view>未找到相关图书</view>
  <view class="btn-ghost" bindtap="manualAdd">手动添加</view>
</view>
```

- [ ] **Step 3: Run syntax checks**

Run:

```bash
node --check miniprogram/pages/shelf/search.js
```

Expected: PASS.

---

### Task 7: Documentation and Handoff

**Files:**
- Modify: `README.md`
- Modify: `/Users/xumanna/Documents/tushupiaoliu/项目交接文档.md`

- [ ] **Step 1: Update `README.md`**

Add a section under “注意事项”:

```md
### 免费书源试跑

扫码/搜索真实识别使用 Google Books + Open Library 免费书源。云函数直接访问外部 API；客户端展示远程封面时，体验版/正式版需要在微信公众平台配置 downloadFile 合法域名：

- `books.google.com`
- `www.googleapis.com`
- `openlibrary.org`
- `covers.openlibrary.org`

未配置域名时，图书元数据仍可返回，但远程封面可能不显示。
```

- [ ] **Step 2: Update handoff document**

In `/Users/xumanna/Documents/tushupiaoliu/项目交接文档.md`:

- §3 添加免费书源试跑进展。
- §6 将“真实识别优先”列入 P0/P1 待办状态。
- §7 添加“免费书源域名与超时风险”踩坑记录。

- [ ] **Step 3: Run markdown placeholder scan**

Run:

```bash
rg -n 'TBD|TODO|待定|\\.\\.\\.' README.md docs/superpowers /Users/xumanna/Documents/tushupiaoliu/项目交接文档.md || true
```

Expected: no new placeholder entries from this feature.

---

### Task 8: Local Verification

**Files:**
- Verify only; no new files.

- [ ] **Step 1: Run all local tests**

Run:

```bash
node scripts/test-book-provider-normalization.js
node scripts/test-book-lookup-policy.js
node scripts/test-cover-normalization.js
```

Expected:

```text
book provider normalization ok
book lookup policy ok
cover normalization ok
```

- [ ] **Step 2: Run syntax checks**

Run:

```bash
fail=0
while IFS= read -r f; do
  node --check "$f" >/dev/null || fail=1
done < <(find miniprogram cloudfunctions -path '*/node_modules/*' -prune -o -name '*.js' -print)
test "$fail" -eq 0
```

Expected: exit code 0.

- [ ] **Step 3: Run resource checks**

Run:

```bash
node -e "const fs=require('fs'); const covers=fs.readdirSync('miniprogram/assets/covers').filter(f=>/\\.(png|jpe?g)$/i.test(f)); const icons=fs.readdirSync('miniprogram/assets/icons').filter(f=>/\\.(png|jpe?g)$/i.test(f)); if(covers.length<21) throw new Error('missing covers'); if(icons.length<8) throw new Error('missing icons'); console.log({covers:covers.length,icons:icons.length});"
```

Expected:

```text
{ covers: 21, icons: 8 }
```

---

### Task 9: Cloud Deployment and Experience Verification

**Files:**
- Deploy only; no local file changes.

- [ ] **Step 1: Deploy `api` cloud function**

Run:

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli cloud functions deploy --project /Users/xumanna/Documents/tushupiaoliu/shupiaopiao-cloud --env cloud1-6gngg7ipd8f073ed --names api --remote-npm-install
```

Expected: table shows `api success true`.

- [ ] **Step 2: Verify cloud function state**

Run:

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli cloud functions info --project /Users/xumanna/Documents/tushupiaoliu/shupiaopiao-cloud --env cloud1-6gngg7ipd8f073ed --names api
```

Expected: `api` status `Active`.

- [ ] **Step 3: Verify ISBN in DevTools Console**

Run in DevTools Console:

```js
wx.cloud.callFunction({
  name: 'api',
  data: { action: 'books.isbn', data: { isbn: '9781406300406' } }
}).then(res => console.log(JSON.stringify(res.result, null, 2)))
```

Expected: either `code: 0` with real title/author from free source, or `code: 404` with `data.lookupStatus: "manual_needed"`; it must not return `图书（630040）`.

- [ ] **Step 4: Verify search in DevTools Console**

Run:

```js
wx.cloud.callFunction({
  name: 'api',
  data: { action: 'books.search', data: { keyword: 'Guess How Much I Love You' } }
}).then(res => console.log(JSON.stringify(res.result, null, 2)))
```

Expected: `code: 0`, `data.list.length > 0`, at least one item has `source` equal to `google_books` or `open_library`.

- [ ] **Step 5: Upload development version**

Run:

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli upload --project /Users/xumanna/Documents/tushupiaoliu/shupiaopiao-cloud --version 1.0.2 --desc '免费书源试跑：扫码搜索真实识别'
```

Expected: upload succeeds and reports package size.

- [ ] **Step 6: True device checks**

Use preview/experience version:

- 书架 → 搜索英文书名 `Guess How Much I Love You` returns at least one result.
- 书架 → 搜索中文书名 `猜猜我有多爱你` still returns the existing catalog/cache result.
- 书架 → 扫 ISBN `9781406300406` returns a real title or explicit manual-needed state, not a fake placeholder.
- Remote cover displays if合法域名已配置； otherwise metadata still displays and cover fallback does not block adding.

---

## Self-Review Notes

- Spec coverage: provider 接入、缓存、去重、手动补录状态、封面优先级、域名风险、部署验证均有任务覆盖。
- Placeholder scan: plan does not use `TBD`/`TODO`/“待定” as implementation placeholders.
- Type consistency: provider result fields match `formatBook()` and `normalizeBook()` fields: `isbn/isbn10/title/author/publisher/pubDate/summary/category/ageRange/cover/coverRemote/coverSource/source/sourceId/lookupStatus`.
- Project constraint: no git commit step is included because handoff文档明确要求不要主动 commit。
