const { cleanBookTitle } = require('./bookLookupPolicy');
const { normalizeIsbn, isValidIsbn } = require('./bookCatalog');

function buildBookMetadataPatch(data = {}) {
  const patch = {};
  const textFields = {};

  if (data.title !== undefined) {
    const rawTitle = String(data.title || '').trim();
    if (!rawTitle) return { error: '请填写书名' };
    const title = cleanBookTitle(rawTitle) || rawTitle;
    patch.title = title;
    if (title !== rawTitle) patch.rawTitle = rawTitle;
    textFields.title = rawTitle;
  }

  if (data.author !== undefined) {
    const author = String(data.author || '').trim();
    if (!author) return { error: '请填写作者' };
    patch.author = author;
    textFields.author = author;
  }

  if (data.publisher !== undefined) {
    patch.publisher = String(data.publisher || '').trim();
    if (patch.publisher) textFields.publisher = patch.publisher;
  }

  if (data.pubDate !== undefined) {
    patch.pubDate = String(data.pubDate || '').trim();
  }

  if (data.listPrice !== undefined) {
    const listPrice = String(data.listPrice || '').trim();
    patch.listPrice = listPrice;
    patch.listPriceSource = listPrice ? 'manual' : '';
  }

  if (data.isbn !== undefined) {
    const raw = String(data.isbn || '').trim();
    if (raw) {
      const isbn = normalizeIsbn(raw);
      if (!isValidIsbn(isbn)) return { error: 'ISBN 无效' };
      patch.isbn = isbn;
    }
  }

  if (!Object.keys(patch).length) return { error: '没有可更新的信息' };
  return { patch, textFields };
}

module.exports = {
  buildBookMetadataPatch,
};
