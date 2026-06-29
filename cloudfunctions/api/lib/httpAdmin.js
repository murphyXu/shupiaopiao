const { ok, fail } = require('./utils');
const { resolveAdminContext } = require('./adminAuth');

function corsHeaders(origin = '*') {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function httpResponse(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: { ...corsHeaders(), ...headers },
    body: JSON.stringify(body),
  };
}

function parseHttpBody(event = {}) {
  const raw = event.body;
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch (err) {
    return {};
  }
}

async function handleHttpAdminRequest(event, dispatch) {
  const method = String(event.httpMethod || event.method || 'POST').toUpperCase();
  if (method === 'OPTIONS') {
    return httpResponse(204, '', corsHeaders());
  }
  if (method !== 'POST') {
    return httpResponse(405, fail(405, '仅支持 POST'));
  }

  const payload = parseHttpBody(event);
  const action = payload.action || event.action;
  const data = payload.data || {};
  if (!action) return httpResponse(400, fail(400, '缺少 action'));

  const headers = event.headers || {};
  const adminCtx = resolveAdminContext('', headers);
  if (!adminCtx && action !== 'admin.auth.login') {
    return httpResponse(401, fail(401, '未登录或登录已过期'));
  }

  try {
    const result = await dispatch(action, data, '', {}, adminCtx, headers);
    const statusCode = result && result.code === 0 ? 200 : (result && result.code ? Number(result.code) : 500);
    return httpResponse(statusCode >= 400 ? statusCode : 200, result);
  } catch (err) {
    console.error('[httpAdmin]', action, err);
    return httpResponse(500, fail(500, err.message || '服务器错误'));
  }
}

module.exports = {
  handleHttpAdminRequest,
  httpResponse,
  parseHttpBody,
};
