const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const poolWxml = read('miniprogram/pages/pool/index.wxml');
const poolWxss = read('miniprogram/pages/pool/index.wxss');
const poolJs = read('miniprogram/pages/pool/index.js');
const tabBarWxss = read('miniprogram/custom-tab-bar/index.wxss');
const tabBarWxml = read('miniprogram/custom-tab-bar/index.wxml');
const tabBarJs = read('miniprogram/custom-tab-bar/index.js');
const tabBarUtil = read('miniprogram/utils/tab-bar.js');
const { measureMoreFilterLayout } = require('../miniprogram/utils/poolMoreFilterLayout');

const moreFilterBlock = poolWxml.slice(poolWxml.indexOf('<page-container'));

assert.ok(
  moreFilterBlock.includes('z-index="10050"')
    && Number(tabBarWxss.match(/z-index:\s*(\d+)/)[1]) < 10050,
  'pool more-filter should render above the custom tab bar',
);
assert.ok(
  moreFilterBlock.includes('class="mf-foot"')
    && moreFilterBlock.includes('filterFootPadding')
    && moreFilterBlock.includes('filterCompact'),
  'pool more-filter foot should use device-specific safe-area padding',
);
assert.ok(
  poolJs.includes('setTabBarHidden(true)')
    && poolJs.includes('setTabBarHidden(false)'),
  'pool page should hide custom tab bar while more-filter is open',
);
assert.ok(
  tabBarWxml.includes('hidden="{{hidden}}"')
    && tabBarJs.includes('hidden: false'),
  'custom tab bar should support hidden state',
);
assert.ok(
  tabBarUtil.includes('function setTabBarHidden'),
  'tab-bar util should expose setTabBarHidden',
);
assert.ok(
  poolJs.includes('measureMoreFilterLayout'),
  'pool page should measure filter layout when opening the drawer',
);
assert.ok(
  /\.mf-foot\s*\{[^}]*flex-shrink:\s*0/s.test(poolWxss),
  'pool more-filter foot should stay visible in the flex panel',
);
assert.strictEqual(
  measureMoreFilterLayout(() => ({
    windowHeight: 844,
    screenHeight: 844,
    safeArea: { bottom: 810 },
  })).filterFootPadding,
  34,
  'iPhone-class layouts should reserve bottom safe inset for action buttons',
);
assert.strictEqual(
  measureMoreFilterLayout(() => ({ windowHeight: 640, screenHeight: 640, safeArea: { bottom: 620 } })).filterCompact,
  true,
  'short screens should switch to compact filter sizing',
);

console.log('pool more-filter scroll contract ok');
