#!/usr/bin/env node
/**
 * Build book_catalog import batches from local CSV exports.
 *
 * Usage:
 *   node scripts/import-book-catalog.js \
 *     --catalog "/path/_书目.csv" \
 *     --pricing "/path/新建 文本文档_核价.csv" \
 *     --out data/book_catalog
 *
 * Output: JSONL batches (500 docs each) for cloud database import.
 * After import, create index on book_catalog.isbn in WeChat console.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { normalizeCatalogRecord } = require('../cloudfunctions/api/lib/bookCatalogDb');
const { normalizeIsbn, isValidIsbn } = require('../cloudfunctions/api/lib/bookCatalog');

const BATCH_SIZE = 500;
const DEFAULT_CATALOG = '/Users/xumanna/Desktop/小谷吖/_书目.csv';
const DEFAULT_PRICING = '/Users/xumanna/Desktop/小谷吖/新建 文本文档_核价.csv';
const DEFAULT_OUT = path.join(__dirname, '../data/book_catalog');

function parseArgs(argv) {
  const args = {
    catalog: DEFAULT_CATALOG,
    pricing: DEFAULT_PRICING,
    out: DEFAULT_OUT,
    dryRun: false,
    limit: 0,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--catalog') args.catalog = argv[++i];
    else if (key === '--pricing') args.pricing = argv[++i];
    else if (key === '--out') args.out = argv[++i];
    else if (key === '--dry-run') args.dryRun = true;
    else if (key === '--limit') args.limit = Number(argv[++i]) || 0;
  }
  return args;
}

function parsePricingRow(line) {
  const fields = line.split(',');
  if (fields.length < 8) return null;
  const isbn = normalizeIsbn(fields[0]);
  if (!isValidIsbn(isbn)) return null;
  const medianPrice = Number(String(fields[4] || '').trim());
  const listPrice = String(fields[6] || '').trim();
  return {
    isbn,
    medianPrice: Number.isFinite(medianPrice) && medianPrice > 0 ? medianPrice : 0,
    listPrice,
  };
}

function parseCatalogRow(line) {
  const coverMatch = line.match(/https:\/\/booklibimg\.kfzimg\.com\/[^,\s]+\.jpg/i);
  if (!coverMatch) return null;

  const headMatch = line.match(/^([^,]*),([^,]*),(\d{10,13}),([^,]*),([^,]*),([^,]*),([^,]*),([\d.]+),/);
  if (!headMatch) return null;

  const fields = line.split(',');
  const categoryIndex = fields.length - 9;
  const summaryIndex = fields.length - 8;
  const category = categoryIndex >= 0 ? String(fields[categoryIndex] || '').trim() : '';
  const summary = summaryIndex >= 0 ? String(fields[summaryIndex] || '').trim() : '';

  return {
    isbn: normalizeIsbn(headMatch[3]),
    title: String(headMatch[2] || '').trim(),
    author: String(headMatch[4] || '').trim(),
    publisher: String(headMatch[5] || '').trim(),
    pubDate: String(headMatch[6] || '').trim(),
    listPrice: String(headMatch[8] || '').trim(),
    category,
    summary,
    coverRemote: coverMatch[0],
    source: 'booklib',
    coverSource: 'booklib',
  };
}

async function loadPricingMap(pricingPath) {
  const map = new Map();
  if (!pricingPath || !fs.existsSync(pricingPath)) return map;

  const rl = readline.createInterface({
    input: fs.createReadStream(pricingPath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  let first = true;
  for await (const line of rl) {
    if (first) {
      first = false;
      continue;
    }
    const row = parsePricingRow(line);
    if (!row) continue;
    const existing = map.get(row.isbn) || { isbn: row.isbn, medianPrice: 0, listPrice: '' };
    if (row.medianPrice > 0) existing.medianPrice = row.medianPrice;
    if (row.listPrice) existing.listPrice = row.listPrice;
    map.set(row.isbn, existing);
  }
  return map;
}

function mergePricing(record, pricingMap) {
  const pricing = pricingMap.get(record.isbn);
  if (!pricing) return record;
  const next = { ...record };
  if (!next.listPrice && pricing.listPrice) next.listPrice = pricing.listPrice;
  if (pricing.medianPrice > 0) next.medianPrice = pricing.medianPrice;
  return next;
}

function writeBatch(outDir, batchIndex, docs) {
  const file = path.join(outDir, `batch-${String(batchIndex).padStart(4, '0')}.jsonl`);
  const body = docs.map((doc) => JSON.stringify(doc)).join('\n');
  fs.writeFileSync(file, `${body}\n`, 'utf8');
  return file;
}

async function buildCatalog(args) {
  const pricingMap = await loadPricingMap(args.pricing);
  const outDir = path.resolve(args.out);
  if (!args.dryRun) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const rl = readline.createInterface({
    input: fs.createReadStream(args.catalog, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  let first = true;
  let parsed = 0;
  let skipped = 0;
  let written = 0;
  let batchIndex = 1;
  let batch = [];
  const seen = new Set();

  for await (const line of rl) {
    if (first) {
      first = false;
      continue;
    }
    if (args.limit > 0 && parsed >= args.limit) break;

    const raw = parseCatalogRow(line);
    if (!raw) {
      skipped += 1;
      continue;
    }
    const merged = mergePricing(raw, pricingMap);
    const normalized = normalizeCatalogRecord(merged);
    if (!normalized || seen.has(normalized.isbn)) {
      skipped += 1;
      continue;
    }
    if (merged.medianPrice > 0) normalized.medianPrice = merged.medianPrice;

    seen.add(normalized.isbn);
    parsed += 1;
    batch.push(normalized);

    if (batch.length >= BATCH_SIZE) {
      if (!args.dryRun) writeBatch(outDir, batchIndex, batch);
      written += batch.length;
      batchIndex += 1;
      batch = [];
    }
  }

  if (batch.length) {
    if (!args.dryRun) writeBatch(outDir, batchIndex, batch);
    written += batch.length;
  }

  return {
    pricingRows: pricingMap.size,
    parsed,
    skipped,
    unique: seen.size,
    written,
    batches: batchIndex,
    outDir,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  assert.ok(fs.existsSync(args.catalog), `catalog csv not found: ${args.catalog}`);
  const stats = await buildCatalog(args);
  console.log(JSON.stringify({ ok: true, dryRun: args.dryRun, ...stats }, null, 2));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  parsePricingRow,
  parseCatalogRow,
  mergePricing,
  buildCatalog,
};
