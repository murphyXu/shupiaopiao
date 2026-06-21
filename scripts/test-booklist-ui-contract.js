const assert = require('assert');
const fs = require('fs');
const path = require('path');

const indexWxml = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/booklist/index.wxml'), 'utf8');
const indexWxss = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/booklist/index.wxss'), 'utf8');
const detailWxml = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/booklist/detail.wxml'), 'utf8');

assert.ok(indexWxml.includes('item.cardTitle'), 'feed should render compact cardTitle');
assert.ok(indexWxml.includes('<image') && indexWxml.includes('item.coverImage'), 'feed cover should render local image assets');
assert.ok(!indexWxml.includes('item.coverStyle'), 'feed cover should not render generated style strings');
assert.ok(!indexWxml.includes('item.description'), 'feed should not render long description');
assert.ok(!indexWxml.includes('item.reason'), 'feed should not render recommendation reason');
assert.ok(!indexWxml.includes('cover-text'), 'feed cover should not render text overlay');
assert.ok(!/书架推荐|最近关注|新手精选|根据你的/.test(indexWxml), 'feed should not show product recommendation logic');
assert.ok(/padding-top:\s*125%/.test(indexWxss), 'feed cover should use xiaohongshu-like 4:5 ratio');

assert.ok(!detailWxml.includes('<view class="hero"'), 'detail page should not render top hero image');
assert.ok(!detailWxml.includes('list.coverImage'), 'detail page should not use list cover as a top image');
assert.ok(!detailWxml.includes('coverStyle'), 'detail and related covers should not render generated style strings');
assert.ok(detailWxml.includes('article-title'), 'detail should render title below cover');

console.log('booklist ui contract ok');
