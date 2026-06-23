const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

const givenWxml = read('miniprogram/pages/drift/given.wxml');
const givenWxss = read('miniprogram/pages/drift/given.wxss');
const givenJs = read('miniprogram/pages/drift/given.js');
const receivedJs = read('miniprogram/pages/drift/received.js');
const detailJs = read('miniprogram/pages/drift/order-detail.js');
const detailWxml = read('miniprogram/pages/drift/order-detail.wxml');
const apiUtils = read('miniprogram/utils/api.js');
const apiRoutes = read('cloudfunctions/api/index.js');
const driftHandler = read('cloudfunctions/api/handlers/drift.js');
const shelfHandler = read('cloudfunctions/api/handlers/shelf.js');
const bookDetailJs = read('miniprogram/pages/book/detail.js');
const bookDetailWxml = read('miniprogram/pages/book/detail.wxml');

assert.ok(givenWxml.includes('class="order-action primary"') && givenWxml.includes('class="order-action danger"') && !givenWxml.includes('class="order-action secondary"'), 'given list should keep primary ship and danger cancel actions only');
assert.ok(givenWxml.includes('去发货 ›') && !givenWxml.includes('查看寄送信息') && !givenWxml.includes('>查看详情<'), 'given list should use unified ship entry');
assert.ok(!givenWxml.includes('bindtap="copyShippingInfo"') && givenWxml.includes('bindtap="cancel"') && givenWxml.includes('取消漂流'), 'given list should expose cancellation without list-level copy');
assert.ok(givenWxss.includes('.order-action') && givenWxss.includes('.order-action.primary') && givenWxss.includes('.order-action.danger'), 'given list should define consistent action button styles');
assert.ok(!givenJs.includes('copyShippingInfo') && (givenJs.includes('/pages/drift/ship?orderId=') || givenJs.includes('/pages/drift/ship?bundleId=')), 'given list should navigate to ship page instead of copying address');
assert.ok(givenJs.includes('复制地址去寄快递'), 'given list hint should explain ship page flow');
assert.ok(givenJs.includes('cancel(e)') && givenJs.includes('api.cancelOrder(orderId') && givenJs.includes('this.onShow()'), 'given cancellation should call cancel API and refresh list');
assert.ok(givenJs.includes('canCancelOpen') && givenJs.includes('cancelOpenDrift(e)') && givenJs.includes('api.cancelOpenDrift(driftId'), 'given list should cancel unclaimed drift-only records');
assert.ok(givenWxml.includes('bindtap="cancelOpenDrift"') && (givenWxml.includes('item.canCancelOpen') || givenWxml.includes('item.order.canCancelOpen')), 'given list should expose cancel action before a drift is claimed');
assert.ok(givenJs.includes('viewDetail(e)') && givenJs.includes("if (!orderId || String(orderId).startsWith('drift-'))"), 'given detail navigation should keep invalid id guard');
assert.ok(givenJs.includes('role=given') && receivedJs.includes('role=received'), 'order detail navigation should pass source role for fallback loading');
assert.ok(detailJs.includes('this.role') && detailJs.includes('api.getOrderDetail(this.orderId, this.role)'), 'order detail page should pass role into detail loader');
assert.ok(detailJs.includes('if (!this.orderId)') && detailJs.includes('try {') && detailJs.includes('navigateBack'), 'order detail page should handle missing or failed order ids');
assert.ok(detailJs.includes("require('../../utils/shipping')") && detailJs.includes('copyShippingInfo()') && detailJs.includes('wx.setClipboardData'), 'order detail page should copy receiver shipping information via shared helper');
assert.ok(read('miniprogram/utils/shipping.js').includes('hasShippingInfo') && read('miniprogram/utils/shipping.js').includes('shippingInfoText'), 'shared shipping helper should validate address snapshot fields before copying');
assert.ok(detailWxml.includes('复制收件信息') && !detailWxml.includes('bindtap="ship"'), 'order detail should not send shipping-info action to the tracking-number form');
assert.ok(apiUtils.includes('async function getOrderDetail') && apiUtils.includes("call('drift.orderDetail'") && apiUtils.includes("call('drift.orders'") && apiUtils.includes('fallback: true'), 'order detail api should fall back to order list when detail action is unavailable');
assert.ok(apiUtils.includes('cancelOpenDrift') && apiUtils.includes("call('drift.cancelOpen'"), 'api utils should expose unclaimed drift cancellation');
assert.ok(apiRoutes.includes("'drift.detail':") && apiRoutes.includes('drift.orderDetail(openid, data)'), 'api should expose a detail alias for route compatibility');
assert.ok(apiRoutes.includes("'drift.cancelOpen':") && apiRoutes.includes('drift.cancelOpen(openid, data)'), 'api should expose unclaimed drift cancellation route');
assert.ok(driftHandler.includes('function normalizeAddressSnapshot') && driftHandler.includes('async function resolveOrderAddressSnapshot'), 'backend should normalize address snapshots and recover from addressId');
assert.ok(driftHandler.includes('addressSnapshot: normalizeAddressSnapshot(address)') && driftHandler.includes('resolveOrderAddressSnapshot(order)'), 'claim and detail should share normalized shipping info');
assert.ok(driftHandler.includes('if (!data.orderId) return fail(400') && driftHandler.includes('if (!drift) return fail(404'), 'order detail backend should guard missing order and drift data');
assert.ok(driftHandler.includes('async function cancelOpen') && driftHandler.includes('OPEN_DRIFT_CANCEL_STATUSES') && driftHandler.includes("status: 'CANCELLED'"), 'backend should cancel only unclaimed published drifts');

assert.ok(shelfHandler.includes('activeDrift') && shelfHandler.includes('ACTIVE_SHELF_DRIFT_STATUSES'), 'shelf list should expose active drift state for each shelf book');
assert.ok(bookDetailJs.includes('goPublish()') && bookDetailJs.includes('activeDrift') && bookDetailJs.includes('cancelOpenDrift()'), 'book detail should switch publish action to drift status and allow unclaimed cancellation');
assert.ok(bookDetailWxml.includes('待领取') && bookDetailWxml.includes('bindtap="cancelOpenDrift"'), 'book detail should show pending-claim state and cancellation');

console.log('drift given actions contract ok');
