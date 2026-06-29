import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_ENV = 'cloud1-6gngg7ipd8f073ed';

export function loadRepoEnvLocal() {
  const envPath = path.join(REPO_ROOT, '.env.local');
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) return;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = value;
  });
}

export function createCloudbaseApp() {
  loadRepoEnvLocal();
  const env = process.env.TCB_ENV || process.env.CLOUD_ENV_ID || DEFAULT_ENV;
  const secretId = process.env.TCB_SECRET_ID || process.env.TENCENT_SECRET_ID;
  const secretKey = process.env.TCB_SECRET_KEY || process.env.TENCENT_SECRET_KEY;
  if (!secretId || !secretKey) {
    throw new Error('请在仓库根目录 .env.local 配置 TCB_SECRET_ID 和 TCB_SECRET_KEY（与 scripts 脚本相同）');
  }
  let cloudbase;
  try {
    cloudbase = require(path.join(REPO_ROOT, 'cloudfunctions/seed/node_modules/@cloudbase/node-sdk'));
  } catch (err) {
    cloudbase = require('@cloudbase/node-sdk');
  }
  return cloudbase.init({ env, secretId, secretKey });
}

export async function invokeAdminApi(payload = {}, adminToken = '') {
  const app = createCloudbaseApp();
  const res = await app.callFunction({
    name: 'api',
    data: {
      action: payload.action,
      data: payload.data || {},
      _adminToken: adminToken || '',
    },
  });
  return res.result;
}

export function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}
