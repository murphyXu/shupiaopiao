const { subscribeTmplIds = {} } = require('../config/index');
const api = require('./api');

function getDriftSubscribeTmplIds() {
  return [subscribeTmplIds.claimNotify, subscribeTmplIds.shipRemind].filter(Boolean);
}

function extractTemplateResults(res = {}) {
  const templates = {};
  getDriftSubscribeTmplIds().forEach((id) => {
    if (res[id]) templates[id] = res[id];
  });
  return templates;
}

function requestDriftSubscribe() {
  const tmplIds = getDriftSubscribeTmplIds();
  if (!tmplIds.length) {
    return Promise.resolve({ templates: {}, errMsg: 'missing_tmpl_ids' });
  }
  return new Promise((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds,
      success: (res) => resolve({ templates: extractTemplateResults(res), errMsg: res.errMsg || '' }),
      fail: (err) => resolve({ templates: {}, error: err }),
    });
  });
}

function summarizeSubscribeResult(templates = {}) {
  const accepted = Object.values(templates).filter((status) => (
    status === 'accept' || status === 'acceptWithAudio' || status === 'acceptWithAlert'
  )).length;
  const rejected = Object.values(templates).filter((status) => status === 'reject').length;
  return { accepted, rejected, total: Object.keys(templates).length };
}

async function subscribeDriftNotifications(driftId) {
  if (!driftId) return { recorded: 0, accepted: 0, rejected: 0 };
  const { templates, error } = await requestDriftSubscribe();
  const summary = summarizeSubscribeResult(templates);
  if (!summary.total) {
    return { recorded: 0, ...summary, error: error || 'subscribe_dialog_failed' };
  }
  const res = await api.reportDriftSubscribe({ driftId, templates });
  return { ...res, ...summary };
}

module.exports = {
  getDriftSubscribeTmplIds,
  requestDriftSubscribe,
  subscribeDriftNotifications,
  summarizeSubscribeResult,
};
