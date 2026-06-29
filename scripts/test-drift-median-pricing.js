const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { calculateCoinValue } = require('../cloudfunctions/api/lib/driftPolicy');
const { attachMedianPrices } = require('../cloudfunctions/api/lib/pricingCache');

const root = path.join(__dirname, '..');
function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

assert.strictEqual(calculateCoinValue(73.8, 'like_new', 10.9), 11, 'median price should skip list-price discount');
assert.strictEqual(calculateCoinValue(73.8, 'like_new', 0), 15, 'missing median should keep list-price discount');
assert.strictEqual(calculateCoinValue(0, 'like_new', 10.9), 11, 'median alone should be enough for cap');

const enriched = attachMedianPrices(
  [{ isbn: '9787020155507', title: '安徒生童话' }],
  { 9787020155507: { isbn: '9787020155507', medianPrice: 10.9 } },
);
assert.strictEqual(enriched[0].medianPrice, 10.9);
assert.strictEqual(enriched[0].listPrice, '¥10.9');
assert.strictEqual(enriched[0].listPriceSource, 'pricing_cache');

const withListPrice = attachMedianPrices(
  [{ isbn: '9787020155507', listPrice: '¥73.80' }],
  { 9787020155507: { isbn: '9787020155507', medianPrice: 10.9 } },
);
assert.strictEqual(withListPrice[0].medianPrice, 10.9);
assert.strictEqual(withListPrice[0].listPrice, '¥73.80');
assert.strictEqual(withListPrice[0].listPriceSource, undefined);

const driftPricing = read('miniprogram/utils/driftPricing.js');
const dbSource = read('cloudfunctions/api/lib/db.js');
assert.ok(driftPricing.includes('parseMedianPrice'), 'client pricing should read median price');
assert.ok(driftPricing.includes('medianPrice * factor'), 'client pricing should prefer median price');
assert.ok(
  dbSource.includes('formatted.medianPrice = medianPrice'),
  'formatBook should expose median price to clients',
);

const { pricingState } = require('../miniprogram/utils/driftPricing');
assert.strictEqual(
  pricingState({ listPrice: '¥73.80', medianPrice: 10.9, listPriceSource: 'book' }, 'like_new').systemCoinValue,
  calculateCoinValue(73.8, 'like_new', 10.9),
  'client system coin value should match backend when median is present',
);

console.log('drift median pricing ok');
