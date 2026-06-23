const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const appJson = read('miniprogram/app.json');
const shelfJs = read('miniprogram/pages/shelf/index.js');
const shelfWxml = read('miniprogram/pages/shelf/index.wxml');
const shelfWxss = read('miniprogram/pages/shelf/index.wxss');
const apiUtils = read('miniprogram/utils/api.js');
const scanJs = read('miniprogram/pages/shelf/scan.js');
const publishJs = read('miniprogram/pages/drift/publish.js');
const booksHandler = read('cloudfunctions/api/handlers/books.js');
const apiRoutes = read('cloudfunctions/api/index.js');

assert.ok(/\.capacity-line\s*{[^}]*white-space:\s*nowrap/.test(shelfWxss), 'capacity text should stay on one line');
assert.ok(/\.capacity-line\s*{[^}]*text-overflow:\s*ellipsis/.test(shelfWxss), 'capacity text should ellipsize on narrow screens');
assert.ok(/\.capacity-line\s*{[^}]*overflow:\s*hidden/.test(shelfWxss), 'capacity text should stay within the row');
assert.ok(shelfWxml.includes('class="page-sub capacity-line"'), 'capacity text should use no-wrap capacity line');
assert.ok(/\.quota-action\s*{[^}]*height:\s*56rpx/.test(shelfWxss), 'quota action should be larger and easier to tap');

assert.ok(appJson.includes('pages/shelf/redeem-capacity'), 'redeem capacity page should be registered');
assert.ok(fs.existsSync(path.join(__dirname, '../miniprogram/pages/shelf/redeem-capacity.js')), 'redeem capacity page js should exist');
assert.ok(fs.existsSync(path.join(__dirname, '../miniprogram/pages/shelf/redeem-capacity.wxml')), 'redeem capacity page wxml should exist');
const redeemJs = read('miniprogram/pages/shelf/redeem-capacity.js');
const redeemWxml = read('miniprogram/pages/shelf/redeem-capacity.wxml');
assert.ok(shelfJs.includes('goRedeemCapacity') && shelfWxml.includes('bindtap="goRedeemCapacity"'), 'shelf page should navigate to capacity redeem page');
assert.ok(redeemWxml.includes('type="number"') && redeemJs.includes('redeemCount'), 'redeem page should allow manual quantity input');
assert.ok(redeemWxml.includes('1 公益积分可兑换') && redeemWxml.includes('capacityPerCoin'), 'redeem page should show coin-to-capacity ratio');
assert.ok(redeemJs.includes('shelfCapacityPerCoin') && redeemJs.includes('coinCostForCapacity'), 'redeem page should derive coin cost from capacity ratio');
assert.ok(apiUtils.includes('redeemShelfCapacity') && redeemJs.includes('redeemShelfCapacity(this.data.redeemCount)'), 'redeem page should submit selected quantity to api');

assert.ok(shelfJs.includes("itemList: ['扫码录入', '手动添加']"), 'shelf add menu should remove search entry to avoid external API usage');
assert.ok(!shelfJs.includes("'搜索录入'") && !shelfJs.includes('/pages/shelf/search'), 'shelf home add menu should not navigate to search input');
assert.ok(publishJs.includes('wx.scanCode') && !publishJs.includes('/pages/shelf/search'), 'publish empty-shelf add entry should scan instead of opening search input');
assert.ok(apiUtils.includes('getBookByIsbn: (isbn, source =') && apiUtils.includes("source })"), 'book ISBN api wrapper should support source tagging');
assert.ok(scanJs.includes("api.getBookByIsbn(clean, 'scan')"), 'scan page should tag ISBN lookups as scan');
assert.ok(apiRoutes.includes('books.byIsbn(data, openid)'), 'api route should pass openid into ISBN lookup for scan quota');
assert.ok(booksHandler.includes('SCAN_LOOKUP_LIMIT = 300') && booksHandler.includes('scanLookupCount') && booksHandler.includes('扫码次数已达上限'), 'backend should enforce per-user scan lookup limit');

assert.ok(shelfJs.includes('searchKeyword') && shelfJs.includes('onShelfSearchInput') && shelfJs.includes('clearShelfSearch'), 'shelf should keep local search keyword state');
assert.ok(shelfWxml.includes('shelf-search') && shelfWxml.includes('bindinput="onShelfSearchInput"'), 'shelf should render local search input');
assert.ok(shelfJs.includes('matchesShelfSearch') && shelfJs.includes('book.isbn') && shelfJs.includes('book.publisher'), 'shelf local search should match title author isbn publisher');
assert.ok(shelfWxml.includes('没找到这本在架书'), 'shelf search empty state should explain no in-shelf match');

assert.ok(shelfWxml.includes('book-card series-card') && shelfWxml.includes('series-count-badge'), 'series entry should use normal book card style and show count on cover');
assert.ok(!shelfWxml.includes('series-wrap entry-full'), 'series entry should not be a full-width custom card');
assert.ok(shelfJs.includes('pickSeriesCover') && shelfJs.includes('hasRealCover'), 'series entry should pick a real child cover when available');

assert.ok(shelfJs.includes('BACK_TOP_BOOK_THRESHOLD') && shelfJs.includes('onPageScroll') && shelfJs.includes('scrollToTop'), 'shelf should expose back-to-top behavior after many books');
assert.ok(shelfWxml.includes('back-top-entry') && shelfWxss.includes('.back-top-entry'), 'shelf should render fixed back-to-top entry');

assert.ok(/const PRIMARY_TABS = \[\s*\{\s*key: 'class'/.test(shelfJs), 'shelf primary tabs should start with book class');
assert.ok(/activePrimary:\s*'class'/.test(shelfJs), 'shelf should default primary tab to book class');

console.log('shelf interaction contract ok');
