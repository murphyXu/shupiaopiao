const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const publishJs = read('miniprogram/pages/drift/publish.js');
const publishWxml = read('miniprogram/pages/drift/publish.wxml');
const publishWxss = read('miniprogram/pages/drift/publish.wxss');
const utilJs = read('miniprogram/utils/util.js');
const pricingJs = read('cloudfunctions/api/lib/pricing.js');
const driftHandler = read('cloudfunctions/api/handlers/drift.js');
const driftAccounting = read('cloudfunctions/api/lib/driftAccounting.js');
const poolHandler = read('cloudfunctions/api/handlers/pool.js');
const poolDetailWxml = read('miniprogram/pages/pool/detail.wxml');
const givenWxml = read('miniprogram/pages/drift/given.wxml');

assert.ok(publishJs.includes('shelfBookId') && publishJs.includes('setSelectedBook(item)'), 'publish should select one exact shelf record');
assert.ok(driftHandler.includes('findShelfRecord') && driftHandler.includes('shelfBookId: shelfRow._id'), 'backend should verify and persist exact shelf ownership');
assert.ok(publishJs.includes('calculateDisplayValue') && publishWxml.includes('系统流转积分值'), 'publish should preview the system value');
assert.ok(!publishWxml.includes('bindinput="onCoinValueInput"') && !publishJs.includes('onCoinValueInput'), 'public points should not be user editable');
assert.ok(driftHandler.includes('calculateCoinValue(listPrice, condition)'), 'backend should calculate the authoritative point value');
assert.ok(driftHandler.includes('publishRewardGranted') && driftHandler.includes('grantPublishReward'), 'cold-start publish reward should be idempotent');
assert.ok(publishJs.includes('submitting') && publishWxml.includes('loading="{{submitting}}"') && publishWxml.includes('disabled="{{submitting}}"'), 'publish submit should prevent duplicate requests');
assert.ok(
  driftHandler.indexOf('activeDuplicateCount') > -1
    && driftHandler.indexOf('activeDuplicateCount') < driftHandler.indexOf("db.collection('drifts').doc(driftId).set"),
  'backend should check active duplicates before creating a drift record'
);
assert.ok(pricingJs.includes('duplicateCount > 0'), 'auto-check duplicate count should represent existing active records only');
assert.ok(!driftAccounting.includes('data: { _id') && !driftAccounting.includes('_id: id'), 'drift accounting event writes must not try to set reserved _id');
assert.ok(!driftHandler.includes('data: { _id: orderId') && !driftHandler.includes('data: { _id: id') && !driftHandler.includes('data: { _id: disputeId') && !driftHandler.includes('data: { _id: reviewId'), 'drift handler set writes must not try to set reserved _id');

assert.ok(utilJs.includes('seven_new') && utilJs.includes('below_seven'), 'condition options should include confirmed buckets');
assert.ok(utilJs.includes('CONDITION_ISSUES') && utilJs.includes('有笔记') && utilJs.includes('有泡水') && utilJs.includes('有脏污'), 'condition issue options should exist');
assert.ok(publishJs.includes('toggleConditionIssue') && publishWxml.includes('品相描述'), 'condition issue multi-select should remain');
assert.ok(publishWxml.includes('condition-chips') && publishWxss.includes('grid-template-columns: repeat(5, 1fr)'), 'condition chips should keep compact layout');

assert.ok(pricingJs.includes('seven_new') && pricingJs.includes('below_seven'), 'pricing labels should include condition buckets');
assert.ok(driftHandler.includes('imageMap') && driftHandler.includes('conditionIssues'), 'drift data should preserve compatible image and condition fields');
assert.ok(poolHandler.includes('conditionIssues') && poolDetailWxml.includes('conditionIssueLabels'), 'pool detail should expose condition labels');
assert.ok(givenWxml.includes('conditionIssueLabels'), 'given records should show condition labels');

console.log('drift publish form contract ok');
