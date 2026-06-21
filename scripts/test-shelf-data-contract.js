const assert = require('assert');
const fs = require('fs');
const path = require('path');

const utilSource = fs.readFileSync(path.join(__dirname, '../miniprogram/utils/util.js'), 'utf8');
const shelfHandler = fs.readFileSync(path.join(__dirname, '../cloudfunctions/api/handlers/shelf.js'), 'utf8');
const dbSource = fs.readFileSync(path.join(__dirname, '../cloudfunctions/api/lib/db.js'), 'utf8');
const bookLookup = fs.readFileSync(path.join(__dirname, '../cloudfunctions/api/lib/bookLookup.js'), 'utf8');
const tanshu = fs.readFileSync(path.join(__dirname, '../cloudfunctions/api/lib/bookProviders/tanshu.js'), 'utf8');
const authHandler = fs.readFileSync(path.join(__dirname, '../cloudfunctions/api/handlers/auth.js'), 'utf8');
const dbSourceAll = fs.readFileSync(path.join(__dirname, '../cloudfunctions/api/lib/db.js'), 'utf8');
const bookCategory = fs.readFileSync(path.join(__dirname, '../cloudfunctions/api/lib/bookCategory.js'), 'utf8');

assert.ok(utilSource.includes('BOOK_CLASSES'), 'frontend should define simplified book classes');
assert.ok(utilSource.includes('SHELF_LOCATIONS'), 'frontend should define default shelf locations');
assert.ok(utilSource.includes('reading') && utilSource.includes('read') && utilSource.includes('want_read'), 'frontend should keep reading status options');
assert.ok(utilSource.includes('child') && utilSource.includes('童书'), 'frontend should include child book class');

assert.ok(shelfHandler.includes('readingStatus'), 'shelf handler should persist readingStatus');
assert.ok(shelfHandler.includes('bookClass'), 'shelf handler should persist bookClass');
assert.ok(shelfHandler.includes('shelfLocationName'), 'shelf handler should persist shelfLocationName');
assert.ok(shelfHandler.includes('sourceCategory'), 'shelf handler should expose source book category for filtering');
assert.ok(shelfHandler.includes('displayCategory'), 'shelf handler should expose one canonical display category to avoid shelf/detail mismatch');
assert.ok(shelfHandler.includes('normalizeShelfMeta'), 'shelf handler should normalize legacy shelf rows');
assert.ok(shelfHandler.includes('formatShelfBook'), 'shelf handler should format enriched shelf book rows');

assert.ok(dbSource.includes('listPrice'), 'book formatter should expose listPrice');
assert.ok(bookLookup.includes('listPrice'), 'book upsert should persist listPrice from providers');
assert.ok(tanshu.includes('/api/isbn/v2/index'), 'tanshu provider should use professional ISBN endpoint');
assert.ok(tanshu.includes('data.class') && tanshu.includes('listPrice'), 'tanshu provider should normalize professional class and list price');
assert.ok(bookCategory.includes('normalizeBookCategory') && bookCategory.includes('红楼梦') && bookCategory.includes('水浒传'), 'book category should normalize CLC codes and classic novels');
assert.ok(dbSource.includes('normalizeBookCategory') && shelfHandler.includes('normalizeBookCategory'), 'book formatter and shelf handler should expose category names instead of CLC codes');
assert.ok(bookLookup.includes('needsProviderRefresh') && bookLookup.includes('refreshByIsbn'), 'book lookup should refresh cached books missing professional metadata');
assert.ok(authHandler.includes('shelfName') && authHandler.includes('slice(0, 12)'), 'profile update should support constrained shelfName');
assert.ok(dbSourceAll.includes('shelfName'), 'user formatter should expose shelfName');

console.log('shelf data contract ok');
