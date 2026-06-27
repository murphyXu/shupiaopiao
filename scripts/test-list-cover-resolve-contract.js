const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const apiUtils = read('miniprogram/utils/api.js');
const coverUtils = read('miniprogram/utils/cover.js');
const coverRefresh = read('miniprogram/utils/coverRefresh.js');
const shelfHandler = read('cloudfunctions/api/handlers/shelf.js');
const shelfIndexJs = read('miniprogram/pages/shelf/index.js');
const shelfIndexWxml = read('miniprogram/pages/shelf/index.wxml');
const poolIndexWxml = read('miniprogram/pages/pool/index.wxml');
const { needsCoverResolve, displayCover } = require('../miniprogram/utils/cover');

assert.ok(apiUtils.includes('SHELF_COVER_ACTIONS') && apiUtils.includes('enrichShelfCovers'), 'shelf list should use the same cover enrichment pipeline as pool');
assert.ok(apiUtils.includes('resolveMissingCovers') && apiUtils.includes('coverResolveCache'), 'list APIs should backfill missing covers with one-time ISBN resolve cache');
assert.ok(apiUtils.includes('LIST_COVER_RESOLVE_LIMIT'), 'list cover ISBN resolve should stay capped per request');
assert.ok(apiUtils.includes('REMOTE_COVER_CACHE_MAX_PASSES'), 'list cover cache should process more than the first page of books');
assert.ok(coverUtils.includes('needsCoverResolve'), 'cover utils should detect books missing displayable covers');
assert.ok(!coverUtils.includes("getBookByIsbn(book.isbn, 'cover')"), 'cover error handler should not trigger ISBN provider lookup');
assert.ok(coverRefresh.includes('markCoversUpdated'), 'cover cache should mark global refresh when a cloud cover is stored');
assert.ok(shelfHandler.includes('formatDisplayBook'), 'shelf list should resolve coverRemote into display covers on the server');
assert.ok(shelfHandler.includes('cacheBooksForList'), 'shelf list should cache remote covers server-side before responding');
assert.ok(read('cloudfunctions/api/handlers/pool.js').includes('cacheBooksForList'), 'pool list should cache remote covers server-side before responding');
assert.ok(shelfIndexWxml.includes('binderror="onCoverError"') && shelfIndexJs.includes('onCoverError'), 'shelf cards should recover failed cover loads');
assert.ok(poolIndexWxml.includes('binderror="onCoverError"'), 'pool cards should keep cover error recovery');

assert.strictEqual(
  displayCover('local:9787559855022', '9787559855022', 'https://static.tanshuapi.com/a.jpg'),
  'https://static.tanshuapi.com/a.jpg',
  'displayCover should prefer coverRemote over local placeholder',
);
assert.strictEqual(needsCoverResolve({
  isbn: '9787559855022',
  cover: 'local:9787559855022',
  coverRemote: '',
}), true, 'local placeholder without coverRemote should trigger resolve');
assert.strictEqual(needsCoverResolve({
  isbn: '9787559855022',
  cover: 'https://static.tanshuapi.com/a.jpg',
  coverRemote: 'https://static.tanshuapi.com/a.jpg',
}), false, 'remote cover should not trigger resolve');

console.log('list cover resolve contract ok');
