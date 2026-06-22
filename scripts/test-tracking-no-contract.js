const assert = require('assert');
const path = require('path');
const fs = require('fs');

const mini = require(path.join(__dirname, '../miniprogram/utils/trackingNo.js'));
const cloud = require(path.join(__dirname, '../cloudfunctions/api/lib/trackingNo.js'));

function assertBoth(method, ...args) {
  const a = mini[method](...args);
  const b = cloud[method](...args);
  assert.deepStrictEqual(a, b);
  return a;
}

assert.strictEqual(assertBoth('validateTrackingNo', ' SF1234567890 ', '顺丰').ok, true);
assert.strictEqual(assertBoth('validateTrackingNo', '13800138000', '顺丰').ok, false);
assert.ok(assertBoth('validateTrackingNo', '13800138000', '顺丰').message.includes('手机号'));
assert.strictEqual(assertBoth('validateTrackingNo', '123', '顺丰').ok, false);
assert.strictEqual(assertBoth('validateTrackingNo', '123456789012345678901234567890123', '顺丰').ok, false);

const sms = '【顺丰速运】您的快件 SF1234567890123 已揽收';
assert.strictEqual(assertBoth('extractTrackingNo', sms), 'SF1234567890123');
assert.strictEqual(assertBoth('validateTrackingNo', sms, '顺丰').ok, true);

assert.strictEqual(assertBoth('validateTrackingNo', 'YT1234567890123', '圆通').ok, true);
assert.strictEqual(assertBoth('validateTrackingNo', 'YT1234567890123', '顺丰').ok, false);

const driftHandler = fs.readFileSync(path.join(__dirname, '../cloudfunctions/api/handlers/drift.js'), 'utf8');
assert.ok(driftHandler.includes("require('../lib/trackingNo')") && driftHandler.includes('trackingCheck.normalized'), 'ship handler should validate tracking number on backend');

const shipJs = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/drift/ship.js'), 'utf8');
assert.ok(shipJs.includes("require('../../utils/trackingNo')") && shipJs.includes('trackingError'), 'ship page should validate tracking number on frontend');

console.log('tracking no contract ok');
