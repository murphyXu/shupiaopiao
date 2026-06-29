const crypto = require('crypto');
const { fail } = require('./utils');

const DEFAULT_TTL_HOURS = 12;

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function parseBase64urlJson(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

function jwtSecret() {
  const secret = String(process.env.ADMIN_JWT_SECRET || process.env.ADMIN_PASSWORD || '').trim();
  if (!secret) return '';
  return secret;
}

function adminUsername() {
  return String(process.env.ADMIN_USERNAME || 'admin').trim();
}

function adminPassword() {
  return String(process.env.ADMIN_PASSWORD || '').trim();
}

function signToken(payload = {}, ttlHours = DEFAULT_TTL_HOURS) {
  const secret = jwtSecret();
  if (!secret) throw new Error('ADMIN_JWT_SECRET or ADMIN_PASSWORD not configured');
  const header = { alg: 'HS256', typ: 'JWT' };
  const exp = Math.floor(Date.now() / 1000) + Math.max(Number(ttlHours) || DEFAULT_TTL_HOURS, 1) * 3600;
  const body = { ...payload, exp };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(body));
  const signature = crypto.createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function verifyToken(token) {
  const secret = jwtSecret();
  if (!secret || !token) return null;
  const parts = String(token).split('.');
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, signature] = parts;
  const expected = crypto.createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  let payload;
  try {
    payload = parseBase64urlJson(encodedPayload);
  } catch (err) {
    return null;
  }
  if (!payload || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

function verifyPassword(username, password) {
  const expectedUser = adminUsername();
  const expectedPass = adminPassword();
  if (!expectedPass) return false;
  const userBuf = Buffer.from(String(username || ''));
  const expectedUserBuf = Buffer.from(expectedUser);
  const passBuf = Buffer.from(String(password || ''));
  const expectedPassBuf = Buffer.from(expectedPass);
  if (userBuf.length !== expectedUserBuf.length || passBuf.length !== expectedPassBuf.length) return false;
  return crypto.timingSafeEqual(userBuf, expectedUserBuf)
    && crypto.timingSafeEqual(passBuf, expectedPassBuf);
}

function parseBearer(headers = {}) {
  const raw = headers.authorization || headers.Authorization || '';
  const match = String(raw).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function resolveAdminContext(openid, headers = {}, adminToken = '') {
  const token = parseBearer(headers) || String(adminToken || '').trim();
  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      return {
        source: 'jwt',
        username: payload.username || payload.sub || 'admin',
        role: 'superadmin',
      };
    }
    return null;
  }
  const legacy = require('../handlers/admin');
  if (legacy.requireAdmin(openid)) {
    return { source: 'openid', openid, role: 'superadmin' };
  }
  return null;
}

function requireAdminContext(openid, headers = {}, adminToken = '') {
  const ctx = resolveAdminContext(openid, headers, adminToken);
  if (!ctx) return { error: fail(401, '未登录或登录已过期') };
  return { ctx };
}

function loginResult(username) {
  const ttlHours = Number(process.env.ADMIN_JWT_TTL_HOURS) || DEFAULT_TTL_HOURS;
  const token = signToken({ sub: 'admin', username }, ttlHours);
  const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();
  return {
    token,
    expiresAt,
    username,
    displayName: username,
    role: 'superadmin',
  };
}

module.exports = {
  adminUsername,
  signToken,
  verifyToken,
  verifyPassword,
  parseBearer,
  resolveAdminContext,
  requireAdminContext,
  loginResult,
};
