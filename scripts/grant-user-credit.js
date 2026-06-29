#!/usr/bin/env node
/**
 * Grant credit score to a user (admin ops).
 *
 * Usage:
 *   rtk node scripts/grant-user-credit.js --userId <uuid> --delta 32
 *   rtk node scripts/grant-user-credit.js --userId <uuid> --delta 32 --dry-run
 */

const fs = require('fs');
const path = require('path');
const { eventId } = require('../cloudfunctions/api/lib/driftAccounting');
const { nowIso } = require('../cloudfunctions/api/lib/utils');

const ROOT = path.join(__dirname, '..');
const DEFAULT_ENV = 'cloud1-6gngg7ipd8f073ed';

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
  const args = { userId: '', delta: 0, reason: '管理员补发信用分', dryRun: false };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--userId') args.userId = String(argv[++i] || '').trim();
    else if (key === '--delta') args.delta = Number(argv[++i]);
    else if (key === '--reason') args.reason = String(argv[++i] || '').trim();
    else if (key === '--dry-run') args.dryRun = true;
  }
  return args;
}

function loadCloudbaseApp() {
  const env = process.env.TCB_ENV || process.env.CLOUD_ENV_ID || DEFAULT_ENV;
  const secretId = process.env.TCB_SECRET_ID || process.env.TENCENT_SECRET_ID;
  const secretKey = process.env.TCB_SECRET_KEY || process.env.TENCENT_SECRET_KEY;
  if (!secretId || !secretKey) throw new Error('Missing TCB credentials in .env.local');
  const cloudbase = require(path.join(ROOT, 'cloudfunctions/seed/node_modules/@cloudbase/node-sdk'));
  return cloudbase.init({ env, secretId, secretKey });
}

function unwrapDoc(data) {
  if (Array.isArray(data)) return data[0] || null;
  return data || null;
}

function wrapDb(app) {
  const raw = app.database();
  function wrapCollection(col) {
    return {
      doc(id) {
        const ref = col.doc(id);
        return {
          async get() {
            const res = await ref.get();
            return { data: unwrapDoc(res.data) };
          },
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
  if (!args.userId) throw new Error('Missing --userId');
  if (!Number.isFinite(args.delta) || args.delta === 0) throw new Error('Missing or invalid --delta');

  const app = loadCloudbaseApp();
  const db = wrapDb(app);
  const _ = db.command;
  const refId = `admin-grant-${args.userId}-${args.delta}`;
  const reasonCode = 'ADMIN_GRANT';
  const logId = eventId(refId, reasonCode, args.userId);
  const now = nowIso();

  const [userSnap, logSnap] = await Promise.all([
    db.collection('users').doc(args.userId).get(),
    db.collection('credit_logs').doc(logId).get(),
  ]);
  const user = userSnap.data;
  if (!user) throw new Error(`User not found: ${args.userId}`);
  if (logSnap.data) {
    console.log(JSON.stringify({
      ok: true,
      skipped: true,
      reason: 'already_granted',
      userId: args.userId,
      creditScore: user.creditScore,
      logId,
    }, null, 2));
    return;
  }

  const before = Number(user.creditScore) || 0;
  const after = before + args.delta;
  if (args.dryRun) {
    console.log(JSON.stringify({
      ok: true,
      dryRun: true,
      userId: args.userId,
      nickname: user.nickname || '',
      before,
      after,
      delta: args.delta,
      logId,
    }, null, 2));
    return;
  }

  await db.collection('users').doc(args.userId).update({
    data: { creditScore: _.inc(args.delta) },
  });
  await db.collection('credit_logs').doc(logId).set({
    data: {
      userId: args.userId,
      refId,
      reasonCode,
      delta: args.delta,
      reason: args.reason,
      createdAt: now,
    },
  });

  console.log(JSON.stringify({
    ok: true,
    userId: args.userId,
    nickname: user.nickname || '',
    before,
    after,
    delta: args.delta,
    logId,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
