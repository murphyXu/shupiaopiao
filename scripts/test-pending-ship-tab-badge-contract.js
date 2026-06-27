const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

const pendingShip = read('miniprogram/utils/pendingShip.js');
const tabBarUtil = read('miniprogram/utils/tab-bar.js');
const customWxml = read('miniprogram/custom-tab-bar/index.wxml');
const customWxss = read('miniprogram/custom-tab-bar/index.wxss');
const customJs = read('miniprogram/custom-tab-bar/index.js');
const appJs = read('miniprogram/app.js');
const config = read('miniprogram/config/index.js');
const poolJs = read('miniprogram/pages/pool/index.js');
const shelfJs = read('miniprogram/pages/shelf/index.js');
const mineJs = read('miniprogram/pages/mine/index.js');

assert.ok(pendingShip.includes('getDriftSummary'), 'pending ship summary should query drift.summary');
assert.ok(pendingShip.includes('formatTabBadge') && pendingShip.includes("'9+'"), 'tab badge should cap at 9+');

assert.ok(tabBarUtil.includes('refreshTabBarPendingShip') && tabBarUtil.includes('mineBadge'), 'tab bar util should refresh mine badge only');
assert.ok(!tabBarUtil.includes('banner') && !customWxml.includes('banner'), 'P0 should not add tab banner strip');

assert.ok(customWxml.includes('/pages/mine/index') && customWxml.includes('mineBadge') && customWxml.includes('tab-badge'), 'mine tab should render pending ship badge');
assert.ok(!customWxml.includes('pending-ship-strip') && !customWxml.includes('reminder-card'), 'tab bar should not duplicate given reminder card');

assert.ok(customWxss.includes('#2FBE77') && customWxss.includes('.tab-badge'), 'badge should use brand green');

assert.ok(customJs.includes('mineBadge') && customJs.includes('pendingShipBadge'), 'tab bar should hydrate badge from app globalData');

assert.ok(appJs.includes('refreshTabBarPendingShip') && appJs.includes('pendingShipBadge'), 'app onShow should refresh pending ship badge');

assert.ok(poolJs.includes('refreshTabBarPendingShip') && shelfJs.includes('refreshTabBarPendingShip') && mineJs.includes('refreshTabBarPendingShip'), 'tab pages should refresh badge on show');

assert.ok(config.includes('w1maSH93gEzVNejUv04-kqiat9ezvkYznjkUreW003I'), 'config should include ship remind template id');
assert.ok(config.includes('Gw6HlIXjcKwN2uhfvnQMpjInSj-a9dCAabcwxGWUBlg'), 'config should include claim notify template id');
assert.ok(config.includes('shipRemind') && config.includes('claimNotify'), 'subscribe template keys should be named for drift use');

console.log('pending ship tab badge contract ok');
