const CARRIER_PATTERNS = {
  顺丰: /^(SF\d{10,13}|\d{12})$/,
  中通: /^(\d{10,16}|[A-Z0-9]{12,20})$/,
  圆通: /^(YT\d{10,15}|\d{10,18})$/,
  韵达: /^\d{13,15}$/,
  申通: /^\d{12,15}$/,
  邮政: /^(\d{13}|[A-Z]{2}\d{9}[A-Z]{2}|\d{10,20})$/i,
  京东: /^(JD[A-Z0-9]{10,18}|\d{10,18})$/,
  极兔: /^(JT\d{10,15}|\d{12,15})$/,
};

function normalizeTrackingNo(raw) {
  return String(raw || '')
    .trim()
    .replace(/[\s\-—–_]/g, '')
    .toUpperCase();
}

function extractTrackingNo(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';
  const prefixed = text.match(/(?:^|[^A-Z0-9])((?:SF|JD|YT|JT|EMS|EA|EE|EG|EH|EJ|EM|EN|EP|EQ|ER|ES|ET|EU|EV|EW|EX|EY|EZ)[A-Z0-9]{8,24})(?:[^A-Z0-9]|$)/i);
  if (prefixed) return normalizeTrackingNo(prefixed[1]);
  const digits = text.match(/(?:^|[^\d])(\d{10,20})(?:[^\d]|$)/);
  if (digits) return digits[1];
  return normalizeTrackingNo(text);
}

function validateTrackingNo(raw, expressCompany) {
  const normalized = extractTrackingNo(raw);
  if (!normalized) return { ok: false, message: '请输入运单号', normalized: '' };
  if (normalized.length < 8) return { ok: false, message: '运单号过短，请检查是否完整', normalized };
  if (normalized.length > 32) return { ok: false, message: '运单号过长，请检查是否正确', normalized };
  if (!/^[A-Z0-9]+$/.test(normalized)) return { ok: false, message: '运单号只能包含字母和数字', normalized };
  if (/^1[3-9]\d{9}$/.test(normalized)) return { ok: false, message: '这像是手机号，请填写快递单号', normalized };
  if (/^(\d)\1{7,}$/.test(normalized)) return { ok: false, message: '运单号格式异常，请核对', normalized };

  const pattern = CARRIER_PATTERNS[String(expressCompany || '').trim()];
  if (pattern && !pattern.test(normalized)) {
    return { ok: false, message: `${expressCompany}运单号格式不太对，请核对`, normalized };
  }
  return { ok: true, message: '', normalized };
}

module.exports = {
  CARRIER_PATTERNS,
  normalizeTrackingNo,
  extractTrackingNo,
  validateTrackingNo,
};
