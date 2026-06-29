const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const shelfJs = read('miniprogram/pages/shelf/index.js');
const shelfWxml = read('miniprogram/pages/shelf/index.wxml');
const { SHELF_CATEGORY_LABELS } = require('../cloudfunctions/api/lib/bookCategory');
const { BOOK_CLASSES } = require('../miniprogram/utils/util');

assert.ok(
  shelfJs.includes('bookClassLabel')
    && shelfJs.includes("return (item.bookClassLabel || '其他').trim()")
    && !shelfJs.includes('item.displayCategory || item.sourceCategory'),
  'shelf category chips should filter by canonical bookClassLabel only',
);
assert.ok(
  shelfJs.includes('shelfFullLoadDone')
    && shelfJs.includes('categoryFilterPending')
    && (shelfJs.includes("activeCategory !== 'all' && !shelfFullLoadDone")
      || shelfJs.includes('shouldDeferCategoryList')),
  'shelf should defer category filtering until the full shelf list is loaded',
);
assert.ok(
  shelfJs.includes('mergeShelfBookRows')
    && (shelfJs.includes('mergeOnly: true') || shelfJs.includes('mergeOnly: !reset')),
  'deferred cover enrichment should merge into the loaded shelf list instead of shrinking it',
);
assert.ok(
  shelfJs.includes('shelfListCacheKey')
    && shelfJs.includes('readPageCache(cacheKey)')
    && shelfJs.includes('writePageCache(cacheKey'),
  'shelf list cache should be scoped to active filters',
);
assert.ok(shelfWxml.includes('categoryFilterPending'), 'shelf should show a pending state while category data loads');
assert.ok(
  read('miniprogram/pages/book/detail.js').includes('nextItem.bookClassLabel')
    && read('miniprogram/pages/book/detail.js').includes('category: categoryLabel'),
  'book detail should keep shelf bookClass when refreshing metadata',
);
assert.deepStrictEqual(
  Object.values(SHELF_CATEGORY_LABELS),
  BOOK_CLASSES.map((item) => item.label),
  'backend shelf category labels should match frontend chip labels',
);

console.log('shelf category filter contract ok');
