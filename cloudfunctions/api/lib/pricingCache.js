const { normalizeIsbn } = require('./bookCatalog');

async function getMedianPriceByIsbn(db, isbn) {
  const clean = normalizeIsbn(isbn);
  if (!clean) return 0;
  const { data } = await db.collection('pricing_cache').where({ isbn: clean }).limit(1).get();
  const cached = data && data[0];
  const median = Number(cached && cached.medianPrice);
  return Number.isFinite(median) && median > 0 ? median : 0;
}

function attachMedianPrices(books = [], priceMap = {}) {
  return books.map((book) => {
    const cached = priceMap[normalizeIsbn(book.isbn)];
    if (!cached || !cached.medianPrice) return book;
    const enriched = { ...book, medianPrice: cached.medianPrice };
    if (!book.listPrice) {
      enriched.listPrice = `¥${cached.medianPrice}`;
      enriched.listPriceSource = 'pricing_cache';
    }
    return enriched;
  });
}

module.exports = {
  getMedianPriceByIsbn,
  attachMedianPrices,
};
