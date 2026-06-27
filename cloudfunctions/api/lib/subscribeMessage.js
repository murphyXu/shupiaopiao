const { nowIso } = require('./utils');
const { db, _, getBookById } = require('./db');
const { ensureCollection } = require('./collections');

const DEFAULT_TMPL = {
  claimNotify: 'Gw6HlIXjcKwN2uhfvnQMpjInSj-a9dCAabcwxGWUBlg',
  shipRemind: 'w1maSH93gEzVNejUv04-kqiat9ezvkYznjkUreW003I',
};

const SHIP_REMIND_MS = 24 * 3600 * 1000;
const CLAIM_STATUS_TEXT = '已接漂';
const SHIP_REMIND_HINT = '请尽快寄出';

function getCloud() {
  return require('wx-server-sdk');
}

function tmplId(key) {
  const envKey = key === 'claimNotify' ? 'TMPL_CLAIM_NOTIFY' : 'TMPL_SHIP_REMIND';
  return process.env[envKey] || DEFAULT_TMPL[key] || '';
}

function purposeForTmplId(id) {
  if (id === tmplId('claimNotify')) return 'claim_notify';
  if (id === tmplId('shipRemind')) return 'ship_remind';
  return '';
}

function truncateThing(value, max = 20) {
  const text = String(value || '').trim();
  if (!text) return '图书';
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function formatSubscribeTime(value) {
  const d = new Date(value || Date.now());
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}年${pad(d.getMonth() + 1)}月${pad(d.getDate())}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatSubscribeDate(value) {
  const d = new Date(value || Date.now());
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}年${pad(d.getMonth() + 1)}月${pad(d.getDate())}日`;
}

function parseTemplateFields(content = '') {
  const fields = [];
  const re = /([^\n:{]+)\s*[:：]\s*\{\{(\w+)\.DATA\}\}/g;
  let match = re.exec(String(content || ''));
  while (match) {
    fields.push({ label: match[1].trim(), key: match[2] });
    match = re.exec(String(content || ''));
  }
  return fields;
}

function semanticValueKey(label, purpose) {
  const text = String(label || '');
  if (/截止|到期|最晚|期限/.test(text)) return 'shipDeadlineAt';
  if (/时间|日期/.test(text)) return purpose === 'ship_remind' ? 'shipDeadlineAt' : 'claimedAt';
  if (/待办|事项/.test(text)) return 'todoTitle';
  if (/名称|书名|图书|服务名|项目|商品|内容/.test(text)) {
    return purpose === 'ship_remind' ? 'todoTitle' : 'bookTitle';
  }
  if (/进度|状态|结果/.test(text)) return 'claimStatus';
  if (/备注|提示|温馨|说明/.test(text)) return purpose === 'ship_remind' ? 'shipHint' : 'claimStatus';
  return '';
}

function enumValuesForField(template, fieldKey) {
  const list = (template && template.keywordEnumValueList) || [];
  const entry = list.find((item) => item.keywordCode === fieldKey);
  return entry && Array.isArray(entry.enumValueList) ? entry.enumValueList : null;
}

function formatTemplateFieldValue(fieldKey, valueKey, rawValue, template) {
  const enums = enumValuesForField(template, fieldKey);
  if (enums && enums.length) {
    const preferred = String(rawValue || '');
    const matched = enums.find((item) => item === preferred || item.includes(preferred) || preferred.includes(item));
    if (matched) return matched;
    const progressLike = enums.find((item) => /进行|处理|完成|接|进度/.test(item));
    return progressLike || enums[0];
  }
  if (/^date/.test(fieldKey)) return formatSubscribeDate(rawValue);
  if (/^time/.test(fieldKey)) return formatSubscribeTime(rawValue);
  if (valueKey === 'bookTitle' || valueKey === 'todoTitle') return truncateThing(rawValue);
  if (valueKey === 'claimStatus') return CLAIM_STATUS_TEXT;
  if (valueKey === 'shipHint') return SHIP_REMIND_HINT;
  return String(rawValue || '');
}

function rawValueForKey(valueKey, values, purpose) {
  const bookTitle = truncateThing(values.bookTitle);
  const todo = bookTitle.startsWith('《') ? `${bookTitle}待寄出` : `《${bookTitle}》待寄出`;
  const map = {
    bookTitle,
    todoTitle: truncateThing(todo),
    claimStatus: CLAIM_STATUS_TEXT,
    shipHint: SHIP_REMIND_HINT,
    claimedAt: values.claimedAt,
    shipDeadlineAt: values.shipDeadlineAt,
  };
  if (purpose === 'ship_remind' && valueKey === 'bookTitle') return map.todoTitle;
  return map[valueKey];
}

function buildDataFromPrivateTemplate(template, purpose, values) {
  if (!template || !template.content) return { fieldMap: {}, data: {} };
  const fields = parseTemplateFields(template.content);
  const fieldMap = {};
  const data = {};
  fields.forEach(({ label, key }) => {
    const valueKey = semanticValueKey(label, purpose);
    if (!valueKey) return;
    fieldMap[key] = valueKey;
    const raw = rawValueForKey(valueKey, values, purpose);
    data[key] = { value: formatTemplateFieldValue(key, valueKey, raw, template) };
  });
  return { fieldMap, data, fields, content: template.content };
}

let privateTemplateCache = null;
let privateTemplateCacheAt = 0;

async function fetchPrivateTemplates(force = false) {
  const now = Date.now();
  if (!force && privateTemplateCache && now - privateTemplateCacheAt < 5 * 60 * 1000) {
    return privateTemplateCache;
  }
  try {
    const result = await getCloud().openapi.subscribeMessage.getTemplateList({});
    privateTemplateCache = (result && result.data) || [];
    privateTemplateCacheAt = now;
    return privateTemplateCache;
  } catch (err) {
    console.error('subscribeMessage.getTemplateList failed', err && (err.errMsg || err.message || err));
    return privateTemplateCache || [];
  }
}

async function findPrivateTemplate(templateId) {
  const templates = await fetchPrivateTemplates();
  return templates.find((item) => item.priTmplId === templateId) || null;
}

async function sendSubscribeForPurpose({
  touser, templateId, page, purpose, values, staticFallbacks, builder,
}) {
  const template = await findPrivateTemplate(templateId);
  const attempts = [];
  if (template) {
    const built = buildDataFromPrivateTemplate(template, purpose, values);
    if (built.data && Object.keys(built.data).length) {
      attempts.push({ data: built.data, fieldMap: built.fieldMap, source: 'private_template', templateTitle: template.title });
    }
  }
  staticFallbacks.forEach((fieldMap) => {
    attempts.push({
      data: builder(values, fieldMap),
      fieldMap,
      source: 'static_fallback',
      templateTitle: template && template.title,
    });
  });

  let lastError = '';
  let lastPayload = null;
  for (const attempt of attempts) {
    lastPayload = attempt.data;
    const sendResult = await sendSubscribeMessage({
      touser,
      templateId,
      page,
      data: attempt.data,
    });
    if (sendResult.ok) {
      return {
        ...sendResult,
        data: attempt.data,
        fieldMap: attempt.fieldMap,
        source: attempt.source,
        templateTitle: attempt.templateTitle,
      };
    }
    lastError = sendResult.error || lastError;
  }
  return {
    ok: false,
    error: lastError || 'subscribe send failed',
    data: lastPayload,
    templateContent: template && template.content,
  };
}

function parseFieldMap(envKey, fallback) {
  const raw = process.env[envKey];
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch (err) {
    return fallback;
  }
}

const CLAIM_FIELD_MAP = parseFieldMap('TMPL_CLAIM_FIELD_MAP', {
  thing1: 'bookTitle',
  thing2: 'claimStatus',
  time3: 'claimedAt',
});

const CLAIM_FIELD_FALLBACKS = [
  CLAIM_FIELD_MAP,
  parseFieldMap('TMPL_CLAIM_FIELD_MAP_ALT1', {
    thing2: 'bookTitle',
    thing3: 'claimStatus',
    time4: 'claimedAt',
  }),
  parseFieldMap('TMPL_CLAIM_FIELD_MAP_ALT2', {
    thing1: 'bookTitle',
    thing4: 'claimStatus',
    time2: 'claimedAt',
  }),
];

const SHIP_FIELD_MAP = parseFieldMap('TMPL_SHIP_FIELD_MAP', {
  thing1: 'todoTitle',
  time2: 'shipDeadlineAt',
  thing3: 'shipHint',
});

const SHIP_FIELD_FALLBACKS = [
  SHIP_FIELD_MAP,
  parseFieldMap('TMPL_SHIP_FIELD_MAP_ALT1', {
    thing2: 'todoTitle',
    time3: 'shipDeadlineAt',
    thing4: 'shipHint',
  }),
];

function isAcceptedSubscribeStatus(status) {
  return status === 'accept' || status === 'acceptWithAudio' || status === 'acceptWithAlert';
}

function buildTemplateData(fieldMap, values) {
  const data = {};
  Object.entries(fieldMap).forEach(([fieldKey, valueKey]) => {
    const value = values[valueKey];
    if (value !== undefined && value !== '') data[fieldKey] = { value: String(value) };
  });
  return data;
}

function buildClaimData({ bookTitle, claimedAt }, fieldMap = CLAIM_FIELD_MAP) {
  return buildTemplateData(fieldMap, {
    bookTitle: truncateThing(bookTitle),
    claimStatus: CLAIM_STATUS_TEXT,
    claimedAt: formatSubscribeTime(claimedAt),
  });
}

function buildShipRemindData({ bookTitle, shipDeadlineAt }, fieldMap = SHIP_FIELD_MAP) {
  const title = truncateThing(bookTitle);
  const todo = title.startsWith('《') ? `${title}待寄出` : `《${title}》待寄出`;
  return buildTemplateData(fieldMap, {
    todoTitle: truncateThing(todo),
    shipDeadlineAt: formatSubscribeTime(shipDeadlineAt),
    shipHint: SHIP_REMIND_HINT,
  });
}

async function sendSubscribeWithFieldFallbacks(payload, values, builders, fallbacks, purpose) {
  return sendSubscribeForPurpose({
    touser: payload.touser,
    templateId: payload.templateId,
    page: payload.page,
    purpose,
    values,
    staticFallbacks: fallbacks,
    builder: builders,
  });
}

function miniprogramStatesToTry() {
  if (process.env.MINIPROGRAM_STATE) return [process.env.MINIPROGRAM_STATE];
  return ['developer', 'trial', 'formal'];
}

async function sendSubscribeMessage(payload) {
  let lastError = '';
  for (const miniprogramState of miniprogramStatesToTry()) {
    try {
      const result = await getCloud().openapi.subscribeMessage.send({
        lang: 'zh_CN',
        miniprogramState,
        ...payload,
      });
      return { ok: true, result, miniprogramState };
    } catch (err) {
      lastError = err && (err.errMsg || err.message || JSON.stringify(err));
      console.error('subscribeMessage.send failed', { miniprogramState, lastError, templateId: payload.templateId });
    }
  }
  return { ok: false, error: lastError || 'subscribe send failed' };
}

async function resolveUserOpenid(userId, fallbackOpenid = '') {
  if (fallbackOpenid) return fallbackOpenid;
  const { data: user } = await db.collection('users').doc(userId).get();
  return (user && user.openid) || '';
}

function pickEarliestGrant(rows = []) {
  if (!rows.length) return null;
  return rows.slice().sort((a, b) => String(a.grantedAt || '').localeCompare(String(b.grantedAt || '')))[0];
}

async function findConsumableGrant({ userId, tmplId, driftId }) {
  if (!userId || !tmplId) return null;
  const base = { userId, tmplId, status: 'accept', consumed: _.neq(true) };
  if (driftId) {
    const { data: scoped } = await db.collection('subscribe_grants').where({ ...base, driftId }).limit(20).get();
    const grant = pickEarliestGrant(scoped);
    if (grant) return grant;
  }
  const { data: general } = await db.collection('subscribe_grants').where(base).limit(20).get();
  return pickEarliestGrant(general);
}

async function markGrantConsumed(grantId, consumeRefId) {
  await db.collection('subscribe_grants').doc(grantId).update({
    data: { consumed: true, consumedAt: nowIso(), consumeRefId: consumeRefId || '' },
  });
}

async function recordSubscribeGrants(openid, userId, driftId, templates = {}) {
  await ensureCollection(db, 'subscribe_grants');
  const now = nowIso();
  const known = new Set([tmplId('claimNotify'), tmplId('shipRemind')].filter(Boolean));
  let recorded = 0;
  for (const [id, status] of Object.entries(templates || {})) {
    if (!known.has(id) || !isAcceptedSubscribeStatus(status)) continue;
    await db.collection('subscribe_grants').add({
      data: {
        userId,
        openid,
        tmplId: id,
        driftId: driftId || '',
        purpose: purposeForTmplId(id),
        status: 'accept',
        grantedAt: now,
        consumed: false,
        consumedAt: '',
        consumeRefId: '',
      },
    });
    recorded += 1;
  }
  return recorded;
}

async function recordGrantSendOutcome(grantId, outcome) {
  if (!grantId) return;
  try {
    await db.collection('subscribe_grants').doc(grantId).update({
      data: {
        lastSendAt: nowIso(),
        lastSendOk: !!outcome.ok,
        lastSendError: outcome.ok ? '' : (outcome.error || outcome.skipped || ''),
        lastMiniprogramState: outcome.miniprogramState || '',
        lastSendPayload: outcome.data || null,
        lastFieldMap: outcome.fieldMap || null,
      },
    });
  } catch (err) { /* best-effort diagnostics */ }
}

async function logSubscribeOrderEvent(orderId, type, payload) {
  if (!orderId) return;
  try {
    await ensureCollection(db, 'drift_order_events');
    await db.collection('drift_order_events').add({
      data: {
        orderId,
        type,
        actorId: '',
        payload,
        createdAt: nowIso(),
      },
    });
  } catch (err) { /* best-effort diagnostics */ }
}

async function notifyGiverOnClaim({ giverId, driftId, orderId, claimedAt }) {
  const claimTmpl = tmplId('claimNotify');
  if (!claimTmpl || !giverId || !driftId) return { skipped: 'missing_context' };

  const grant = await findConsumableGrant({ userId: giverId, tmplId: claimTmpl, driftId });
  if (!grant) return { skipped: 'no_grant' };

  const { data: drift } = await db.collection('drifts').doc(driftId).get();
  let bookTitle = '图书';
  if (drift && drift.bookId) {
    const book = await getBookById(drift.bookId);
    bookTitle = (book && book.title) || bookTitle;
  }

  const touser = await resolveUserOpenid(giverId, grant.openid);
  if (!touser) return { skipped: 'no_openid' };

  const sendResult = await sendSubscribeWithFieldFallbacks({
    touser,
    templateId: claimTmpl,
    page: 'pages/drift/given?status=PENDING_SHIP',
  }, { bookTitle, claimedAt }, buildClaimData, CLAIM_FIELD_FALLBACKS, 'claim_notify');
  await recordGrantSendOutcome(grant._id, sendResult);
  if (sendResult.ok) {
    await markGrantConsumed(grant._id, orderId);
    await logSubscribeOrderEvent(orderId, 'SUBSCRIBE_CLAIM_SENT', {
      grantId: grant._id, driftId, giverId, miniprogramState: sendResult.miniprogramState, fieldMap: sendResult.fieldMap,
    });
  } else {
    await logSubscribeOrderEvent(orderId, 'SUBSCRIBE_CLAIM_FAILED', {
      grantId: grant._id, driftId, giverId, error: sendResult.error, data: sendResult.data,
    });
    console.error('notifyGiverOnClaim failed', { orderId, driftId, giverId, sendResult });
  }
  return sendResult;
}

async function notifyGiverShipRemind(order) {
  const shipTmpl = tmplId('shipRemind');
  if (!shipTmpl || !order || !order.giverId || !order.driftId) return { skipped: 'missing_context' };
  if (order.shipRemindSent === true) return { skipped: 'already_sent' };

  const grant = await findConsumableGrant({ userId: order.giverId, tmplId: shipTmpl, driftId: order.driftId });
  if (!grant) return { skipped: 'no_grant' };

  const { data: drift } = await db.collection('drifts').doc(order.driftId).get();
  let bookTitle = '图书';
  if (drift && drift.bookId) {
    const book = await getBookById(drift.bookId);
    bookTitle = (book && book.title) || bookTitle;
  }

  const touser = await resolveUserOpenid(order.giverId, grant.openid);
  if (!touser) return { skipped: 'no_openid' };

  const sendResult = await sendSubscribeWithFieldFallbacks({
    touser,
    templateId: shipTmpl,
    page: 'pages/drift/given?status=PENDING_SHIP',
  }, { bookTitle, shipDeadlineAt: order.shipDeadlineAt }, buildShipRemindData, SHIP_FIELD_FALLBACKS, 'ship_remind');
  await recordGrantSendOutcome(grant._id, sendResult);
  if (sendResult.ok) {
    await db.collection('drift_orders').doc(order._id).update({ data: { shipRemindSent: true } });
    await markGrantConsumed(grant._id, order._id);
  } else {
    console.error('notifyGiverShipRemind failed', { orderId: order._id, sendResult });
  }
  return sendResult;
}

async function sendShipRemindBatch(nowIsoValue) {
  await ensureCollection(db, 'subscribe_grants');
  const nowMs = Date.parse(nowIsoValue);
  if (!Number.isFinite(nowMs)) return [];

  const { data: rows } = await db.collection('drift_orders').where({
    status: 'PENDING_SHIP',
    shipRemindSent: _.neq(true),
  }).limit(100).get();

  const due = rows.filter((order) => {
    const dead = Date.parse(order.shipDeadlineAt || '');
    return Number.isFinite(dead) && dead > nowMs && dead - nowMs <= SHIP_REMIND_MS;
  });

  const results = [];
  for (const order of due) {
    try {
      const outcome = await notifyGiverShipRemind(order);
      results.push({ id: order._id, action: 'SHIP_REMIND', outcome });
    } catch (err) {
      results.push({ id: order._id, action: 'SHIP_REMIND', error: err.message });
    }
  }
  return results;
}

async function subscribeDebug(userId, driftId = '') {
  await ensureCollection(db, 'subscribe_grants');
  const where = { userId };
  if (driftId) where.driftId = driftId;
  const { data: grants } = await db.collection('subscribe_grants').where(where).limit(20).get();
  grants.sort((a, b) => String(b.grantedAt || '').localeCompare(String(a.grantedAt || '')));
  const sampleAt = nowIso();
  const templates = await fetchPrivateTemplates(true);
  const claimTemplate = templates.find((item) => item.priTmplId === tmplId('claimNotify')) || null;
  const shipTemplate = templates.find((item) => item.priTmplId === tmplId('shipRemind')) || null;
  return {
    tmplIds: { claimNotify: tmplId('claimNotify'), shipRemind: tmplId('shipRemind') },
    privateTemplates: templates.map((item) => ({
      priTmplId: item.priTmplId,
      title: item.title,
      content: item.content,
      example: item.example,
      fields: parseTemplateFields(item.content),
      keywordEnumValueList: item.keywordEnumValueList || [],
    })),
    claimResolved: claimTemplate
      ? buildDataFromPrivateTemplate(claimTemplate, 'claim_notify', { bookTitle: '示例书名', claimedAt: sampleAt })
      : null,
    shipResolved: shipTemplate
      ? buildDataFromPrivateTemplate(shipTemplate, 'ship_remind', { bookTitle: '示例书名', shipDeadlineAt: sampleAt })
      : null,
    claimPayloadSamples: CLAIM_FIELD_FALLBACKS.map((fieldMap) => ({
      fieldMap,
      data: buildClaimData({ bookTitle: '示例书名', claimedAt: sampleAt }, fieldMap),
    })),
    shipPayloadSamples: SHIP_FIELD_FALLBACKS.map((fieldMap) => ({
      fieldMap,
      data: buildShipRemindData({ bookTitle: '示例书名', shipDeadlineAt: sampleAt }, fieldMap),
    })),
    grants,
    checklist: [
      'lastSendError argument invalid means template field keys mismatch',
      'claimResolved.data should match your MP template field names exactly',
      're-upload api cloud function after code changes',
      'grant consumed false can be used again after fix — re-claim or call resend',
    ],
  };
}

async function resendClaimNotifyForGrant(grantId) {
  const { data: grant } = await db.collection('subscribe_grants').doc(grantId).get();
  if (!grant || grant.purpose !== 'claim_notify' || grant.consumed === true) {
    return { skipped: 'grant_not_resendable' };
  }
  const { data: drift } = await db.collection('drifts').doc(grant.driftId).get();
  let bookTitle = '图书';
  if (drift && drift.bookId) {
    const book = await getBookById(drift.bookId);
    bookTitle = (book && book.title) || bookTitle;
  }
  const claimedAt = grant.grantedAt || nowIso();
  const sendResult = await sendSubscribeWithFieldFallbacks({
    touser: grant.openid,
    templateId: grant.tmplId,
    page: 'pages/drift/given?status=PENDING_SHIP',
  }, { bookTitle, claimedAt }, buildClaimData, CLAIM_FIELD_FALLBACKS, 'claim_notify');
  await recordGrantSendOutcome(grant._id, sendResult);
  if (sendResult.ok) {
    await markGrantConsumed(grant._id, grant.consumeRefId || `resend-${Date.now()}`);
  }
  return sendResult;
}

module.exports = {
  tmplId,
  purposeForTmplId,
  truncateThing,
  formatSubscribeTime,
  buildClaimData,
  buildShipRemindData,
  buildTemplateData,
  miniprogramStatesToTry,
  isAcceptedSubscribeStatus,
  recordSubscribeGrants,
  notifyGiverOnClaim,
  notifyGiverShipRemind,
  sendShipRemindBatch,
  subscribeDebug,
  resendClaimNotifyForGrant,
  parseTemplateFields,
  buildDataFromPrivateTemplate,
  fetchPrivateTemplates,
};
