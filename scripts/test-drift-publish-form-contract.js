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
const driftPricingRecalc = read('cloudfunctions/api/lib/driftPricingRecalc.js');
const driftAccounting = read('cloudfunctions/api/lib/driftAccounting.js');
const poolHandler = read('cloudfunctions/api/handlers/pool.js');
const poolDetailWxml = read('miniprogram/pages/pool/detail.wxml');
const givenWxml = read('miniprogram/pages/drift/given.wxml');

assert.ok(publishJs.includes('shelfBookId') && publishJs.includes('syncShelfSelection'), 'publish should select exact shelf records');
assert.ok(
  publishJs.includes('getShelfBookDetail')
    && publishJs.includes('resolveTargetShelfItem')
    && publishJs.includes('mergeTargetShelfBook'),
  'publish should resolve target shelf books outside the first candidate page',
);
assert.ok(
  read('miniprogram/pages/book/detail.js').includes('shelfBookId=${this.shelfId}'),
  'book detail publish entry should pass shelfBookId for exact lookup',
);
assert.ok(driftHandler.includes('findShelfRecord') && driftHandler.includes('shelfBookId: shelfRow._id'), 'backend should verify and persist exact shelf ownership');
assert.ok(publishJs.includes('driftPricing') && publishWxml.includes('系统建议'), 'publish should preview the system suggested value');
assert.ok(publishJs.includes('decreaseCoinValue') && publishJs.includes('increaseCoinValue') && publishWxml.includes('coin-stepper'), 'publish should let users lower coin value via stepper');
assert.ok(driftHandler.includes('resolveRequestedCoinValue') && driftHandler.includes('systemCoinValue'), 'backend should validate requested coin value against system suggestion');
assert.ok(driftHandler.includes('resolveDriftCoinFields') && driftPricingRecalc.includes('getMedianPriceByIsbn'), 'backend should load median price from pricing cache');
assert.ok(driftPricingRecalc.includes('calculateCoinValue(listPrice, condition, medianPrice)'), 'backend should prefer median price for system value');
assert.ok(driftHandler.includes('publishRewardGranted') && driftHandler.includes('grantPublishReward'), 'cold-start publish reward should be idempotent');
assert.ok(publishJs.includes('submitting') && publishWxml.includes('loading="{{submitting}}"') && publishWxml.includes('disabled="{{submitting'), 'publish submit should prevent duplicate requests');
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

const stepBodyIndexes = [1, 2, 3, 4].map((step) => (
  publishWxml.indexOf(`<view wx:if="{{step === ${step}}}" class="step-body">`)
));
assert.ok(
  publishJs.includes('publishSteps: PUBLISH_STEPS')
    && publishJs.includes('goNextStep()')
    && publishJs.includes('goPrevStep()')
    && publishJs.includes('gotoStep(e)')
    && publishWxml.includes('class="page publish-stepped"')
    && publishWxml.includes('wx:for="{{publishSteps}}"')
    && publishWxml.includes('bindtap="gotoStep"')
    && stepBodyIndexes.every((index) => index >= 0)
    && stepBodyIndexes.every((index, offset) => offset === 0 || index > stepBodyIndexes[offset - 1]),
  'publish should render the ordered four-step flow and interactive stepper',
);
assert.ok(
  stepBodyIndexes[0] < publishWxml.indexOf('选择要赠出的书（可多选）')
    && publishWxml.indexOf('选择要赠出的书（可多选）') < stepBodyIndexes[1]
    && stepBodyIndexes[1] < publishWxml.indexOf('品相档位')
    && publishWxml.indexOf('品相档位') < stepBodyIndexes[2]
    && stepBodyIndexes[2] < publishWxml.indexOf('公益积分')
    && publishWxml.indexOf('公益积分') < stepBodyIndexes[3]
    && stepBodyIndexes[3] < publishWxml.indexOf('漂流身份')
    && publishWxml.indexOf('漂流身份') < publishWxml.indexOf('本次上漂摘要'),
  'publish should keep every existing card in its intended step',
);
assert.ok(
  publishWxml.includes('class="step-nav"')
    && publishWxml.includes('bindtap="goPrevStep"')
    && publishWxml.includes('bindtap="goNextStep"')
    && publishWxml.includes('wx:if="{{step === 4}}"')
    && (publishWxml.match(/bindtap="submit"/g) || []).length === 1
    && !publishWxml.includes('publish-submit'),
  'publish should replace the legacy submit action with step navigation and one final submit button',
);
assert.ok(
  publishWxml.includes('本次上漂摘要')
    && publishWxml.includes('conditionIssues.length')
    && publishWxml.includes("{{batchMode ? ('提交 ' + selectedCount + ' 本上漂') : '提交上漂'}}"),
  'publish confirmation step should summarize single and batch submissions',
);
assert.ok(
  publishJs.includes('bookSettings')
    && publishJs.includes('batchSelectedItems')
    && publishJs.includes('selectBookCondition')
    && publishJs.includes('toggleBookConditionIssue')
    && publishJs.includes('decreaseBookCoinValue')
    && publishJs.includes('increaseBookCoinValue')
    && publishWxml.includes('batchSelectedItems')
    && publishWxml.includes('selectBookCondition')
    && publishWxml.includes('decreaseBookCoinValue')
    && publishWxml.includes('increaseBookCoinValue'),
  'batch publish should let users confirm condition and coin value per book',
);
assert.ok(
  /\.publish-stepped\s*\{[^}]*padding-bottom:\s*160rpx[^}]*env\(safe-area-inset-bottom\)/s.test(publishWxss)
    && /\.stepper\s*\{[^}]*display:\s*flex/s.test(publishWxss)
    && /\.stp\.on \.stp-dot\s*\{[^}]*background:\s*#2FBE77/s.test(publishWxss)
    && /\.stp-line\.done\s*\{[^}]*background:\s*#2FBE77/s.test(publishWxss),
  'publish stepper should expose the active and completed states',
);
assert.ok(
  /\.summary-row\s*\{[^}]*display:\s*flex/s.test(publishWxss)
    && /\.summary-row \.sv\.hl\s*\{[^}]*color:\s*#0C7A4B/s.test(publishWxss),
  'publish confirmation summary should use the established compact card layout',
);
assert.ok(
  /\.step-nav\s*\{[^}]*position:\s*fixed[^}]*bottom:\s*0[^}]*env\(safe-area-inset-bottom\)[^}]*z-index:\s*50/s.test(publishWxss)
    && /\.step-nav-btn\.primary\[disabled\]\s*\{[^}]*background:\s*#8fd9b5/s.test(publishWxss),
  'publish navigation should stay fixed above the safe area and expose disabled state',
);

assert.ok(pricingJs.includes('seven_new') && pricingJs.includes('below_seven'), 'pricing labels should include condition buckets');
assert.ok(driftHandler.includes('imageMap') && driftHandler.includes('conditionIssues'), 'drift data should preserve compatible image and condition fields');
assert.ok(poolHandler.includes('conditionIssues') && poolDetailWxml.includes('conditionIssueLabels'), 'pool detail should expose condition labels');
assert.ok(givenWxml.includes('conditionIssueLabels'), 'given records should show condition labels');
assert.ok(publishJs.includes('shipRegion') && driftHandler.includes('resolveShipRegionForPublish'), 'publish should pass ship region for freight reference');
const validateCoinValueSource = publishJs.slice(
  publishJs.indexOf('  validateCoinValue()'),
  publishJs.indexOf('  confirmZeroCoinValue()'),
);
assert.ok(
  publishJs.includes('splitSelectedByListPrice')
    && validateCoinValueSource.includes("title: '有书缺少定价'")
    && !validateCoinValueSource.includes('syncShelfSelection')
    && publishJs.includes('missingListPrice')
    && publishWxml.includes('定价缺失，暂不能上漂'),
  'publish should block missing-price books without silently deselecting them',
);

console.log('drift publish form contract ok');
