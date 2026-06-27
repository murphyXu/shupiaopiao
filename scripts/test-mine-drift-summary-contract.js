const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

const mineJs = read('miniprogram/pages/mine/index.js');
const mineWxml = read('miniprogram/pages/mine/index.wxml');
const givenJs = read('miniprogram/pages/drift/given.js');
const receivedJs = read('miniprogram/pages/drift/received.js');

assert.ok(!mineWxml.includes('class="card drift-summary"') && !mineWxml.includes('goDriftSummary'), 'drift todos should not render as a standalone card');
assert.ok(!mineJs.includes('goDriftSummary'), 'mine page should route through drift menu entries instead of standalone todo cards');
assert.ok(!mineWxml.includes('暂无待办'), 'mine page should hide todo badges when there is nothing pending');
assert.ok(mineWxml.includes('todo-badge') && mineWxml.includes('givenBadges') && mineWxml.includes('receivedBadges'), 'drift todo badges should sit on the right of given and received menu rows');
assert.ok(mineJs.includes('/pages/drift/given') && mineJs.includes('/pages/drift/received'), 'drift menu entries should continue opening given and received lists');
assert.ok(mineJs.includes('getDriftSummary'), 'mine page should load drift todo summary from a single api call');
assert.ok(mineJs.includes('buildTodoBadges') && mineJs.includes('givenBadges') && mineJs.includes('receivedBadges'), 'mine page should build role-specific todo badges');
assert.ok(givenJs.includes('onLoad(options') && givenJs.includes('activeTab') && givenJs.includes("api.getOrders('given')"), 'given list should honor status query via tabs');
assert.ok(receivedJs.includes('onLoad(options') && receivedJs.includes('activeTab') && receivedJs.includes("api.getOrders('received')"), 'received list should honor status query via tabs');

console.log('mine drift summary contract ok');
