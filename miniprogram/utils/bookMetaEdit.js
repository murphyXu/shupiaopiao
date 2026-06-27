const { pricingState } = require('./driftPricing');

function isMissingIsbn(isbn) {
  const value = String(isbn || '').trim();
  return !value || value.startsWith('manual-');
}

function missingBookMetaFields(book = {}) {
  const fields = [];
  if (!String(book.title || '').trim()) fields.push('title');
  if (!String(book.author || '').trim()) fields.push('author');
  if (isMissingIsbn(book.isbn)) fields.push('isbn');
  if (!String(book.publisher || '').trim()) fields.push('publisher');
  if (!String(book.pubDate || '').trim()) fields.push('pubDate');
  if (!pricingState(book, 'like_new').hasListPrice) fields.push('listPrice');
  return fields;
}

function hasMissingBookMeta(book = {}) {
  return missingBookMetaFields(book).length > 0;
}

function fieldLabel(key) {
  const labels = {
    title: '书名',
    author: '作者',
    isbn: 'ISBN',
    publisher: '出版社',
    pubDate: '出版年',
    listPrice: '定价',
  };
  return labels[key] || key;
}

function missingFieldsSummary(book = {}) {
  return missingBookMetaFields(book).map(fieldLabel).join('、');
}

module.exports = {
  isMissingIsbn,
  missingBookMetaFields,
  hasMissingBookMeta,
  fieldLabel,
  missingFieldsSummary,
};
