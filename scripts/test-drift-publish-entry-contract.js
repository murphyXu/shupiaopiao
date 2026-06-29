const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const appJson = JSON.parse(read('miniprogram/app.json'));
const publishEntry = read('miniprogram/utils/publishEntry.js');
const poolJs = read('miniprogram/pages/pool/index.js');
const walletJs = read('miniprogram/pages/mine/wallet.js');
const publishJs = read('miniprogram/pages/drift/publish.js');
const publishWxml = read('miniprogram/pages/drift/publish.wxml');
const scanPublishJs = read('miniprogram/pages/drift/scan-publish.js');
const scanPublishWxml = read('miniprogram/pages/drift/scan-publish.wxml');
const scanPublishJson = read('miniprogram/pages/drift/scan-publish.json');
const checkResultJs = read('miniprogram/pages/drift/check-result.js');
const checkResultWxml = read('miniprogram/pages/drift/check-result.wxml');
const batchResultJs = read('miniprogram/pages/drift/batch-result.js');
const batchResultWxml = read('miniprogram/pages/drift/batch-result.wxml');
const shelfHandler = read('cloudfunctions/api/handlers/shelf.js');
const driftPricing = read('miniprogram/utils/driftPricing.js');

assert.ok(appJson.pages.includes('pages/drift/scan-publish'), 'scan publish page should be registered');
assert.ok(appJson.pages.includes('pages/drift/batch-result'), 'batch result page should be registered');

assert.ok(publishEntry.includes('直接扫码上漂') && publishEntry.includes('书架选书上漂'), 'publish entry should expose both modes');
assert.ok(publishEntry.includes('scanAndOpenPublish') && publishEntry.includes('wx.scanCode'), 'publish entry should scan before opening scan publish page');
assert.ok(publishEntry.includes('/pages/drift/scan-publish?isbn=') && publishEntry.includes('/pages/drift/publish?mode=shelf'), 'publish entry should route to both pages');

assert.ok(poolJs.includes('showPublishEntryOptions') && !poolJs.includes("url: '/pages/drift/publish'"), 'pool publish entry should open mode chooser');
assert.ok(walletJs.includes('showPublishEntryOptions'), 'wallet publish entry should open mode chooser');

assert.ok(scanPublishJs.includes('fromScanPublish: true') && scanPublishJs.includes('addShelfBook'), 'scan publish should add shelf records with scan defaults');
assert.ok(!scanPublishJs.includes("purpose: 'drift_quick'"), 'scan publish should not hide books as drift_quick');
assert.ok(!scanPublishJs.includes('this.doScan();') || scanPublishJs.includes('options.autoScan'), 'scan publish should not auto scan on every load');
assert.ok(scanPublishJs.includes('continuousScan') && scanPublishJs.includes('continueBatchScan'), 'scan publish should support batch continuous scan without result page');
assert.ok(scanPublishJs.includes('goFinishGiven') && scanPublishWxml.includes('完成，查看我送出的书'), 'scan publish should offer finish link during multi-book sessions');
assert.ok(scanPublishWxml.includes('批量连续上漂') && scanPublishWxml.includes('sessionCount >= 1'), 'batch toggle should appear from the second book onward');
assert.ok(scanPublishWxml.includes('扫码识别图书') && scanPublishWxml.includes('bindtap="doScan"'), 'scan publish page should expose scan actions');
assert.ok(scanPublishJson.includes('扫码上漂'), 'scan publish title should describe single scan flow');

assert.ok(shelfHandler.includes('fromScanPublish') && shelfHandler.includes('DEFAULT_LOCATION'), 'shelf add should apply default shelf for scan publish');
assert.ok(!shelfHandler.includes('filterShelfRowsForList'), 'shelf handler should list scan publish books');

assert.ok(publishJs.includes('toggleBookSelection') && publishJs.includes('submitBatch'), 'publish page should support multi-select batch submit');
assert.ok(publishWxml.includes('可多选') && publishWxml.includes('toggleBookSelection'), 'publish page should render multi-select picker');
assert.ok(!publishWxml.includes('wx:if="{{!batchMode}}" class="card"'), 'picker should stay visible in batch mode so users can keep adding books');
assert.ok(publishJs.includes('driftPricing') && driftPricing.includes('pricingState'), 'publish pricing should reuse shared drift pricing helper');

assert.ok(checkResultJs.includes('goGivenList') && checkResultWxml.includes('查看我送出的书'), 'check result should route to given list after publish');
assert.ok(checkResultJs.includes('continueScanPublish') && checkResultWxml.includes('继续扫码下一本'), 'check result should offer continue scan publish');
assert.ok(
  checkResultJs.includes("showContinueScan: options.source === 'scan'")
    && checkResultWxml.includes('passed && showContinueScan'),
  'continue scan should only appear after direct scan publish',
);
assert.ok(!checkResultWxml.includes('查看漂流广场'), 'check result should not push users to the public pool');
assert.ok(batchResultJs.includes('goGivenList') && batchResultWxml.includes('查看我送出的书'), 'batch result should route to given list');
assert.ok(!batchResultWxml.includes('查看漂流广场'), 'batch result should not push users to the public pool');
assert.ok(batchResultJs.includes('driftBatchPublishResult'), 'batch result page should read batch publish summary');

console.log('drift publish entry contract ok');
