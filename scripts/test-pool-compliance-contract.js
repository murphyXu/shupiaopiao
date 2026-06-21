const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

const driftHandler = read('cloudfunctions/api/handlers/drift.js');
const poolHandler = read('cloudfunctions/api/handlers/pool.js');
const util = read('miniprogram/utils/util.js');
const publishJs = read('miniprogram/pages/drift/publish.js');
const poolDetailWxml = read('miniprogram/pages/pool/detail.wxml');
const poolDetailJs = read('miniprogram/pages/pool/detail.js');
const poolIndexWxml = read('miniprogram/pages/pool/index.wxml');
const claimWxml = read('miniprogram/pages/drift/claim.wxml');
const claimJs = read('miniprogram/pages/drift/claim.js');
const claimJson = read('miniprogram/pages/drift/claim.json');

assert.ok(driftHandler.includes("status: 'PENDING_REVIEW'"), 'new drift should enter pending review before public pool');
assert.ok(
  driftHandler.includes('ACTIVE_DRIFT_DUPLICATE_STATUSES')
    && driftHandler.includes("'PENDING_REVIEW'")
    && driftHandler.includes("'IN_POOL'")
    && driftHandler.includes("'CLAIMED'"),
  'duplicate drift guard should include all active drift statuses'
);
assert.ok(util.includes('PENDING_REVIEW') && util.includes('待审核'), 'frontend status map should include pending review');

assert.ok(driftHandler.includes('data.isAnonymous !== false'), 'backend should default new public drifts to anonymous display');
assert.ok(publishJs.includes('isAnonymous: true'), 'publish form should default to anonymous drift');

assert.ok(poolHandler.includes('REPORT_HIDE_THRESHOLD') && poolHandler.includes("safeQuery('reports'"), 'pool should hide heavily reported drift items');
assert.ok(poolHandler.includes('filterVisibleDrifts'), 'pool list/detail/wants should share visible drift filter');
assert.ok(poolHandler.includes('status: _.neq') && poolHandler.includes('RESOLVED'), 'resolved reports should not hide drift items');

assert.ok(!poolDetailWxml.includes('需 {{item.coinValue}} 公益积分'), 'pool detail should avoid price-like required-points wording');
assert.ok(!poolDetailWxml.includes('用公益积分领取'), 'pool detail should avoid purchase-like claim wording');
assert.ok(poolDetailWxml.includes('申请接漂'), 'pool detail should use application wording');
assert.ok(poolDetailJs.includes("requireLogin('申请接漂需登录"), 'pool detail login prompt should avoid order wording');

assert.ok(!claimWxml.includes('扣 {{item.coinValue}} 公益积分'), 'claim page should avoid deduction wording before application');
assert.ok(!claimWxml.includes('公益积分余额'), 'claim page should avoid balance-like wording');
assert.ok(!claimWxml.includes('确认领取'), 'claim page should avoid immediate receive wording');
assert.ok(claimWxml.includes('确认申请') && claimWxml.includes('流转积分'), 'claim page should use application and flow-points wording');
assert.ok(claimJs.includes("wx.showToast({ title: '申请已提交'"), 'claim success toast should use application wording');
assert.ok(claimJson.includes('申请接漂'), 'claim page title should use application wording');

assert.ok(poolIndexWxml.includes('我接漂') && poolIndexWxml.includes('我想漂'), 'pool stats should use current-user drift application wording');

console.log('pool compliance contract ok');
