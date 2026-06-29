const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { calculateCoinValue } = require('../cloudfunctions/api/lib/driftPolicy');
const { pricingChanged } = require('../cloudfunctions/api/lib/driftPricingRecalc');

const systemCoinValue = calculateCoinValue(73.8, 'like_new', 10.9);
assert.strictEqual(systemCoinValue, 11);
assert.strictEqual(Math.min(15, systemCoinValue), 11);
assert.strictEqual(pricingChanged(
  { systemCoinValue: 11, coinValue: 11 },
  { systemCoinValue: 15, coinValue: 15 },
), true);

const driftHandler = fs.readFileSync(path.join(__dirname, '../cloudfunctions/api/handlers/drift.js'), 'utf8');
const apiIndex = fs.readFileSync(path.join(__dirname, '../cloudfunctions/api/index.js'), 'utf8');
assert.ok(driftHandler.includes('migrateDriftPricing'), 'drift handler should expose pricing migration');
assert.ok(driftHandler.includes('resolveDriftCoinFields'), 'publish/update should reuse pricing recalc helper');
assert.ok(apiIndex.includes('system.migrateDriftPricing'), 'api should expose pricing migration route');
assert.ok(fs.existsSync(path.join(__dirname, 'migrate-drift-pricing.js')), 'local migration script should exist');

console.log('drift pricing recalc ok');
