#!/usr/bin/env node
/**
 * Generate book_catalog JSONL batches and upload to cloud database.
 *
 * Requires CloudBase admin credentials:
 *   export TCB_ENV=cloud1-xxxxxxxx
 *   export TCB_SECRET_ID=...
 *   export TCB_SECRET_KEY=...
 *
 * Usage:
 *   rtk node scripts/upload-book-catalog.js
 *   rtk node scripts/upload-book-catalog.js --skip-generate
 *   rtk node scripts/upload-book-catalog.js --resume
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { buildCatalog } = require('./import-book-catalog');
const { MAX_BATCH_SIZE } = require('../cloudfunctions/api/lib/bookCatalogImport');

const ROOT = path.join(__dirname, '..');
const DEFAULT_OUT = path.join(ROOT, 'data/book_catalog');
const PROGRESS_FILE = path.join(ROOT, 'data/book_catalog/.upload-progress.json');
const DEFAULT_ENV = 'cloud1-6gngg7ipd8f073ed';
const UPLOAD_BATCH_SIZE = 20;
const PARALLEL = 1;
const RETRYABLE = /ENOTFOUND|ECONNRESET|ETIMEDOUT|EXCEED_RATELIMIT|ratelimit|频率|timeout/i;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(label, fn, maxAttempts = 8) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = String(err.message || err);
      if (!RETRYABLE.test(msg) || attempt >= maxAttempts) throw err;
      const waitMs = Math.min(30000, 1000 * (2 ** (attempt - 1)));
      console.warn(`\n[retry] ${label} attempt ${attempt}/${maxAttempts} in ${waitMs}ms: ${msg}`);
      await sleep(waitMs);
    }
  }
  throw lastErr;
}

function loadDotEnv(filePath) {
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

function parseArgs(argv) {
  const args = {
    catalog: '/Users/xumanna/Desktop/小谷吖/_书目.csv',
    pricing: '/Users/xumanna/Desktop/小谷吖/新建 文本文档_核价.csv',
    out: DEFAULT_OUT,
    skipGenerate: false,
    resume: false,
    dryRun: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--catalog') args.catalog = argv[++i];
    else if (key === '--pricing') args.pricing = argv[++i];
    else if (key === '--out') args.out = argv[++i];
    else if (key === '--skip-generate') args.skipGenerate = true;
    else if (key === '--resume') args.resume = true;
    else if (key === '--dry-run') args.dryRun = true;
  }
  return args;
}

function loadProgress() {
  if (!fs.existsSync(PROGRESS_FILE)) return { completed: [] };
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  } catch (e) {
    return { completed: [] };
  }
}

function saveProgress(progress) {
  fs.mkdirSync(path.dirname(PROGRESS_FILE), { recursive: true });
  fs.writeFileSync(PROGRESS_FILE, `${JSON.stringify(progress, null, 2)}\n`, 'utf8');
}

function listBatchFiles(outDir) {
  return fs.readdirSync(outDir)
    .filter((name) => /^batch-\d+\.jsonl$/.test(name))
    .sort();
}

function readJsonl(file) {
  return fs.readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function chunk(items, size) {
  const groups = [];
  for (let i = 0; i < items.length; i += size) {
    groups.push(items.slice(i, i + size));
  }
  return groups;
}

function loadCloudbaseApp() {
  const env = process.env.TCB_ENV || process.env.CLOUD_ENV_ID || DEFAULT_ENV;
  const secretId = process.env.TCB_SECRET_ID || process.env.TENCENT_SECRET_ID;
  const secretKey = process.env.TCB_SECRET_KEY || process.env.TENCENT_SECRET_KEY;
  if (!secretId || !secretKey) {
    throw new Error(
      'Missing TCB_SECRET_ID / TCB_SECRET_KEY. Create API keys in Tencent Cloud console, export them, then rerun.',
    );
  }

  const sdkPath = path.join(ROOT, 'cloudfunctions/seed/node_modules/@cloudbase/node-sdk');
  const cloudbase = require(sdkPath);
  return cloudbase.init({ env, secretId, secretKey });
}

async function upsertDoc(db, doc) {
  const isbn = String(doc.isbn || '').replace(/[^0-9X]/gi, '');
  if (!isbn) return false;
  await withRetry(`set ${isbn}`, async () => {
    await db.collection('book_catalog').doc(isbn).set({
      ...doc,
      isbn,
      importedAt: doc.importedAt || new Date().toISOString(),
    });
    const medianPrice = Number(doc.medianPrice);
    if (Number.isFinite(medianPrice) && medianPrice > 0) {
      await db.collection('pricing_cache').doc(isbn).set({
        isbn,
        medianPrice,
        sources: [{ source: 'booklib', price: medianPrice }],
      });
    }
  });
  return true;
}

async function upsertDocs(app, docs) {
  const db = app.database();
  let imported = 0;
  for (const doc of docs) {
    const ok = await upsertDoc(db, doc);
    if (ok) imported += 1;
  }
  return imported;
}

async function uploadBatchFile(app, filePath) {
  const docs = readJsonl(filePath);
  const groups = chunk(docs, UPLOAD_BATCH_SIZE);
  let imported = 0;
  for (let i = 0; i < groups.length; i += PARALLEL) {
    const slice = groups.slice(i, i + PARALLEL);
    const counts = await Promise.all(slice.map((group) => upsertDocs(app, group)));
    imported += counts.reduce((sum, n) => sum + n, 0);
    process.stdout.write(`\r  ${path.basename(filePath)} ${Math.min(i + PARALLEL, groups.length)}/${groups.length} chunks`);
    await sleep(300);
  }
  process.stdout.write('\n');
  return imported;
}

async function ensureCollection(app) {
  const db = app.database();
  if (typeof db.createCollection !== 'function') return;
  try {
    await db.createCollection('book_catalog');
  } catch (err) {
    const msg = String(err.message || err);
    if (!/already exists|Table exist|ResourceExist|DATABASE_COLLECTION_EXIST/i.test(msg)) {
      throw err;
    }
  }
}

async function main() {
  loadDotEnv(path.join(ROOT, '.env.local'));
  loadDotEnv(path.join(ROOT, '.env'));
  const args = parseArgs(process.argv);
  assert.ok(fs.existsSync(args.catalog), `catalog csv not found: ${args.catalog}`);

  if (!args.skipGenerate) {
    console.log('[1/2] generating JSONL batches...');
    const stats = await buildCatalog({
      catalog: args.catalog,
      pricing: args.pricing,
      out: args.out,
      dryRun: false,
      limit: 0,
    });
    console.log(JSON.stringify(stats, null, 2));
  }

  const outDir = path.resolve(args.out);
  assert.ok(fs.existsSync(outDir), `output dir not found: ${outDir}`);
  const files = listBatchFiles(outDir);
  assert.ok(files.length, `no batch files in ${outDir}`);

  if (args.dryRun) {
    console.log(JSON.stringify({ ok: true, dryRun: true, batchFiles: files.length }, null, 2));
    return;
  }

  console.log(`[2/2] uploading ${files.length} batch files...`);
  const app = loadCloudbaseApp();
  await ensureCollection(app);

  const progress = args.resume ? loadProgress() : { completed: [], startedAt: new Date().toISOString() };
  const done = new Set(progress.completed || []);
  let totalImported = 0;

  for (const name of files) {
    if (done.has(name)) {
      console.log(`skip ${name} (already uploaded)`);
      continue;
    }
    console.log(`upload ${name}`);
    const imported = await uploadBatchFile(app, path.join(outDir, name));
    totalImported += imported;
    done.add(name);
    progress.completed = [...done];
    progress.lastFile = name;
    progress.totalImported = (progress.totalImported || 0) + imported;
    saveProgress(progress);
    await sleep(500);
  }

  const db = app.database();
  const { total } = await db.collection('book_catalog').count();
  console.log(JSON.stringify({
    ok: true,
    batchFiles: files.length,
    uploadedThisRun: totalImported,
    cloudTotal: total,
    progressFile: PROGRESS_FILE,
  }, null, 2));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  readJsonl,
  uploadBatchFile,
};
