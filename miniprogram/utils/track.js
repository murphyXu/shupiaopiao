/**
 * 前端轻量埋点封装
 * - 批量缓冲：累积到阈值或定时 flush，合并成 analytics.track 一次上报，省调用次数
 * - 容错：上报失败静默丢弃，绝不弹错、绝不影响业务
 * - 隐私：仅上报行为事件与属性，不采集手机号/地址/姓名等 PII
 */
const api = require('./api');

const BUFFER = [];
const MAX_BUFFER = 8; // 累积 8 条即上报
const FLUSH_INTERVAL = 10000; // 或每 10s 上报一次
let timer = null;
let context = { platform: '', scene: '' };

function setContext(ctx = {}) {
  if (ctx.platform) context.platform = ctx.platform;
  if (ctx.scene !== undefined) context.scene = String(ctx.scene);
}

function flush() {
  if (!BUFFER.length) return;
  const events = BUFFER.splice(0, BUFFER.length);
  // showError:false 确保上报失败不打扰用户
  api.call('analytics.track', { events, platform: context.platform, scene: context.scene }, { showError: false })
    .catch(() => {});
}

function ensureTimer() {
  if (timer) return;
  timer = setInterval(flush, FLUSH_INTERVAL);
}

/**
 * 记录一个事件
 * @param {string} type 事件类型，如 page_view / tab_switch / invite_share
 * @param {object} props 自定义属性
 */
function track(type, props = {}) {
  if (!type) return;
  try {
    BUFFER.push({ type, props: props || {}, ts: Date.now() });
    ensureTimer();
    if (BUFFER.length >= MAX_BUFFER) flush();
  } catch (e) {
    // 静默
  }
}

// 页面浏览快捷方法
function trackPageView(page, extra = {}) {
  track('page_view', { page, ...extra });
}

module.exports = { track, trackPageView, flush, setContext };
