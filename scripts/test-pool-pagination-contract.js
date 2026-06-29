const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const poolHandler = read('cloudfunctions/api/handlers/pool.js');
const poolSnapshot = read('cloudfunctions/api/lib/poolFeedSnapshot.js');
const poolJs = read('miniprogram/pages/pool/index.js');
const poolWxml = read('miniprogram/pages/pool/index.wxml');

assert.ok(poolSnapshot.includes('POOL_LIST_MAX = 500'), 'pool feed rebuild should support loading all in-pool books up to a safe cap');
assert.ok(poolSnapshot.includes('fetchAllInPoolDrifts'), 'pool feed rebuild should batch-fetch all in-pool drifts');
assert.ok(poolSnapshot.includes('.count()'), 'pool feed rebuild should count in-pool drifts before batch fetch');
assert.ok(poolHandler.includes('queryRowsByIdChunks'), 'pool handler should still batch-load shelf rows by id');

const dbSource = read('cloudfunctions/api/lib/db.js');
assert.ok(dbSource.includes('queryRowsByIdChunks'), 'db helper should batch id lookups');
assert.ok(dbSource.includes('IN_QUERY_BATCH = 100'), 'db helper should chunk id lookups at cloud db limits');
assert.ok(poolSnapshot.includes('valueKey'), 'pool snapshot reader should accept value filter from client');
assert.ok(poolSnapshot.includes('conditionKey'), 'pool snapshot reader should accept condition filter from client');
assert.ok(poolSnapshot.includes('hasMore: page * size < total'), 'pool snapshot reader should compute hasMore from total count');
assert.ok(poolHandler.includes('listFromPoolFeedSnapshot'), 'pool list should delegate pagination to snapshot reader');

assert.ok(poolJs.includes('loadList(false)'), 'pool page should request next page on reach bottom');
assert.ok(poolJs.includes('activeValue'), 'pool page should keep active value filter in state');
assert.ok(poolJs.includes('activeCondition'), 'pool page should keep active condition filter in state');
assert.ok(!poolJs.includes('isValueMatched'), 'value filter should be applied on backend, not only client-side');

assert.ok(poolWxml.includes('已加载全部'), 'pool page should show end-of-list footer');

console.log('pool pagination contract ok');
