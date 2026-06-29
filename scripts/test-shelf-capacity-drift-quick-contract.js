const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const shelfCapacityLib = read('cloudfunctions/api/lib/shelfCapacity.js');
const shelfHandler = read('cloudfunctions/api/handlers/shelf.js');
const driftHandler = read('cloudfunctions/api/handlers/drift.js');
const scanPublishJs = read('miniprogram/pages/drift/scan-publish.js');

assert.ok(shelfCapacityLib.includes('countShelfCapacityUsage'), 'shelf capacity helper should count shelf rows');
assert.ok(!shelfCapacityLib.includes('drift_quick'), 'scan publish shelf rows should count toward capacity');
assert.ok(shelfHandler.includes('countShelfCapacityUsage'), 'shelf handler should use shared capacity counter');
assert.ok(shelfHandler.includes('fromScanPublish'), 'scan publish should reuse existing shelf rows without duplicate add');
assert.ok(!shelfHandler.includes('filterShelfRowsForList'), 'shelf list should include scan publish books');
assert.ok(driftHandler.includes('countShelfCapacityUsage'), 'received book add should use shared capacity counter');
assert.ok(scanPublishJs.includes('fromScanPublish: true') && scanPublishJs.includes('addShelfBook'), 'scan publish should add normal shelf records');

console.log('shelf capacity drift quick contract ok');
