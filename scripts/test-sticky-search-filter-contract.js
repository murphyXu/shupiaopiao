const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const commonWxss = read('miniprogram/styles/common.wxss');
const safeAreaBehavior = read('miniprogram/behaviors/safe-area.js');
const systemJs = read('miniprogram/utils/system.js');
const poolWxml = read('miniprogram/pages/pool/index.wxml');
const shelfWxml = read('miniprogram/pages/shelf/index.wxml');

assert.ok(systemJs.includes('stickyTop'), 'system metrics should expose stickyTop for search/filter bars');
assert.ok(safeAreaBehavior.includes('stickyTop'), 'safe-area behavior should pass stickyTop to pages');
assert.ok(
  commonWxss.includes('.sticky-search-filter')
    && commonWxss.includes('position: sticky')
    && commonWxss.includes('background: #f4f8f5'),
  'shared sticky wrapper should pin search and filters with page background',
);
assert.ok(
  commonWxss.includes('.filter-chips')
    && commonWxss.includes('grid-template-columns: repeat(6, minmax(0, 1fr))'),
  'shared filter chips should use a six-column single-row grid',
);

[
  { name: 'pool', wxml: poolWxml, searchClass: 'pool-search-box', filterClass: 'pool-filter-bar' },
  { name: 'shelf', wxml: shelfWxml, searchClass: 'shelf-search', filterClass: 'shelf-filter-bar' },
].forEach(({ name, wxml, searchClass, filterClass }) => {
  assert.ok(wxml.includes('class="sticky-search-filter"') && wxml.includes('{{stickyTop}}'), `${name} page should bind sticky top offset`);
  const stickyBlock = wxml.slice(wxml.indexOf('sticky-search-filter'), wxml.indexOf('sticky-search-filter') + 1200);
  assert.ok(stickyBlock.includes(searchClass) && stickyBlock.includes(filterClass), `${name} sticky wrapper should include search and filter bars`);
  assert.ok(!stickyBlock.includes('scroll-view'), `${name} filter bar should not use horizontal scroll`);
  assert.ok(stickyBlock.includes('class="filter-chips"'), `${name} filter bar should use a single-row chip grid`);
});

console.log('sticky search filter contract ok');
