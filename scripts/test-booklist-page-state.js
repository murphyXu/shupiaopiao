const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/booklist/index.js'), 'utf8');

const onShowMatch = source.match(/onShow\(\)\s*{([\s\S]*?)\n  },/);
assert.ok(onShowMatch, 'booklist index should define onShow');
assert.ok(!/this\.refresh\(/.test(onShowMatch[1]), 'onShow should not refresh feed when returning from detail');

assert.ok(/onLoad\(\)\s*{[\s\S]*?this\.refresh\(\)/.test(source), 'initial feed load should happen in onLoad');
assert.ok(/onPageScroll\(/.test(source), 'page should record scroll position before navigating to detail');
assert.ok(/wx\.pageScrollTo/.test(source), 'page should restore scroll position after returning');
assert.ok(/booklistFeedState/.test(source), 'page should cache feed state for return navigation');

console.log('booklist page state ok');
