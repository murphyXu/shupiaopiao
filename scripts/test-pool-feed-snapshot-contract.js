const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

const snapshot = read('cloudfunctions/api/lib/poolFeedSnapshot.js');
const poolHandler = read('cloudfunctions/api/handlers/pool.js');
const poolPage = read('miniprogram/pages/pool/index.js');
const poolRecommend = require('../cloudfunctions/api/lib/poolRecommend');
const poolOps = require('../cloudfunctions/api/lib/poolOps');

assert.ok(snapshot.includes('applyPlatformFeedRanking'), 'snapshot rebuild should use platform feed ranking');
assert.ok(snapshot.includes('applyOpsPinnedItems'), 'snapshot rebuild should keep ops pin as final step');
assert.ok(snapshot.includes('promoteTopLowPointChildren'), 'snapshot rebuild should promote low-point children');
assert.ok(snapshot.includes('feedVersion'), 'snapshot meta should expose feedVersion');
assert.ok(snapshot.includes('listFromPoolFeedSnapshot'), 'pool list should read paginated snapshot');
assert.ok(snapshot.includes('ensurePoolFeedMeta'), 'pool feed should rebuild when snapshot is missing or stale-empty');
assert.ok(snapshot.includes("queryRowsByIdChunks('drifts'"), 'pool list hydration should chunk drift id lookups');
assert.ok(snapshot.includes('rankedEntriesFromLivePool'), 'pool list should fall back to live feed when snapshot is empty');
assert.ok(poolHandler.includes('listFromPoolFeedSnapshot'), 'pool handler should delegate list to snapshot reader');
assert.ok(!poolHandler.includes('loadUserInterestProfile(user._id, openid)'), 'pool list should not load per-user profile');
assert.ok(poolPage.includes('feedVersion'), 'pool page should track feedVersion');
assert.ok(!poolPage.includes('recommendSort'), 'pool page should trust server feed order');
assert.ok(read('cloudfunctions/api/lib/collections.js').includes('pool_feed_meta'), 'pool feed meta collection should exist');

const base = poolRecommend.applyGiverDensityCap(poolRecommend.rankPoolList([
  { id: 'b', category: 'literature', coinValue: 8, createdAt: '2026-06-01T00:00:00.000Z', book: { author: 'B' } },
  { id: 'a', category: 'children', coinValue: 3, createdAt: '2026-06-02T00:00:00.000Z', book: { author: 'A' } },
  { id: 'pin', opsPinned: true, opsPinRank: 1, category: 'other', coinValue: 1, createdAt: '2026-05-01T00:00:00.000Z', book: {} },
], poolRecommend.createEmptyProfile(), { uidHash: 'platform-feed' }));
const ranked = poolOps.applyOpsPinnedItems(poolRecommend.promoteTopLowPointChildren(base, 6));
assert.strictEqual(ranked[0].id, 'pin', 'ops pin should remain first in platform snapshot ranking');

console.log('pool feed snapshot contract ok');
