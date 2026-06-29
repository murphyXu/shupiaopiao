#!/usr/bin/env node
/**
 * Refresh user shelf books from book_catalog + pricing_cache.
 *
 * Requires the same CloudBase credentials as upload-book-catalog.js (.env.local).
 *
 * Usage:
 *   rtk node scripts/refresh-user-books.js
 *   rtk node scripts/refresh-user-books.js --scope all
 *   rtk node scripts/refresh-user-books.js --dry-run
 */

const fs = require('fs');
const path = require('path');
const { refreshBooksFromCatalog } = require('../cloudfunctions/api/lib/bookRefresh');

const ROOT = path.join(__dirname, '..');
const DEFAULT_ENV = 'cloud1-6gngg7ipd8f073ed';
const PROGRESS_FILE = path.join(ROOT, 'data/book_catalog/.refresh-books-progress.json');

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
    scope: 'shelf',
    limit: 50,
    dryRun: false,
    resume: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--scope') args.scope = argv[++i] || 'shelf';
    else if (key === '--limit') args.limit = Number(argv[++i]) || 50;
    else if (key === '--dry-run') args.dryRun = true;
    else if (key === '--resume') args.resume = true;
  }
  return args;
}

function loadProgress() {
  if (!fs.existsSync(PROGRESS_FILE)) return { cursor: '', totals: { processed: 0, updated: 0, skipped: 0, failed: 0 } };
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  } catch (e) {
    return { cursor: '', totals: { processed: 0, updated: 0, skipped: 0, failed: 0 } };
  }
}

function saveProgress(progress) {
  fs.mkdirSync(path.dirname(PROGRESS_FILE), { recursive: true });
  fs.writeFileSync(PROGRESS_FILE, `${JSON.stringify(progress, null, 2)}\n`, 'utf8');
}

function loadCloudbaseApp() {
  const env = process.env.TCB_ENV || process.env.CLOUD_ENV_ID || DEFAULT_ENV;
  const secretId = process.env.TCB_SECRET_ID || process.env.TENCENT_SECRET_ID;
  const secretKey = process.env.TCB_SECRET_KEY || process.env.TENCENT_SECRET_KEY;
  if (!secretId || !secretKey) {
    throw new Error('Missing TCB_SECRET_ID / TCB_SECRET_KEY in environment or .env.local');
  }
  const sdkPath = path.join(ROOT, 'cloudfunctions/seed/node_modules/@cloudbase/node-sdk');
  const cloudbase = require(sdkPath);
  return cloudbase.init({ env, secretId, secretKey });
}

function wrapDb(app) {
  const raw = app.database();

  function wrapQuery(query) {
    return {
      where(condition) {
        return wrapQuery(query.where(condition));
      },
      orderBy(field, direction) {
        return wrapQuery(query.orderBy(field, direction));
      },
      limit(n) {
        return wrapQuery(query.limit(n));
      },
      get() {
        return query.get();
      },
    };
  }

  function wrapCollection(col) {
    return {
      where(condition) {
        return wrapQuery(col.where(condition));
      },
      orderBy(field, direction) {
        return wrapQuery(col.orderBy(field, direction));
      },
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

async function main() {
  loadDotEnv(path.join(ROOT, '.env.local'));
  const args = parseArgs(process.argv);
  const progress = args.resume ? loadProgress() : { cursor: '', totals: { processed: 0, updated: 0, skipped: 0, failed: 0 } };
  const app = loadCloudbaseApp();
  const db = wrapDb(app);

  if (args.dryRun) {
    console.log(JSON.stringify({ ok: true, dryRun: true, scope: args.scope, cursor: progress.cursor }, null, 2));
    return;
  }

  let cursor = progress.cursor || '';
  let totals = { ...progress.totals };
  let rounds = 0;

  while (rounds < 5000) {
    const result = await refreshBooksFromCatalog(db, {
      scope: args.scope,
      limit: args.limit,
      cursor,
      force: true,
    });
    totals.processed += result.processed;
    totals.updated += result.updated;
    totals.skipped += result.skipped;
    totals.failed += result.failed;
    cursor = result.nextCursor || '';
    saveProgress({ cursor, scope: args.scope, totals, lastBatch: result });
    console.log(`batch processed=${result.processed} updated=${result.updated} skipped=${result.skipped} failed=${result.failed} nextCursor=${cursor || '(done)'}`);
    if (!cursor) break;
    rounds += 1;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  console.log(JSON.stringify({ ok: true, scope: args.scope, totals }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
