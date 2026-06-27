const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const poolHandler = read('cloudfunctions/api/handlers/pool.js');
const poolRecommend = require('../cloudfunctions/api/lib/poolRecommend');
const poolJs = read('miniprogram/pages/pool/index.js');
const poolDetailJs = read('miniprogram/pages/pool/detail.js');
const poolWxml = read('miniprogram/pages/pool/index.wxml');

assert.ok(poolHandler.includes('poolRecommendProfile') && poolHandler.includes('rankPoolList'), 'pool list should use recommendation ranking');
assert.ok(poolHandler.includes('applyGiverDensityCap'), 'pool list should cap same-giver density in first screen');
assert.ok(poolHandler.includes('giverId: drift.userId'), 'pool items should expose giver id for density cap');
assert.ok(poolHandler.includes('data.claimableOnly !== false'), 'logged-in pool list should exclude own drifts by default');
assert.ok(poolHandler.includes('loadUserInterestProfile'), 'pool list should build user interest profile');

assert.strictEqual(typeof poolRecommend.diversifyPoolList, 'function', 'diversifyPoolList exported');
assert.strictEqual(typeof poolRecommend.rankPoolList, 'function', 'rankPoolList exported');

const coldProfile = poolRecommend.createEmptyProfile();
const diverseItems = [
  { id: 'a', category: 'literature', createdAt: '2026-06-20T00:00:00.000Z', book: { author: 'A' } },
  { id: 'b', category: 'literature', createdAt: '2026-06-19T00:00:00.000Z', book: { author: 'B' } },
  { id: 'c', category: 'science', createdAt: '2026-06-18T00:00:00.000Z', book: { author: 'C' } },
  { id: 'd', category: 'children', createdAt: '2026-06-17T00:00:00.000Z', book: { author: 'D' } },
];
const diversified = poolRecommend.diversifyPoolList(diverseItems, 0);
assert.strictEqual(diversified.length, 4, 'diversify should keep all items');
const firstThreeCategories = diversified.slice(0, 3).map((item) => item.category);
assert.ok(new Set(firstThreeCategories).size >= 2, 'cold-start diversify should interleave categories');

let profile = poolRecommend.createEmptyProfile();
profile = poolRecommend.applyShelfSignals(profile, [{ bookId: 'b1' }], {
  b1: { title: '三体', author: '刘慈欣', category: 'I247' },
});
profile = poolRecommend.finalizeProfile(profile);
const literatureItem = { category: 'literature', createdAt: '2026-06-01T00:00:00.000Z', book: { author: '刘慈欣' } };
const otherItem = { category: 'other', createdAt: '2026-06-20T00:00:00.000Z', book: { author: 'Unknown' } };
const ranked = poolRecommend.rankPoolList([otherItem, literatureItem], profile, { uidHash: 'user-1' });
assert.strictEqual(ranked[0].category, 'literature', 'warm users should rank matching categories higher');

const sameGiverItems = [
  { id: '1', giverId: 'u1', category: 'literature', createdAt: '2026-06-20T00:00:00.000Z', book: {} },
  { id: '2', giverId: 'u1', category: 'literature', createdAt: '2026-06-19T00:00:00.000Z', book: {} },
  { id: '3', giverId: 'u1', category: 'literature', createdAt: '2026-06-18T00:00:00.000Z', book: {} },
  { id: '4', giverId: 'u2', category: 'science', createdAt: '2026-06-17T00:00:00.000Z', book: {} },
];
const capped = poolRecommend.applyGiverDensityCap(sameGiverItems, { windowSize: 3, maxPerGiver: 2 });
const headGiverCounts = {};
capped.slice(0, 3).forEach((item) => {
  headGiverCounts[item.giverId] = (headGiverCounts[item.giverId] || 0) + 1;
});
assert.ok((headGiverCounts.u1 || 0) <= 2, 'first screen should cap books from the same giver');
assert.strictEqual(capped.length, 4, 'density cap should keep all pool items');

assert.ok(poolJs.includes('claimableOnly: true'), 'pool page should default to claimable-only feed');
assert.ok(poolJs.includes('claimableOnly: loggedIn'), 'pool page should exclude own drifts for logged-in users');
assert.ok(poolJs.includes("page: 'pool/index'") && poolJs.includes('pool_card_click'), 'pool list should emit browse click signals');
assert.ok(poolDetailJs.includes('category: item.category') && poolDetailJs.includes('author:'), 'pool detail should emit category and author');
assert.ok(poolWxml.includes('data-category="{{item.category}}"'), 'pool cards should pass category into browse signals');

console.log('pool recommend contract ok');
