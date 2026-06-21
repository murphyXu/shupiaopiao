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
assert.ok(mineWxml.includes('given-summary') && mineWxml.includes('received-summary'), 'drift todo copy should be integrated into given and received menu rows');
assert.ok(mineJs.includes('/pages/drift/given') && mineJs.includes('/pages/drift/received'), 'drift menu entries should continue opening given and received lists');
assert.ok(mineJs.includes('givenPendingRows.length') && mineJs.includes('receivedShippedRows.length'), 'summary counts should reflect actionable role-specific todos');
assert.ok(givenJs.includes('onLoad(options') && givenJs.includes('statusFilter') && givenJs.includes("api.getOrders('given', this.data.statusFilter"), 'given list should honor status query');
assert.ok(receivedJs.includes('onLoad(options') && receivedJs.includes('statusFilter') && receivedJs.includes("api.getOrders('received', this.data.statusFilter"), 'received list should honor status query');

console.log('mine drift summary contract ok');
