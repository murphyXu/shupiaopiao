const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

const poolJs = read('cloudfunctions/api/handlers/pool.js');
const driftJs = read('cloudfunctions/api/handlers/drift.js');

assert.ok(!poolJs.includes('refreshBooksCoverMetadata'), 'pool handler should not sync refresh book covers via tanshu');
assert.ok(!poolJs.includes('refreshBookCoverMetadata'), 'pool detail should not sync refresh book covers via tanshu');
assert.ok(!driftJs.includes('refreshBooksCoverMetadata'), 'drift orders should not sync refresh book covers via tanshu');
assert.ok(!driftJs.includes('refreshBookCoverMetadata'), 'drift order detail should not sync refresh book covers via tanshu');

console.log('tanshu list no sync refresh contract ok');
