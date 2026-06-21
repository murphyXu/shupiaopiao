const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const apiIndex = read('cloudfunctions/api/index.js');
const shelfHandler = read('cloudfunctions/api/handlers/shelf.js');
const dbLib = read('cloudfunctions/api/lib/db.js');
const miniApi = read('miniprogram/utils/api.js');
const shelfJs = read('miniprogram/pages/shelf/index.js');
const shelfWxml = read('miniprogram/pages/shelf/index.wxml');
const dashboardWxml = read('miniprogram/pages/shelf/dashboard.wxml');

assert.ok(dbLib.includes('DEFAULT_SHELF_LIMIT = 100'), 'users should default to 100 shelf slots');
assert.ok(dbLib.includes('shelfLimit'), 'user formatter should expose shelfLimit');
assert.ok(apiIndex.includes("'shelf.redeemCapacity'"), 'api should expose shelf capacity redemption route');
assert.ok(shelfHandler.includes('redeemCapacity') && shelfHandler.includes("type: 'shelf_capacity_redeem'"), 'shelf handler should redeem coins into shelf slots');
assert.ok(shelfHandler.includes('ensureShelfCapacity') && shelfHandler.includes('remainingCapacity'), 'shelf add/manual add should enforce remaining capacity');
assert.ok(shelfHandler.includes('parseListPrice') && shelfHandler.includes('totalListPrice'), 'dashboard should sum book list prices instead of second-hand coin estimate');
assert.ok(!shelfHandler.includes('estimateFromCache'), 'shelf dashboard should no longer use second-hand price estimate for homepage value');

assert.ok(miniApi.includes('redeemShelfCapacity'), 'frontend api should wrap shelf capacity redemption');
assert.ok(shelfWxml.includes('剩余可收藏') && shelfWxml.includes('dashboard.remainingCapacity'), 'shelf header should show remaining collectible slots');
assert.ok(!shelfWxml.includes('/ 上限') && !shelfWxml.includes('dashboard.shelfLimit'), 'shelf home header should only show remaining collectible slots');
assert.ok(shelfWxml.includes('兑换额度') && shelfJs.includes('goRedeemCapacity'), 'shelf page should provide capacity redemption entry');
assert.ok(shelfWxml.includes('定价合计') && dashboardWxml.includes('定价合计'), 'shelf pages should label total value as list price sum');

console.log('shelf quota and value contract ok');
