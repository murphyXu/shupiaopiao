const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const appJson = JSON.parse(read('miniprogram/app.json'));
const booksHandler = read('cloudfunctions/api/handlers/books.js');
const bookMetadata = read('cloudfunctions/api/lib/bookMetadata.js');
const apiIndex = read('cloudfunctions/api/index.js');
const apiJs = read('miniprogram/utils/api.js');
const bookMetaEdit = read('miniprogram/utils/bookMetaEdit.js');
const editMetaJs = read('miniprogram/pages/book/edit-meta.js');
const editMetaWxml = read('miniprogram/pages/book/edit-meta.wxml');
const publishJs = read('miniprogram/pages/drift/publish.js');
const publishWxml = read('miniprogram/pages/drift/publish.wxml');
const scanPublishJs = read('miniprogram/pages/drift/scan-publish.js');
const scanPublishWxml = read('miniprogram/pages/drift/scan-publish.wxml');
const detailJs = read('miniprogram/pages/book/detail.js');
const detailWxml = read('miniprogram/pages/book/detail.wxml');

assert.ok(appJson.pages.includes('pages/book/edit-meta'), 'edit-meta page should be registered');
assert.ok(apiIndex.includes("'books.updateMetadata'"), 'api should route books.updateMetadata');
assert.ok(booksHandler.includes('updateMetadata') && booksHandler.includes('buildBookMetadataPatch'), 'books handler should update metadata via shared helper');
assert.ok(bookMetadata.includes("listPriceSource = listPrice ? 'manual'"), 'manual list price should clear estimate source');
assert.ok(apiJs.includes('updateBookMetadata'), 'client api should expose updateBookMetadata');
assert.ok(bookMetaEdit.includes('missingBookMetaFields') && bookMetaEdit.includes('listPrice'), 'client helper should detect missing list price');

assert.ok(editMetaJs.includes('updateBookMetadata') && editMetaWxml.includes('补录图书信息'), 'edit-meta page should save via updateBookMetadata');
assert.ok(editMetaWxml.includes('label-missing'), 'edit-meta should highlight missing fields');

assert.ok(publishJs.includes('goEditBookMeta') && publishWxml.includes('补录信息'), 'publish page should link to edit-meta');
assert.ok(scanPublishJs.includes('goEditBookMeta') && scanPublishWxml.includes('补录信息'), 'scan publish should link to edit-meta');
assert.ok(detailJs.includes('goEditBookMeta') && detailWxml.includes('补录'), 'book detail should link to edit-meta');

const { buildBookMetadataPatch } = require('../cloudfunctions/api/lib/bookMetadata');
const patchResult = buildBookMetadataPatch({ listPrice: '59.00', title: '测试书', author: '作者' });
assert.ok(patchResult.patch.listPrice === '59.00' && patchResult.patch.listPriceSource === 'manual', 'patch builder should mark manual price');

console.log('book metadata edit contract ok');
