const cloud = require('wx-server-sdk');
const { ensureCollections, isCollectionMissing } = require('./collections');
const { BOOK_CATALOG } = require('./bookCatalog');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const dbCommand = db.command;

function uid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (r & 0x3 | 0x8).toString(16);
  });
}

const DEFAULT_PRICES = { 绘本: 25, 文学: 35, 科普: 30, 童书: 28 };

async function safeBookCount() {
  try {
    const { total } = await db.collection('books').count();
    return total;
  } catch (err) {
    const { isCollectionMissing } = require('./collections');
    if (isCollectionMissing(err)) return 0;
    throw err;
  }
}

/** 将内置书目写入数据库（不删已有数据，只补缺） */
async function syncCatalogBooks() {
  let added = 0;
  const catalogIsbns = BOOK_CATALOG.map((b) => b.isbn);
  const { data: existingBooks } = await db.collection('books')
    .where({ isbn: dbCommand.in(catalogIsbns) })
    .limit(100)
    .get();
  const existingByIsbn = new Map();
  existingBooks.forEach((book) => existingByIsbn.set(book.isbn, book));

  for (const b of BOOK_CATALOG) {
    const existing = existingByIsbn.get(b.isbn);
    if (existing) {
      const patch = {};
      if (!existing.cover || existing.cover.includes('doubanio.com') || existing.cover.startsWith('http')) {
        patch.cover = `local:${b.isbn}`;
      }
      if (Object.keys(patch).length) {
        await db.collection('books').doc(existing._id).update({ data: patch });
      }
      continue;
    }
    const id = uid();
    await db.collection('books').doc(id).set({
      data: { ...b, cover: `local:${b.isbn}` },
    });
    const price = DEFAULT_PRICES[b.category] || 28;
    await db.collection('pricing_cache').doc(b.isbn).set({
      data: { isbn: b.isbn, medianPrice: price, sources: [{ source: 'default', price }] },
    });
    added += 1;
  }
  return added;
}

async function runSyncCatalog() {
  try {
    const added = await syncCatalogBooks();
    return {
      code: 0,
      msg: 'syncCatalog ok',
      data: {
        added,
        total: BOOK_CATALOG.length,
        collections: { skippedEnsure: true, reason: 'run init-db before seed syncCatalog' },
      },
    };
  } catch (err) {
    if (isCollectionMissing(err)) {
      return {
        code: 1,
        msg: '请先运行 init-db，再执行 seed syncCatalog',
        data: { total: BOOK_CATALOG.length },
      };
    }
    throw err;
  }
}

exports.main = async (event = {}) => {
  if (event.syncCatalog) {
    return runSyncCatalog();
  }

  const colResult = await ensureCollections(db);

  const existing = await safeBookCount();
  if (existing > 0) {
    return {
      code: 0,
      msg: 'already seeded',
      data: {
        bookCount: existing,
        collections: colResult,
        hint: 'run with { syncCatalog: true } to add built-in books and fix covers',
      },
    };
  }

  const bookIds = {};
  for (const b of BOOK_CATALOG) {
    const id = uid();
    bookIds[b.isbn] = id;
    await db.collection('books').doc(id).set({
      data: { ...b, cover: `local:${b.isbn}` },
    });
    const price = DEFAULT_PRICES[b.category] || 28;
    await db.collection('pricing_cache').doc(b.isbn).set({
      data: { isbn: b.isbn, medianPrice: price, sources: [{ source: 'default', price }] },
    });
  }

  return {
    code: 0,
    msg: 'seed ok',
    data: { books: BOOK_CATALOG.length, collections: colResult },
  };
};
