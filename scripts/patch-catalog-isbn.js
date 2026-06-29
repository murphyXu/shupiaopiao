#!/usr/bin/env node
/**
 * Patch book_catalog + books records for ISBNs using inventory overrides.
 *
 * Usage:
 *   rtk node scripts/patch-catalog-isbn.js 9787551117500
 */

const path = require('path');
const { normalizeIsbn, isValidIsbn } = require('../cloudfunctions/api/lib/bookCatalog');
const { loadInventoryOverrides, parseCatalogRow, finalizeCatalogRecord } = require('./import-book-catalog');
const { upsertBook } = require('../cloudfunctions/api/lib/bookLookup');

const ROOT = path.join(__dirname, '..');
const DEFAULT_ENV = 'cloud1-6gngg7ipd8f073ed';
const DEFAULT_CATALOG = '/Users/xumanna/Desktop/小谷吖/_书目.csv';
const DEFAULT_INVENTORY = '/Users/xumanna/Desktop/小谷吖/社科类图书-有库存-20240911.csv';

function loadDotEnv(filePath) {
  const fs = require('fs');
  if (!fs.existsSync(filePath)) return;
  fs.readFileSync(filePath, 'utf8').split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) return;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = value;
  });
}

function wrapDb(app) {
  const raw = app.database();
  function wrapQuery(query) {
    return {
      where(condition) { return wrapQuery(query.where(condition)); },
      orderBy(field, direction) { return wrapQuery(query.orderBy(field, direction)); },
      limit(n) { return wrapQuery(query.limit(n)); },
      get() { return query.get(); },
    };
  }
  function wrapCollection(col) {
    return {
      where(condition) { return wrapQuery(col.where(condition)); },
      orderBy(field, direction) { return wrapQuery(col.orderBy(field, direction)); },
      doc(id) {
        const ref = col.doc(id);
        return {
          get: () => ref.get(),
          set(payload = {}) {
            const data = payload.data !== undefined ? payload.data : payload;
            return ref.set(data);
          },
          update(payload = {}) {
            const data = payload.data !== undefined ? payload.data : payload;
            return ref.update(data);
          },
        };
      },
    };
  }
  return {
    collection: (name) => wrapCollection(raw.collection(name)),
    command: raw.command,
  };
}

function loadCloudbaseApp() {
  const env = process.env.TCB_ENV || process.env.CLOUD_ENV_ID || DEFAULT_ENV;
  const secretId = process.env.TCB_SECRET_ID || process.env.TENCENT_SECRET_ID;
  const secretKey = process.env.TCB_SECRET_KEY || process.env.TENCENT_SECRET_KEY;
  if (!secretId || !secretKey) throw new Error('Missing TCB credentials');
  const cloudbase = require(path.join(ROOT, 'cloudfunctions/seed/node_modules/@cloudbase/node-sdk'));
  return cloudbase.init({ env, secretId, secretKey });
}

async function findCatalogLine(isbn, catalogPath) {
  const fs = require('fs');
  const readline = require('readline');
  const rl = readline.createInterface({
    input: fs.createReadStream(catalogPath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (line.includes(isbn) && line.includes('booklibimg.kfzimg.com')) return line;
  }
  return '';
}

async function main() {
  loadDotEnv(path.join(ROOT, '.env.local'));
  const isbn = normalizeIsbn(process.argv[2]);
  if (!isValidIsbn(isbn)) throw new Error('usage: node scripts/patch-catalog-isbn.js <isbn>');

  const inventoryMap = await loadInventoryOverrides(DEFAULT_INVENTORY);
  const override = inventoryMap.get(isbn);
  if (!override) throw new Error(`no inventory override for ${isbn}`);

  const line = await findCatalogLine(isbn, DEFAULT_CATALOG);
  if (!line) throw new Error(`catalog line not found for ${isbn}`);
  const raw = parseCatalogRow(line);
  const doc = finalizeCatalogRecord(raw, new Map(), inventoryMap);
  if (!doc) throw new Error('failed to build catalog doc');

  const app = loadCloudbaseApp();
  const db = wrapDb(app);
  await db.collection('book_catalog').doc(isbn).set(doc);

  const saved = await upsertBook(db, {
    ...doc,
    source: 'inventory_override',
  });

  console.log(JSON.stringify({
    ok: true,
    isbn,
    title: doc.title,
    bookId: saved && saved._id,
    catalogQuality: doc.catalogQuality,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
