const { ok } = require('../lib/utils');
const { logBatch } = require('../lib/analytics');

/**
 * 前端埋点批量上报入口
 * data: { events: [{ type, action?, props?, durationMs? }], platform?, scene? }
 * 容错优先：无论是否登录都接收，写入失败也返回 ok，避免影响前端体验
 */
async function track(openid, data = {}, ctx = {}) {
  const events = Array.isArray(data.events) ? data.events : [];
  const context = {
    platform: data.platform || ctx.platform || '',
    scene: data.scene || ctx.scene || '',
  };
  let written = 0;
  try {
    written = await logBatch(openid, events, context);
  } catch (e) {
    written = 0;
  }
  return ok({ written });
}

module.exports = { track };
