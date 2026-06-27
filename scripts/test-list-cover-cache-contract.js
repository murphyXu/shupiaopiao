const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const listCoverCache = read('cloudfunctions/api/lib/listCoverCache.js');

assert.ok(listCoverCache.includes('cacheRemoteBookCover'), 'list cover cache should reuse server-side remote cover cache');
assert.ok(listCoverCache.includes('hasRemoteCoverSource'), 'list cover cache should only process books with remote cover URLs');
assert.ok(listCoverCache.includes('.slice(0, limit)'), 'list cover cache should cap work per request');

console.log('list cover cache contract ok');
