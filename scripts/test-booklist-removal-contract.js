const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

const appJson = JSON.parse(read('miniprogram/app.json'));
const apiJs = read('miniprogram/utils/api.js');
const apiIndex = read('cloudfunctions/api/index.js');

assert.ok(!appJson.pages.some((page) => page.includes('booklist')), 'app.json should not register booklist pages');
assert.ok(!fs.existsSync(path.join(__dirname, '../miniprogram/pages/booklist')), 'booklist pages should be removed');
assert.ok(!fs.existsSync(path.join(__dirname, '../miniprogram/assets/booklist-covers')), 'booklist covers should be removed');
assert.ok(!fs.existsSync(path.join(__dirname, '../miniprogram/utils/booklistSignals.js')), 'booklistSignals util should be removed');
assert.ok(!fs.existsSync(path.join(__dirname, '../cloudfunctions/api/handlers/booklist.js')), 'booklist handler should be removed');
assert.ok(!apiJs.includes('getBooklistFeed') && !apiJs.includes('booklist.detail'), 'frontend api should not expose booklist actions');
assert.ok(!apiIndex.includes('booklist.feed') && !apiIndex.includes('handlers/booklist'), 'api routes should not expose booklist actions');

console.log('booklist removal contract ok');
