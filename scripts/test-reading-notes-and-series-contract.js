const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const appJson = read('miniprogram/app.json');
const apiIndex = read('cloudfunctions/api/index.js');
const apiUtils = read('miniprogram/utils/api.js');
const detailJs = read('miniprogram/pages/book/detail.js');
const detailWxml = read('miniprogram/pages/book/detail.wxml');
const detailWxss = read('miniprogram/pages/book/detail.wxss');
const scanWxml = read('miniprogram/pages/shelf/scan.wxml');
const shelfJs = read('miniprogram/pages/shelf/index.js');
const shelfWxml = read('miniprogram/pages/shelf/index.wxml');
const shelfWxss = read('miniprogram/pages/shelf/index.wxss');
const mineJs = read('miniprogram/pages/mine/index.js');
const mineWxml = read('miniprogram/pages/mine/index.wxml');

assert.ok(!apiIndex.includes("const notes = require('./handlers/notes')"), 'api should not load social notes handler for personal-subject review');
assert.ok(!apiIndex.includes("'notes.mine'") && !apiIndex.includes("'notes.book'"), 'api should not expose notes routes');
assert.ok(!apiUtils.includes('getMyNotes') && !apiUtils.includes('getBookNotes'), 'frontend api should not wrap notes routes');
assert.ok(!fs.existsSync(path.join(__dirname, '../cloudfunctions/api/handlers/notes.js')), 'social notes handler file should not remain in cloud function source');

assert.ok(!detailWxml.includes('bindtap="saveNote"') && !detailWxml.includes('写点读书笔记'), 'book detail should remove personal note editor');
assert.ok(!detailWxml.includes('大家的读书笔记') && !detailWxml.includes('reader-note'), 'book detail should remove public reader notes');
assert.ok(!detailJs.includes('loadBookNotes') && !detailJs.includes('getBookNotes') && !detailJs.includes('reportNote'), 'book detail should not load or report notes');
assert.ok(!detailWxml.includes('share-book-btn') && !detailWxml.includes('open-type="share"'), 'book detail should remove share-this-book entry');
assert.ok(!detailWxss.includes('.note-save-btn') && !detailWxss.includes('.reader-note'), 'book detail should not keep note-specific styles');

assert.ok(!appJson.includes('pages/mine/notes'), 'mine notes page should not be registered');
assert.ok(!mineJs.includes('goNotes') && !mineWxml.includes('我的读书笔记'), 'mine page should not link to my notes');

assert.ok(!scanWxml.includes('scan-area') && !scanWxml.includes('调起 wx.scanCode'), 'scan result page should not show top scan guide module');

assert.ok(shelfWxml.includes('wx:for="{{books}}"') && !shelfJs.includes('buildShelfEntries'), 'shelf should list books flat without series grouping');

console.log('reading notes and series contract ok');
