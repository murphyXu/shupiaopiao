const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

const orderList = require('../miniprogram/utils/orderList');
const givenJs = read('miniprogram/pages/drift/given.js');
const givenWxml = read('miniprogram/pages/drift/given.wxml');
const receivedJs = read('miniprogram/pages/drift/received.js');
const receivedWxml = read('miniprogram/pages/drift/received.wxml');
const commonWxss = read('miniprogram/styles/common.wxss');

const sampleGiven = [
  { id: '1', status: 'DONE', createdAt: '2026-01-03T00:00:00.000Z' },
  { id: '2', status: 'PENDING_SHIP', createdAt: '2026-01-02T00:00:00.000Z' },
  { id: '3', status: 'IN_POOL', createdAt: '2026-01-01T00:00:00.000Z' },
];
const sortedGiven = orderList.sortOrdersByStatusPriority(sampleGiven, 'given');
assert.strictEqual(sortedGiven[0].status, 'PENDING_SHIP', 'given pending ship should sort first');
assert.strictEqual(sortedGiven[1].status, 'IN_POOL', 'given open drift should follow pending ship');

const sampleReceived = [
  { id: '1', status: 'PENDING_SHIP', createdAt: '2026-01-03T00:00:00.000Z' },
  { id: '2', status: 'SHIPPED', createdAt: '2026-01-02T00:00:00.000Z' },
];
const sortedReceived = orderList.sortOrdersByStatusPriority(sampleReceived, 'received');
assert.strictEqual(sortedReceived[0].status, 'SHIPPED', 'received shipped should sort before pending ship');

assert.strictEqual(orderList.resolveActiveTabFromStatus('PENDING_SHIP', 'given'), 'pending');
assert.strictEqual(orderList.resolveActiveTabFromStatus('SHIPPED', 'received'), 'pending');

const prepared = orderList.prepareOrderList(sampleGiven, 'given', 'open');
assert.strictEqual(prepared.orders.length, 1);
assert.strictEqual(prepared.orders[0].status, 'IN_POOL');
assert.ok(prepared.statusTabs.some((tab) => tab.key === 'pending' && tab.count === 1));

assert.ok(givenJs.includes('prepareOrderList') && givenJs.includes('switchStatusTab') && givenJs.includes("api.getOrders('given')"), 'given list should load all orders and filter by status tabs');
assert.ok(receivedJs.includes('prepareOrderList') && receivedJs.includes('switchStatusTab') && receivedJs.includes("api.getOrders('received')"), 'received list should load all orders and filter by status tabs');
assert.ok(givenWxml.includes('status-tabs') && givenWxml.includes('switchStatusTab'), 'given page should render status tabs');
assert.ok(receivedWxml.includes('status-tabs') && receivedWxml.includes('switchStatusTab'), 'received page should render status tabs');
assert.ok(commonWxss.includes('.status-tab') && commonWxss.includes('.status-tab.active'), 'status tab styles should live in shared stylesheet');

console.log('drift order list contract ok');
