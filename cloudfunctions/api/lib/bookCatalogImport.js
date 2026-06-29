const { normalizeIsbn, isValidIsbn } = require('./bookCatalog');
const { COLLECTION, normalizeCatalogRecord } = require('./bookCatalogDb');
const { ensureCollection } = require('./collections');
const { nowIso } = require('./utils');

const COLLECTION_NAME = COLLECTION;
const MAX_BATCH_SIZE = 200;

function normalizeImportDoc(raw = {}) {
  const normalized = normalizeCatalogRecord(raw);
  if (!normalized) return null;
  const medianPrice = Number(raw.medianPrice);
  return {
    ...normalized,
    ...(Number.isFinite(medianPrice) && medianPrice > 0 ? { medianPrice } : {}),
    importedAt: nowIso(),
  };
}

async function upsertCatalogDoc(db, doc) {
  const isbn = normalizeIsbn(doc.isbn);
  if (!isValidIsbn(isbn)) return { ok: false, reason: 'invalid_isbn' };

  await db.collection(COLLECTION_NAME).doc(isbn).set({
    data: {
      ...doc,
      isbn,
    },
  });

  const medianPrice = Number(doc.medianPrice);
  if (Number.isFinite(medianPrice) && medianPrice > 0) {
    await db.collection('pricing_cache').doc(isbn).set({
      data: {
        isbn,
        medianPrice,
        sources: [{ source: 'booklib', price: medianPrice }],
      },
    });
  }

  return { ok: true, isbn };
}

async function importBookCatalogBatch(db, payload = {}) {
  const docs = Array.isArray(payload.docs) ? payload.docs : [];
  if (!docs.length) return { imported: 0, skipped: 0, errors: [] };
  if (docs.length > MAX_BATCH_SIZE) {
    throw new Error(`BATCH_TOO_LARGE:${docs.length}`);
  }

  await ensureCollection(db, COLLECTION_NAME);

  let imported = 0;
  let skipped = 0;
  const errors = [];

  for (const raw of docs) {
    const doc = normalizeImportDoc(raw);
    if (!doc) {
      skipped += 1;
      continue;
    }
    try {
      await upsertCatalogDoc(db, doc);
      imported += 1;
    } catch (err) {
      errors.push({
        isbn: raw.isbn || '',
        message: err.message || String(err),
      });
    }
  }

  return { imported, skipped, errors };
}

async function getBookCatalogImportStatus(db) {
  try {
    const { total } = await db.collection(COLLECTION_NAME).count();
    return { total: total || 0, collection: COLLECTION_NAME };
  } catch (err) {
    return { total: 0, collection: COLLECTION_NAME, error: err.message || String(err) };
  }
}

module.exports = {
  MAX_BATCH_SIZE,
  normalizeImportDoc,
  importBookCatalogBatch,
  getBookCatalogImportStatus,
};
