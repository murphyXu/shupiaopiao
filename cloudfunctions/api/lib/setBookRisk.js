const HIGH_RISK_PATTERNS = [
  /共\s*\d+\s*册/,
  /全\s*\d+\s*册/,
  /\d+\s*册装/,
  /套装/,
  /全套/,
  /全集/,
  /礼盒/,
  /盒装/,
];

const MEDIUM_RISK_PATTERNS = [
  /上下册/,
  /上中下/,
  /第\s*\d+\s*册/,
  /卷\s*[一二三四五六七八九十\d]+/,
  /系列/,
];

const SET_COMPLETENESS_VALUES = new Set(['complete', 'partial', 'non_set']);

function matchedText(text, patterns = []) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0].replace(/\s+/g, '');
  }
  return '';
}

function bookRiskText(book = {}) {
  return [book.title, book.rawTitle, book.subtitle, book.summary, book.publisher, book.category]
    .filter(Boolean)
    .join(' ');
}

function detectSetBookRisk(book = {}) {
  const text = bookRiskText(book);
  const high = matchedText(text, HIGH_RISK_PATTERNS);
  if (high) {
    return {
      setBookRisk: true,
      setBookRiskLevel: 'high',
      setBookRiskReason: `命中“${high}”`,
    };
  }
  const medium = matchedText(text, MEDIUM_RISK_PATTERNS);
  if (medium) {
    return {
      setBookRisk: true,
      setBookRiskLevel: 'medium',
      setBookRiskReason: `命中“${medium}”`,
    };
  }
  return { setBookRisk: false, setBookRiskLevel: '', setBookRiskReason: '' };
}

function normalizeSetConfirmation(data = {}, risk = {}) {
  if (!risk.setBookRisk) {
    return { ok: true, setCompleteness: 'unknown', setDescription: '' };
  }
  const setCompleteness = String(data.setCompleteness || '').trim();
  if (!SET_COMPLETENESS_VALUES.has(setCompleteness)) {
    return { ok: false, message: '请确认赠出内容后再上漂' };
  }
  if (setCompleteness === 'partial') {
    const setDescription = String(data.setDescription || '').trim().slice(0, 60);
    if (!setDescription) return { ok: false, message: '请说明实际包含哪些册' };
    return { ok: true, setCompleteness, setDescription };
  }
  return { ok: true, setCompleteness, setDescription: '' };
}

module.exports = {
  detectSetBookRisk,
  normalizeSetConfirmation,
};
