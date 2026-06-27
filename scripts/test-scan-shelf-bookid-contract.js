const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

const scanJs = read('miniprogram/pages/shelf/scan.js');
const scanPublishJs = read('miniprogram/pages/drift/scan-publish.js');

assert.ok(scanJs.includes('bookId: book.id'), 'scan shelf flow should pass bookId to avoid duplicate isbn lookup');
assert.ok(scanPublishJs.includes('bookId: book.id'), 'scan publish flow should pass bookId to avoid duplicate isbn lookup');

console.log('scan shelf bookId contract ok');
