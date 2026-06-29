const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

const apiIndex = read('cloudfunctions/api/index.js');
const adminHandler = read('cloudfunctions/api/handlers/admin.js');
const shelfHandler = read('cloudfunctions/api/handlers/shelf.js');
const poolHandler = read('cloudfunctions/api/handlers/pool.js');
const addressHandler = read('cloudfunctions/api/handlers/address.js');

assert.ok(adminHandler.includes('module.exports') && adminHandler.includes('requireAdmin'), 'admin guard should be exported for route reuse');
assert.ok(apiIndex.includes('guardSystemRoute') && apiIndex.includes('admin.requireAdmin(openid)'), 'system routes should require admin authorization');
assert.ok(!apiIndex.includes("'system.initDb': async () =>"), 'system.initDb should not be anonymously callable');
assert.ok(!apiIndex.includes("'system.importBookCatalogBatch': async (data) =>"), 'catalog import should not be anonymously callable');
assert.ok(!apiIndex.includes("'system.bookCatalogStatus': async () =>"), 'catalog status should not be anonymously callable');

const redeemBlock = shelfHandler.slice(shelfHandler.indexOf('async function redeemCapacity'), shelfHandler.indexOf('async function publicList'));
assert.ok(redeemBlock.includes('db.runTransaction'), 'shelf capacity redemption should be transactional');
assert.ok(redeemBlock.includes("transaction.collection('users').doc(user._id).get()"), 'redemption should re-read fresh user in transaction');
assert.ok(redeemBlock.includes("transaction.collection('coin_transactions')"), 'redemption ledger should be written inside the transaction');
assert.ok(redeemBlock.includes('transactionDocData') && redeemBlock.includes('balanceDelta'), 'redemption should normalize transaction user doc and write balanceDelta');

assert.ok(poolHandler.includes('async function countWanted') && poolHandler.includes("safeQuery('drift_wants'"), 'pool countWanted should exist');
assert.ok(poolHandler.includes("safeQuery('drift_wants'") && poolHandler.includes('query.count'), 'pool stats should count wants directly without formatting wanted list');
assert.ok(!poolHandler.includes('const list = await formatWantedList({ _id: userId });\n  return list.length;'), 'pool stats should not load wanted list just to count');
assert.ok(poolHandler.includes('listFromPoolFeedSnapshot'), 'pool list should read feed snapshot');
assert.ok(read('cloudfunctions/api/lib/poolFeedSnapshot.js').includes('applyPlatformFeedRanking'), 'pool feed rebuild should apply platform ranking pipeline');

assert.ok(shelfHandler.includes('getShelfDashboardForUser'), 'shelf list should read cached dashboard summary');
assert.ok(shelfHandler.includes('publishCandidates'), 'shelf should expose publish candidate endpoint');
assert.ok(shelfHandler.includes('includeDashboard'), 'shelf list should support optional dashboard summary to avoid an extra cloud call');
assert.ok(shelfHandler.includes('cacheBooksForList(db, rawMap, 12).catch'), 'shelf list should keep cover cache best-effort');
assert.ok(shelfHandler.includes('cacheBooksForList(db, rawMap, 12).catch') && shelfHandler.includes('publicList'), 'public shelf path should not block on cover caching');
assert.ok(read('cloudfunctions/api/lib/dbIndexes.js').includes('DB_INDEX_SPECS'), 'performance indexes should be documented');

assert.ok(addressHandler.includes('unsetOtherDefaultAddresses'), 'address default updates should use one shared helper');
assert.ok(addressHandler.includes('Promise.all('), 'address default clearing should update existing addresses in parallel');

console.log('performance and logic hardening contract ok');
