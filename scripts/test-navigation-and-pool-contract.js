const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../miniprogram/app.json'), 'utf8'));
const tabbarJs = fs.readFileSync(path.join(__dirname, '../miniprogram/custom-tab-bar/index.js'), 'utf8');
const mainJs = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/main/main.js'), 'utf8');
const shelfJs = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/shelf/index.js'), 'utf8');
const shelfWxml = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/shelf/index.wxml'), 'utf8');
const poolJs = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/pool/index.js'), 'utf8');
const poolWxml = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/pool/index.wxml'), 'utf8');
const poolWxss = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/pool/index.wxss'), 'utf8');
const commonWxss = fs.readFileSync(path.join(__dirname, '../miniprogram/styles/common.wxss'), 'utf8');
const poolHandler = fs.readFileSync(path.join(__dirname, '../cloudfunctions/api/handlers/pool.js'), 'utf8');

assert.strictEqual(appJson.pages[0], 'pages/pool/index', 'default launch page should be drift pool');
assert.deepStrictEqual(
  appJson.tabBar.list.map((item) => `${item.pagePath}:${item.text}`),
  ['pages/pool/index:漂流', 'pages/shelf/index:书架', 'pages/mine/index:我的'],
  'native tabbar should order drift, shelf, mine',
);
assert.ok(!appJson.tabBar.list.some((item) => item.pagePath === 'pages/booklist/index'), 'booklist tab should stay removed');
assert.ok(!tabbarJs.includes('/pages/booklist/index'), 'custom tabbar should not include booklist');
assert.ok(!appJson.pages.some((page) => page.includes('booklist')), 'app.json should not register booklist pages');
assert.ok(!fs.existsSync(path.join(__dirname, '../miniprogram/pages/booklist')), 'booklist pages directory should be removed');
assert.ok(!fs.existsSync(path.join(__dirname, '../miniprogram/assets/booklist-covers')), 'booklist cover assets should be removed');
assert.ok(
  tabbarJs.indexOf("pagePath: '/pages/pool/index'") < tabbarJs.indexOf("pagePath: '/pages/shelf/index'")
    && tabbarJs.indexOf("pagePath: '/pages/shelf/index'") < tabbarJs.indexOf("pagePath: '/pages/mine/index'"),
  'custom tabbar should order drift, shelf, mine',
);
assert.ok(mainJs.includes('/pages/pool/index'), 'main page should redirect to drift pool');
assert.ok(poolJs.includes('setTabBarIndex.call(this, 0)'), 'pool tab index should be 0');
assert.ok(shelfJs.includes('setTabBarIndex.call(this, 1)'), 'shelf tab index should be 1');
assert.ok(shelfWxml.includes('>编辑名称</view>') && !shelfWxml.includes('>编辑</view>'), 'shelf name edit action should be labeled edit name');

assert.ok(poolWxml.includes('secondaryTabs') && poolJs.includes('filterModes'), 'pool page should render two-level category/value/condition tabs');
assert.ok(!/I 文学|C 社科|Z 童书/.test(fs.readFileSync(path.join(__dirname, '../miniprogram/utils/util.js'), 'utf8')), 'pool category labels should use Chinese short names without CLC prefixes');
assert.ok(poolWxml.includes('grid-book-cover-frame') && poolWxml.includes('mode="aspectFit"'), 'pool cover should adapt uploaded images');
assert.ok(commonWxss.includes('.grid-book-cover-frame'), 'pool cover frame should be styled in shared styles');
assert.ok(poolJs.includes('filterCategory') && poolJs.includes('activeValue') && poolJs.includes('activeCondition'), 'pool page should filter by category, value, and condition');
assert.ok(poolHandler.includes('category') && !poolHandler.includes('ageRange) list'), 'pool handler should filter by book category instead of age');

console.log('navigation and pool contract ok');
