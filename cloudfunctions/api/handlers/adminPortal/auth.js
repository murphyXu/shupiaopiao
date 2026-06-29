const { ok, fail } = require('../../lib/utils');
const { verifyPassword, requireAdminContext, loginResult } = require('../../lib/adminAuth');

async function login(_data, _openid, _ctx, _adminCtx, _headers) {
  const username = String((_data && _data.username) || '').trim();
  const password = String((_data && _data.password) || '');
  if (!username || !password) return fail(400, '请输入账号和密码');
  if (!verifyPassword(username, password)) return fail(401, '用户名或密码错误');
  return ok(loginResult(username));
}

async function me(_data, openid, _ctx, _adminCtx, headers) {
  const auth = requireAdminContext(openid, headers);
  if (auth.error) return auth.error;
  const { ctx } = auth;
  return ok({
    username: ctx.username || 'admin',
    displayName: ctx.username || 'admin',
    role: ctx.role || 'superadmin',
    source: ctx.source,
  });
}

module.exports = { login, me };
