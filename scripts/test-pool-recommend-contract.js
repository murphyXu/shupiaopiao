const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const poolHandler = read('cloudfunctions/api/handlers/pool.js');
const poolSnapshotSource = read('cloudfunctions/api/lib/poolFeedSnapshot.js');
const poolRecommendSource = read('cloudfunctions/api/lib/poolRecommend.js');
const poolRecommend = require('../cloudfunctions/api/lib/poolRecommend');
const poolJs = read('miniprogram/pages/pool/index.js');
const poolDetailJs = read('miniprogram/pages/pool/detail.js');
const poolWxml = read('miniprogram/pages/pool/index.wxml');

assert.ok(poolSnapshotSource.includes('rankPoolList') && poolSnapshotSource.includes('applyPlatformFeedRanking'), 'pool feed snapshot should use platform recommendation ranking');
assert.ok(poolSnapshotSource.includes('applyGiverDensityCap'), 'pool feed snapshot should cap same-giver density');
assert.ok(poolHandler.includes('giverId: drift.userId'), 'pool items should expose giver id for density cap');
assert.ok(poolSnapshotSource.includes("claimableOnly && user && entry.giverId === user._id"), 'pool snapshot reader should support claimable-only filter');
assert.ok(poolRecommendSource.includes('DEFAULT_PRIORITIZE_CATEGORY'), 'pool recommend should define children-first category key');
assert.ok(poolRecommendSource.includes('PLATFORM_CHILDREN_BOOST'), 'pool recommend should boost children books by default');
assert.ok(poolRecommendSource.includes('promoteTopLowPointChildren'), 'pool recommend should promote low-point children to top slots');
assert.ok(poolSnapshotSource.includes('promoteTopLowPointChildren'), 'recommend feed snapshot should promote low-point children after ranking');
assert.ok(poolSnapshotSource.includes('applyOpsPinnedItems'), 'recommend feed snapshot should apply ops pin after all ranking');

const poolOps = require('../cloudfunctions/api/lib/poolOps');
const pinAfterRank = poolOps.applyOpsPinnedItems([
  { id: 'b', category: 'literature' },
  { id: 'a', opsPinned: true, opsPinRank: 2 },
  { id: 'c', opsPinned: true, opsPinRank: 1 },
]);
assert.deepStrictEqual(pinAfterRank.map((item) => item.id), ['c', 'a', 'b'], 'ops pin should win over recommend ranking');

assert.strictEqual(typeof poolRecommend.diversifyPoolList, 'function', 'diversifyPoolList exported');
assert.strictEqual(typeof poolRecommend.rankPoolList, 'function', 'rankPoolList exported');

const coldProfile = poolRecommend.createEmptyProfile();
const diverseItems = [
  { id: 'a', category: 'literature', createdAt: '2026-06-20T00:00:00.000Z', book: { author: 'A' } },
  { id: 'b', category: 'literature', createdAt: '2026-06-19T00:00:00.000Z', book: { author: 'B' } },
  { id: 'c', category: 'business', createdAt: '2026-06-18T00:00:00.000Z', book: { author: 'C' } },
  { id: 'd', category: 'children', createdAt: '2026-06-17T00:00:00.000Z', book: { author: 'D' } },
];
const diversified = poolRecommend.diversifyPoolList(diverseItems, 0, {
  prioritizeCategory: 'children',
});
assert.strictEqual(diversified.length, 4, 'diversify should keep all items');
assert.strictEqual(diversified[0].category, 'children', 'cold-start diversify should lead with children books');
const firstThreeCategories = diversified.slice(0, 3).map((item) => item.category);
assert.ok(new Set(firstThreeCategories).size >= 2, 'cold-start diversify should interleave categories');

const childrenItem = { category: 'children', createdAt: '2026-06-01T00:00:00.000Z', book: { author: '绘本作者' } };
const literatureItem = { category: 'literature', createdAt: '2026-06-20T00:00:00.000Z', book: { author: '作家' } };
const coldRanked = poolRecommend.rankPoolList([literatureItem, childrenItem], coldProfile, { uidHash: 'user-1' });
assert.strictEqual(coldRanked[0].category, 'children', 'cold-start ranking should prioritize children books');

let profile = poolRecommend.createEmptyProfile();
profile = poolRecommend.applyShelfSignals(profile, [{ bookId: 'b1' }], {
  b1: { title: '三体', author: '刘慈欣', category: 'I247' },
});
profile = poolRecommend.finalizeProfile(profile);
const literatureWarmItem = { category: 'literature', createdAt: '2026-06-01T00:00:00.000Z', book: { author: '刘慈欣' } };
const otherItem = { category: 'other', createdAt: '2026-06-20T00:00:00.000Z', book: { author: 'Unknown' } };
const ranked = poolRecommend.rankPoolList([otherItem, literatureWarmItem], profile, { uidHash: 'user-1' });
assert.strictEqual(ranked[0].category, 'literature', 'warm users should rank matching categories higher');

const sameGiverItems = [
  { id: '1', giverId: 'u1', category: 'literature', createdAt: '2026-06-20T00:00:00.000Z', book: {} },
  { id: '2', giverId: 'u1', category: 'literature', createdAt: '2026-06-19T00:00:00.000Z', book: {} },
  { id: '3', giverId: 'u1', category: 'literature', createdAt: '2026-06-18T00:00:00.000Z', book: {} },
  { id: '4', giverId: 'u2', category: 'business', createdAt: '2026-06-17T00:00:00.000Z', book: {} },
];
const capped = poolRecommend.applyGiverDensityCap(sameGiverItems, { windowSize: 3, maxPerGiver: 2 });
const headGiverCounts = {};
capped.slice(0, 3).forEach((item) => {
  headGiverCounts[item.giverId] = (headGiverCounts[item.giverId] || 0) + 1;
});
assert.ok((headGiverCounts.u1 || 0) <= 2, 'first screen should cap books from the same giver');
assert.strictEqual(capped.length, 4, 'density cap should keep all pool items');

const lowPointChildren = { id: 'lc1', category: 'children', coinValue: 3, createdAt: '2026-06-01T00:00:00.000Z', book: {} };
const highPointChildren = { id: 'hc1', category: 'children', coinValue: 8, createdAt: '2026-06-20T00:00:00.000Z', book: {} };
const literatureLow = { id: 'll1', category: 'literature', coinValue: 2, createdAt: '2026-06-21T00:00:00.000Z', book: {} };
const promoted = poolRecommend.promoteTopLowPointChildren([literatureLow, highPointChildren, lowPointChildren]);
assert.strictEqual(promoted[0].id, 'lc1', 'top slots should prioritize 0-5 point children books');
const manyLowPointChildren = Array.from({ length: 7 }, (_, index) => ({
  id: `lc-${index}`,
  category: 'children',
  coinValue: index,
  createdAt: `2026-06-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
  book: {},
}));
const promotedMany = poolRecommend.promoteTopLowPointChildren([
  { id: 'other', category: 'literature', coinValue: 1, createdAt: '2026-06-30T00:00:00.000Z', book: {} },
  ...manyLowPointChildren,
]);
assert.ok(
  promotedMany.slice(0, 6).every((item) => poolRecommend.isLowPointChildrenItem(item)),
  'first six slots should be filled with 0-5 point children when enough are available',
);

assert.ok(poolJs.includes('feedVersion'), 'pool page should track server feed version');
assert.ok(poolJs.includes('pageCache'), 'pool page should cache list for stale-while-revalidate');
assert.ok(!poolJs.includes('recommendSort'), 'pool page should trust server feed order');
assert.ok(poolJs.includes('claimableOnly: false'), 'pool page should include own drifts for logged-in givers');
assert.ok(!poolJs.includes('claimableOnly: loggedIn'), 'pool page should not exclude own drifts when logged in');
assert.ok(poolJs.includes('onReachBottom'), 'pool page should support scroll pagination');
assert.ok(poolJs.includes('valueKey:'), 'pool page should send value filter to backend');
assert.ok(poolJs.includes('mergePoolList'), 'pool page should append later pages without dropping earlier items');
assert.ok(poolSnapshotSource.includes('matchesValueKey'), 'pool snapshot reader should filter by value range');
assert.ok(poolSnapshotSource.includes('hasMore:'), 'pool snapshot reader should expose pagination state');
assert.ok(poolJs.includes("page: 'pool/index'") && poolJs.includes('pool_card_click'), 'pool list should emit browse click signals');
assert.ok(poolDetailJs.includes('category: item.category') && poolDetailJs.includes('author:'), 'pool detail should emit category and author');
assert.ok(poolWxml.includes('data-category="{{item.category}}"'), 'pool cards should pass category into browse signals');

console.log('pool recommend contract ok');
