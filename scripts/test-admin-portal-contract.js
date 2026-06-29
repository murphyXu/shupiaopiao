#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

const indexJs = read('cloudfunctions/api/index.js');
assert.ok(indexJs.includes('admin.auth.login'), 'admin.auth.login route registered');
assert.ok(indexJs.includes('admin.orders.todos'), 'admin.orders.todos route registered');
assert.ok(indexJs.includes('admin.drifts.pin'), 'admin.drifts.pin route registered');
assert.ok(indexJs.includes("'admin.drifts.updateStatus'"), 'route admin.drifts.updateStatus registered');
assert.ok(indexJs.includes('adminPortalVersion'), 'health exposes admin portal version');

const adminAuth = read('cloudfunctions/api/lib/adminAuth.js');
assert.ok(adminAuth.includes('signToken'), 'JWT sign helper present');
assert.ok(adminAuth.includes('verifyPassword'), 'password verify present');

process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD = 'test-pass';
process.env.ADMIN_JWT_SECRET = 'test-secret';
const auth = require('../cloudfunctions/api/lib/adminAuth');
assert.strictEqual(auth.verifyPassword('admin', 'test-pass'), true);
assert.strictEqual(auth.verifyPassword('admin', 'wrong'), false);
const token = auth.signToken({ username: 'admin' }, 1);
assert.ok(auth.verifyToken(token), 'signed token verifies');

const poolOps = require('../cloudfunctions/api/lib/poolOps');
assert.strictEqual(poolOps.MAX_OPS_PINNED, 30, 'pin cap is 30');
const ordered = poolOps.applyOpsPinnedDrifts([
  { _id: 'a', opsPinned: true, opsPinRank: 2 },
  { _id: 'b' },
  { _id: 'c', opsPinned: true, opsPinRank: 1 },
]);
assert.deepStrictEqual(ordered.map((row) => row._id), ['c', 'a', 'b'], 'pinned drifts sort before others');

const ranked = [
  { id: 'x', opsPinned: true, opsPinRank: 2 },
  { id: 'y' },
  { id: 'z', opsPinned: true, opsPinRank: 1 },
];
const pinnedItems = poolOps.applyOpsPinnedItems(ranked);
assert.deepStrictEqual(pinnedItems.map((row) => row.id), ['z', 'x', 'y'], 'pinned items stay first after ranking');

const adminWebReadme = read('admin-web/README.md');
assert.ok(adminWebReadme.includes('本机代理'), 'admin-web documents local proxy mode');
assert.ok(adminWebReadme.includes('TCB_SECRET_ID'), 'admin-web documents TCB credentials');

const driftsHandler = read('cloudfunctions/api/handlers/adminPortal/drifts.js');
assert.ok(driftsHandler.includes('fetchAllDrifts'), 'admin drifts list fetches all rows in batches');
assert.ok(driftsHandler.includes('categoryFilter'), 'admin drifts supports category filter');
assert.ok(driftsHandler.includes('matchesValueKey'), 'admin drifts supports coin range filter');
assert.ok(driftsHandler.includes('matchesPinnedFilter'), 'admin drifts supports pinned filter');
assert.ok(driftsHandler.includes('updateStatus'), 'admin drifts supports status update');
assert.ok(driftsHandler.includes('ADMIN_STATUS_TARGETS'), 'admin status transitions defined');

const poolJs = read('cloudfunctions/api/handlers/pool.js');
assert.ok(poolJs.includes('applyOpsPinnedItems'), 'pool list applies ops pin after ranking');
assert.ok(poolJs.includes('drift.opsCategory'), 'pool respects ops category');
assert.ok(poolJs.includes('drift.opsHidden'), 'pool filters ops hidden');

const driftJs = read('cloudfunctions/api/handlers/drift.js');
assert.ok(driftJs.includes('appealStatus: \'OPEN\''), 'appeal persists open status');

console.log('test-admin-portal-contract: ok');
