const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

const { buildOrderMetaLine, formatOrderNo } = require('../miniprogram/utils/orderMeta');
const driftHandler = read('cloudfunctions/api/handlers/drift.js');
const givenWxml = read('miniprogram/pages/drift/given.wxml');
const givenJs = read('miniprogram/pages/drift/given.js');
const receivedWxml = read('miniprogram/pages/drift/received.wxml');
const receivedJs = read('miniprogram/pages/drift/received.js');
const detailWxml = read('miniprogram/pages/drift/order-detail.wxml');
const detailJs = read('miniprogram/pages/drift/order-detail.js');
const commonWxss = read('miniprogram/styles/common.wxss');

assert.strictEqual(formatOrderNo('drift-abc123'), '', 'open drift records should not expose order numbers');
assert.strictEqual(formatOrderNo('order-abcd1234efgh5678'), 'EFGH5678', 'order number should use last 8 id chars');

const meta = buildOrderMetaLine({
  id: 'order-abcd1234efgh5678',
  createdAt: '2026-06-28T08:30:00.000Z',
});
assert.ok(meta.includes('订单编号 EFGH5678'), 'order meta should include order number');
assert.ok(meta.includes('下单 2026-06-28 08:30'), 'order meta should include formatted order time');
assert.strictEqual(buildOrderMetaLine({ id: 'drift-open-1', createdAt: '2026-06-28T08:30:00.000Z' }), '', 'open drift records should not render order meta');

assert.ok(driftHandler.includes('orderNo: formatOrderNo(row._id)'), 'backend should expose order number on formatted orders');
assert.ok(driftHandler.includes('orderTimeText: formatOrderTimeText'), 'backend should expose formatted order time');

assert.ok(givenWxml.includes('class="order-meta"') && givenWxml.includes('item.orderMetaLine'), 'given list cards should show order meta at top');
assert.ok(receivedWxml.includes('class="order-meta"') && receivedWxml.includes('item.orderMetaLine'), 'received list cards should show order meta at top');
assert.ok(detailWxml.includes('orderMetaLine') && detailWxml.includes('class="order-meta"'), 'order detail should show order meta');
assert.ok(givenJs.includes('buildOrderMetaLine') && receivedJs.includes('buildOrderMetaLine') && detailJs.includes('buildOrderMetaLine'), 'order pages should build meta line from shared helper');
assert.ok(commonWxss.includes('.order-meta'), 'shared styles should define order meta line');

console.log('drift order meta contract ok');
