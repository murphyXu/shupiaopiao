const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

const shipJs = read('miniprogram/pages/drift/ship.js');
const shipWxml = read('miniprogram/pages/drift/ship.wxml');
const shipJson = read('miniprogram/pages/drift/ship.json');
const givenWxml = read('miniprogram/pages/drift/given.wxml');
const givenJs = read('miniprogram/pages/drift/given.js');
const shippingUtil = read('miniprogram/utils/shipping.js');
const expressApps = read('miniprogram/utils/expressApps.js');
const appJson = read('miniprogram/app.json');
const orderDetailJs = read('miniprogram/pages/drift/order-detail.js');

assert.ok(shipJson.includes('"发货"'), 'ship page title should be 发货');
assert.ok(givenWxml.includes('去发货 ›') && !givenWxml.includes('查看寄送信息') && !givenWxml.includes('录入快递单号'), 'given list should use single ship entry');
assert.ok(!givenJs.includes('copyShippingInfo'), 'given list should not copy shipping info locally');

assert.ok(shipJs.includes("api.getOrderDetail(this.orderId, 'given')"), 'ship page should load order detail for giver');
assert.ok(shipJs.includes("order.status !== 'PENDING_SHIP'"), 'ship page should redirect when order is not pending ship');
assert.ok(shipJs.includes('openExpressSheet') && shipJs.includes('copyAndOpenExpress'), 'ship page should expose express jump flow');
assert.ok(shipJs.includes('lastCopiedAt') && shipJs.includes('3000'), 'ship page should debounce clipboard copy within 3 seconds');
assert.ok(shipJs.includes('redirectTo') && shipJs.includes('order-detail'), 'ship submit should redirect to order detail');

assert.ok(shipWxml.includes('收件信息') && shipWxml.includes('addressSnapshot.name'), 'ship page should show plaintext address');
assert.ok(shipWxml.includes('复制收件信息') && shipWxml.includes('去寄快递'), 'ship page should expose copy and express actions');
assert.ok(shipWxml.includes('地址仅用于本次到付寄件'), 'ship page should include privacy note');
assert.ok(shipWxml.includes('可稍后再填') && shipWxml.includes('收到单号后粘贴'), 'ship page should explain deferred tracking entry');
assert.ok(shipWxml.includes('tracking-error') && shipWxml.includes('粘贴整段短信会自动提取单号'), 'ship page should show tracking validation feedback');
assert.ok(shipJs.includes('validateTrackingNo') && shipJs.includes('trackingError'), 'ship page should validate tracking numbers before submit');
assert.ok(shipWxml.includes('disabled="{{submitting || !canSubmit}}"'), 'submit button should stay disabled without valid tracking number');

assert.ok(shippingUtil.includes("join('\\n')") && !shippingUtil.includes('收件人：'), 'shipping copy format should be two paste-friendly lines');
assert.ok(shippingUtil.includes('formatShipDeadlineRemaining'), 'shipping util should format ship deadline countdown');

assert.ok(expressApps.includes('菜鸟裹裹') && expressApps.includes('顺丰速运+') && expressApps.includes('中通快递') && expressApps.includes('京东快递'), 'express apps should include approved carriers');
assert.ok(expressApps.includes('其他（自行打开）') && expressApps.includes('openExpressMiniProgram'), 'express apps should support copy-only fallback');
assert.ok(expressApps.includes('shortLink'), 'express apps should keep shortLink fallback');

assert.ok(appJson.includes('navigateToMiniProgramAppIdList'), 'app.json should declare express mini program app ids');
assert.ok(appJson.includes('wx66188bf666705688') && appJson.includes('wx5882299e98d3b22a'), 'app.json should include cainiao and sf app ids');

assert.ok(orderDetailJs.includes("require('../../utils/shipping')"), 'order detail should reuse shared shipping copy helper');

console.log('drift ship page contract ok');
