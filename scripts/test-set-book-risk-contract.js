const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { detectSetBookRisk, normalizeSetConfirmation } = require('../cloudfunctions/api/lib/setBookRisk');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const highRisk = detectSetBookRisk({ title: '哈利波特全集 全7册' });
assert.strictEqual(highRisk.setBookRisk, true);
assert.strictEqual(highRisk.setBookRiskLevel, 'high');
assert.ok(highRisk.setBookRiskReason.includes('全7册'));

const mediumRisk = detectSetBookRisk({ title: '神奇校车系列：水的故事' });
assert.strictEqual(mediumRisk.setBookRisk, true);
assert.strictEqual(mediumRisk.setBookRiskLevel, 'medium');

const normalBook = detectSetBookRisk({ title: '小王子', summary: '经典童话' });
assert.strictEqual(normalBook.setBookRisk, false);

assert.deepStrictEqual(
  normalizeSetConfirmation({ setCompleteness: 'complete' }, highRisk),
  { ok: true, setCompleteness: 'complete', setDescription: '' },
);
assert.deepStrictEqual(
  normalizeSetConfirmation({ setCompleteness: 'non_set' }, highRisk),
  { ok: true, setCompleteness: 'non_set', setDescription: '' },
);
assert.strictEqual(
  normalizeSetConfirmation({ setCompleteness: 'partial', setDescription: '' }, highRisk).ok,
  false,
);
assert.strictEqual(
  normalizeSetConfirmation({ setCompleteness: '' }, highRisk).ok,
  false,
);

const publishJs = read('miniprogram/pages/drift/publish.js');
const publishWxml = read('miniprogram/pages/drift/publish.wxml');
const scanPublishJs = read('miniprogram/pages/drift/scan-publish.js');
const scanPublishWxml = read('miniprogram/pages/drift/scan-publish.wxml');
const setBookRiskUtil = read('miniprogram/utils/setBookRisk.js');
const driftHandler = read('cloudfunctions/api/handlers/drift.js');
const poolHandler = read('cloudfunctions/api/handlers/pool.js');
const poolDetailWxml = read('miniprogram/pages/pool/detail.wxml');
const claimWxml = read('miniprogram/pages/drift/claim.wxml');

assert.ok(publishJs.includes('detectSetBookRisk') && publishJs.includes('selectedRiskItems'), 'publish page should detect and track set book risk');
assert.ok(publishWxml.includes('赠出内容确认') && setBookRiskUtil.includes('非套装书'), 'publish page should ask suspected set books to confirm content');
assert.ok(publishJs.includes('validateSetConfirmations') && publishJs.includes('setCompleteness'), 'publish submit should validate set confirmation before calling backend');
assert.ok(publishJs.includes('scrollToSetConfirm') && publishWxml.includes('set-confirm-section'), 'publish page should guide users to set confirmation section');
assert.ok(publishWxml.includes('needsSetConfirmation') && publishWxml.includes('pendingSetConfirmCount'), 'publish page should mark books needing set confirmation');
assert.ok(scanPublishJs.includes('detectSetBookRisk') && scanPublishWxml.includes('赠出内容确认'), 'scan publish should support set confirmation');
assert.ok(driftHandler.includes('normalizeSetConfirmation') && driftHandler.includes('setDescription'), 'backend publish should validate and persist set confirmation');
assert.ok(poolHandler.includes('setCompleteness') && poolHandler.includes('setDescription'), 'pool should expose set confirmation fields');
assert.ok(poolDetailWxml.includes('赠出内容') && poolDetailWxml.includes('setDescription'), 'pool detail should show set confirmation');
assert.ok(claimWxml.includes('赠出内容') && claimWxml.includes('setDescription'), 'claim page should show set confirmation before applying');

console.log('set book risk contract ok');
