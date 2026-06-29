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

const SET_COMPLETENESS_OPTIONS = [
  { key: 'complete', label: '完整套装' },
  { key: 'partial', label: '非全套，仅部分册' },
  { key: 'non_set', label: '非套装书' },
];

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

module.exports = {
  SET_COMPLETENESS_OPTIONS,
  detectSetBookRisk,
};
