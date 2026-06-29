#!/usr/bin/env node
/**
 * Local admin API proxy — uses TCB API keys, no anonymous login required.
 *
 * Usage:
 *   cd admin-web && npm run start
 *   open http://localhost:8787
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { invokeAdminApi, readJsonBody } from './cloudbase.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '../dist');
const PORT = Number(process.env.ADMIN_PROXY_PORT) || 8787;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
};

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function serveStatic(req, res) {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(DIST, urlPath);
  if (!filePath.startsWith(DIST)) {
    sendJson(res, 403, { code: 403, msg: 'forbidden' });
    return;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    const fallback = path.join(DIST, 'index.html');
    if (!fs.existsSync(fallback)) {
      sendJson(res, 404, { code: 404, msg: '请先执行 npm run build' });
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(fallback).pipe(res);
    return;
  }
  const ext = path.extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS' && req.url.startsWith('/admin-api')) {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end();
    return;
  }

  if (req.url.startsWith('/admin-api') && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const auth = String(req.headers.authorization || '');
      const bearer = auth.match(/^Bearer\s+(.+)$/i);
      const adminToken = bearer ? bearer[1].trim() : '';
      const result = await invokeAdminApi(body, adminToken);
      sendJson(res, result && result.code === 0 ? 200 : (result?.code || 500), result);
    } catch (err) {
      console.error('[admin-proxy]', err);
      sendJson(res, 500, { code: 500, msg: err.message || 'proxy error' });
    }
    return;
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    serveStatic(req, res);
    return;
  }

  sendJson(res, 405, { code: 405, msg: 'method not allowed' });
});

server.listen(PORT, () => {
  console.log(`书漂漂运营后台: http://localhost:${PORT}`);
  console.log('使用仓库根目录 .env.local 中的 TCB 密钥调用云函数（无需匿名登录）');
});
