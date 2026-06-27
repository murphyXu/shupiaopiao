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
const checkResultJs = read('miniprogram/pages/drift/check-result.js');
const checkResultWxml = read('miniprogram/pages/drift/check-result.wxml');
const batchResultJs = read('miniprogram/pages/drift/batch-result.js');
const shelfHandler = read('cloudfunctions/api/handlers/shelf.js');
const driftPricing = read('miniprogram/utils/driftPricing.js');

assert.ok(appJson.pages.includes('pages/drift/scan-publish'), 'scan publish page should be registered');
assert.ok(appJson.pages.includes('pages/drift/batch-result'), 'batch result page should be registered');

assert.ok(publishEntry.includes('连续扫码上漂') && publishEntry.includes('书架选书上漂'), 'publish entry should expose both modes');
assert.ok(publishEntry.includes('/pages/drift/scan-publish') && publishEntry.includes('/pages/drift/publish?mode=shelf'), 'publish entry should route to both pages');

assert.ok(poolJs.includes('showPublishEntryOptions') && !poolJs.includes("url: '/pages/drift/publish'"), 'pool publish entry should open mode chooser');
assert.ok(walletJs.includes('showPublishEntryOptions'), 'wallet publish entry should open mode chooser');

assert.ok(scanPublishJs.includes("purpose: 'drift_quick'") && scanPublishJs.includes('addShelfBook'), 'scan publish should auto-create quick shelf records');
assert.ok(scanPublishJs.includes('continueScan=1'), 'scan publish should redirect to continue-scan result');
assert.ok(scanPublishWxml.includes('扫码识别图书') && scanPublishWxml.includes('bindtap="doScan"'), 'scan publish page should expose scan actions');

assert.ok(shelfHandler.includes('drift_quick') && shelfHandler.includes('filterShelfRowsForList'), 'shelf handler should hide quick shelf rows from normal list');
assert.ok(shelfHandler.includes('purpose'), 'shelf add should persist purpose');

assert.ok(publishJs.includes('toggleBookSelection') && publishJs.includes('submitBatch'), 'publish page should support multi-select batch submit');
assert.ok(publishWxml.includes('可多选') && publishWxml.includes('toggleBookSelection'), 'publish page should render multi-select picker');
assert.ok(!publishWxml.includes('wx:if="{{!batchMode}}" class="card"'), 'picker should stay visible in batch mode so users can keep adding books');
assert.ok(publishJs.includes('driftPricing') && driftPricing.includes('pricingState'), 'publish pricing should reuse shared drift pricing helper');

assert.ok(checkResultJs.includes('continueScanPublish') && checkResultWxml.includes('继续扫码上漂'), 'check result should offer continue scan publish');
assert.ok(batchResultJs.includes('driftBatchPublishResult'), 'batch result page should read batch publish summary');

console.log('drift publish entry contract ok');
