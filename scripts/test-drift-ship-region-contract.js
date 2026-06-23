const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const {
  parseRegionString,
  normalizeShipRegion,
  formatShipFromLabel,
  formatShipFromField,
} = require('../cloudfunctions/api/lib/shipRegion');
const {
  parseShipRegionFromAddresses,
  shippingDistanceHint,
} = require('../miniprogram/utils/shipRegion');

const driftHandler = read('cloudfunctions/api/handlers/drift.js');
const poolHandler = read('cloudfunctions/api/handlers/pool.js');
const publishJs = read('miniprogram/pages/drift/publish.js');
const publishWxml = read('miniprogram/pages/drift/publish.wxml');
const claimJs = read('miniprogram/pages/drift/claim.js');
const claimWxml = read('miniprogram/pages/drift/claim.wxml');
const poolDetailWxml = read('miniprogram/pages/pool/detail.wxml');

assert.deepStrictEqual(parseRegionString('广东省 深圳市 南山区'), { province: '广东省', city: '深圳市' });
assert.deepStrictEqual(normalizeShipRegion({ province: '北京市', city: '北京市' }), { province: '北京市', city: '北京市' });
assert.strictEqual(formatShipFromLabel({ province: '广东省', city: '深圳市' }), '广东省 · 深圳市');
assert.strictEqual(formatShipFromLabel({ province: '北京市', city: '北京市' }), '北京市');
assert.deepStrictEqual(formatShipFromField({ province: '广东省', city: '深圳市' }), {
  province: '广东省',
  city: '深圳市',
  label: '广东省 · 深圳市',
});

const fromAddress = parseShipRegionFromAddresses([{
  region: '浙江省 杭州市 西湖区',
  isDefault: true,
}]);
assert.deepStrictEqual(fromAddress, { province: '浙江省', city: '杭州市' });

assert.ok(shippingDistanceHint('广东省 深圳市 南山区', { province: '广东省', city: '深圳市' }).includes('同城'));
assert.ok(shippingDistanceHint('北京市 北京市 朝阳区', { province: '广东省', city: '深圳市' }).includes('跨省'));
assert.ok(shippingDistanceHint('', { province: '广东省', city: '深圳市' }).includes('深圳市'));

assert.ok(driftHandler.includes('resolveShipRegionForPublish') && driftHandler.includes('shipRegion'), 'publish should resolve and persist shipRegion');
assert.ok(driftHandler.includes('defaultShipRegion'), 'publish should remember default ship region');
assert.ok(poolHandler.includes('formatShipFromField') && poolHandler.includes('shipFrom:'), 'pool detail should expose shipFrom');
assert.ok(publishJs.includes('parseShipRegionFromAddresses') && publishJs.includes('shipRegion'), 'publish should auto-fill ship region');
assert.ok(publishWxml.includes('寄出参考地') && publishWxml.includes('needsShipRegionPicker'), 'publish should show optional picker only when needed');
assert.ok(claimJs.includes('shippingDistanceHint') && claimWxml.includes('shippingHint'), 'claim should show qualitative shipping hint');
assert.ok(poolDetailWxml.includes('item.shipFrom') && poolDetailWxml.includes('寄出地'), 'pool detail should show ship-from city');
assert.ok(!claimWxml.includes('约') && !poolDetailWxml.includes('包邮'), 'ship region UI must not quote freight amounts');

console.log('drift ship region contract ok');
