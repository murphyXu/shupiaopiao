const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { policyForStage, PUBLISH_RATE_LIMIT_STATUSES } = require('../cloudfunctions/api/lib/driftPolicy');
const { runAutoCheck } = require('../cloudfunctions/api/lib/pricing');
const { settingsPointRules, publishEarnGuideModal } = require('../miniprogram/utils/pointRules');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

assert.deepStrictEqual(PUBLISH_RATE_LIMIT_STATUSES, ['PENDING_REVIEW', 'IN_POOL', 'CLAIMED', 'COMPLETED']);
assert.strictEqual(policyForStage('cold').publishDailyLimit, 100);

const user = { creditScore: 100 };
const book = { isbn: '9780000000001' };
const drift = {};
const limit = 100;

assert.strictEqual(runAutoCheck(drift, book, user, limit, 0, limit).passed, true);
const blocked = runAutoCheck(drift, book, user, limit + 1, 0, limit);
assert.strictEqual(blocked.passed, false);
assert.strictEqual(blocked.reasons[0].code, 'RATE_LIMIT');
assert.ok(blocked.reasons[0].message.includes('24 小时内最多可上漂 100 本'));

const driftHandler = read('cloudfunctions/api/handlers/drift.js');
assert.ok(driftHandler.includes('PUBLISH_RATE_LIMIT_STATUSES'), 'publish should count only effective drifts for rate limit');
assert.ok(driftHandler.includes('policy().publishDailyLimit'), 'publish should read daily limit from policy');

const settings = settingsPointRules();
const usageLimit = settings.sections.find((section) => section.title === '使用限制');
assert.ok(usageLimit.body.includes('24 小时内最多上漂 100 本'), 'settings should explain publish daily limit');
assert.ok(usageLimit.body.includes('未通过或已取消的不计入'), 'settings should explain rejected/cancelled drifts are excluded');

const earnGuide = publishEarnGuideModal();
assert.ok(earnGuide.content.includes('【上漂频率】'), 'publish earn guide should include rate limit section');
assert.ok(earnGuide.content.includes('24 小时内最多上漂 100 本'), 'publish earn guide should state daily limit');

console.log('drift publish rate limit ok');
