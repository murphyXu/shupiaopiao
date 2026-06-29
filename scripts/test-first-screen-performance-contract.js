const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

const api = read('miniprogram/utils/api.js');
const poolPage = read('miniprogram/pages/pool/index.js');
const shelfPage = read('miniprogram/pages/shelf/index.js');
const poolHandler = read('cloudfunctions/api/handlers/pool.js');
const poolSnapshot = read('cloudfunctions/api/lib/poolFeedSnapshot.js');
const shelfHandler = read('cloudfunctions/api/handlers/shelf.js');

assert.ok(api.includes('deferCoverEnrichment'), 'api.call should support deferred cover enrichment');
assert.ok(api.includes('onEnriched'), 'api.call should report asynchronously enriched list data');
assert.ok(poolPage.includes('deferCoverEnrichment: true'), 'pool first-screen list should not wait for cover enrichment');
assert.ok(shelfPage.includes('deferCoverEnrichment: true'), 'shelf first-screen list should not wait for cover enrichment');
assert.ok(poolPage.includes('setTimeout(() => refreshTabBarPendingShip()'), 'pool pending badge refresh should be delayed after first paint');
assert.ok(shelfPage.includes('setTimeout(() => refreshTabBarPendingShip()'), 'shelf pending badge refresh should be delayed after first paint');
assert.ok(poolPage.includes('size: FIRST_SCREEN_POOL_SIZE'), 'pool page should request a small first-screen list');
assert.ok(poolPage.includes('onReachBottom'), 'pool page should load more books on scroll');
assert.ok(poolPage.includes('hasMore'), 'pool page should track whether more pool books remain');
assert.ok(poolHandler.includes('listFromPoolFeedSnapshot'), 'pool list should read materialized feed snapshot');
assert.ok(poolSnapshot.includes('fetchAllInPoolDrifts'), 'pool feed rebuild should still scan in-pool drifts');
assert.ok(poolSnapshot.includes('schedulePoolFeedRebuild'), 'pool feed snapshot should support async rebuild');
assert.ok(read('cloudfunctions/api/handlers/drift.js').includes("schedulePoolFeedRebuild('drift_publish')"), 'publish should trigger feed rebuild');
assert.ok(poolPage.includes('pageCache'), 'pool page should use stale-while-revalidate cache');
assert.ok(shelfPage.includes('pageCache'), 'shelf page should use stale-while-revalidate cache');
assert.ok(read('miniprogram/pages/drift/publish.js').includes('getPublishCandidates'), 'publish page should use lightweight shelf candidates');
assert.ok(shelfPage.includes('FIRST_SCREEN_SHELF_SIZE'), 'shelf page should request a smaller first-screen shelf batch');
assert.ok(shelfPage.includes('onReachBottom'), 'shelf page should load more books on scroll');
assert.ok(shelfPage.includes('shelfHasMore'), 'shelf page should track pagination state');
assert.ok(!shelfPage.includes('loadRemainingShelfBooks'), 'shelf page should paginate instead of loading all remaining books');
assert.ok(shelfHandler.includes('hasMore:'), 'shelf backend should report pagination state');
assert.ok(shelfHandler.includes('publishCandidates'), 'shelf backend should expose publish candidate list');
assert.ok(shelfHandler.includes('getShelfDashboardForUser'), 'shelf list should read cached dashboard summary');
assert.ok(!shelfHandler.includes('await healStaleBookClassification(pageRows, books)'), 'shelf list read path should not heal classification synchronously');
assert.ok(poolSnapshot.includes('cacheBooksForList(db, rawBooks, 12).catch'), 'pool list hydration should not block on cover caching');

console.log('first screen performance contract ok');
