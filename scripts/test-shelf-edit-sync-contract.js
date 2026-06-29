const assert = require('assert');
const fs = require('fs');
const path = require('path');

const shelfHandler = fs.readFileSync(path.join(__dirname, '../cloudfunctions/api/handlers/shelf.js'), 'utf8');
const driftHandler = fs.readFileSync(path.join(__dirname, '../cloudfunctions/api/handlers/drift.js'), 'utf8');
const apiRoutes = fs.readFileSync(path.join(__dirname, '../cloudfunctions/api/index.js'), 'utf8');
const apiUtils = fs.readFileSync(path.join(__dirname, '../miniprogram/utils/api.js'), 'utf8');
const detailJs = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/book/detail.js'), 'utf8');
const detailWxml = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/book/detail.wxml'), 'utf8');
const bookCategory = fs.readFileSync(path.join(__dirname, '../cloudfunctions/api/lib/bookCategory.js'), 'utf8');

assert.ok(bookCategory.includes('CHILD_CLC_RE') && bookCategory.includes('/^I28/i'), 'I28 CLC prefix should map to child shelf category');
assert.ok(shelfHandler.includes('let book = await getBookById'), 'shelf update should allow syncing book category after bookClass change');
assert.ok(shelfHandler.includes('async function detail') && shelfHandler.includes('booksByIdsWithPrices'), 'shelf detail should load one record with book prices');
assert.ok(shelfHandler.includes('canEdit') && shelfHandler.includes('conditionIssues'), 'activeDrift should expose editable drift fields on shelf detail');
assert.ok(driftHandler.includes('async function updateOpen') && driftHandler.includes('OPEN_DRIFT_EDIT_STATUSES'), 'backend should allow editing open drifts');
assert.ok(driftHandler.includes('resolveRequestedCoinValue'), 'open drift update should validate coin value');
assert.ok(apiRoutes.includes("'drift.updateOpen':"), 'api routes should expose drift.updateOpen');
assert.ok(apiUtils.includes('updateOpenDrift'), 'client api should expose updateOpenDrift');
assert.ok(apiRoutes.includes("'shelf.detail':"), 'api routes should expose shelf.detail');
assert.ok(apiUtils.includes('getShelfBookDetail'), 'client api should expose getShelfBookDetail');
assert.ok(detailJs.includes('getShelfBookDetail'), 'book detail should load shelf record by id');
assert.ok(!detailJs.includes("getShelfBooks('all')"), 'book detail should not scan paginated shelf list');
assert.ok(detailJs.includes('confirmShelfChanges') && detailJs.includes('draftDirty') && detailJs.includes('updateOpenDrift'), 'book detail should batch-save shelf and drift edits');
assert.ok(detailWxml.includes('wx:for-item="cond"') && detailWxml.includes('wx:for-item="issue"'), 'drift condition chips should avoid item name collision');
assert.ok(detailWxml.includes('class="btn-primary action-btn"') && !detailWxml.includes('<button class="btn-primary confirm-btn"'), 'confirm save should reuse action button layout');
assert.ok(detailWxml.includes('item.activeDrift.conditionLabel') && detailWxml.includes('item.activeDrift.coinValue'), 'claimed drift should show read-only summary');
assert.ok(detailWxml.includes('品相档位') && detailWxml.includes('品相描述'), 'book detail should expose drift condition editing for open drifts');
assert.ok(!detailJs.includes('changeReadingStatus') && !detailJs.includes('saveCustomLocation'), 'book detail should not auto-save shelf fields on each tap');

console.log('shelf edit sync contract ok');
