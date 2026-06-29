const { cleanBookTitle, normalizeSearchText } = require('./bookLookupPolicy');

const PICTURE_BOOK_SIGNALS = [
  '插画家', '绘本', '图画书', '动物为主角', '视觉观察游戏书', '小读者一读再读',
  '老鼠邮差', '玛丽安娜',
];
const ACADEMIC_TITLE_SIGNALS = [
  '编辑', '语言应用', '概论', '教程', '学术', '教材', '研究', '修辞学', '语言学',
];
const SOCIAL_CATEGORIES = ['社会文化', '社科', '语言文字', '教育'];

function catalogTextBlob(record = {}) {
  return [
    record.title,
    record.author,
    record.summary,
    record.rawSummary,
    record.authorIntro,
    record.rawTail,
  ].filter(Boolean).join(' ');
}

function detectMixedCatalogRecord(record = {}) {
  const blob = catalogTextBlob(record);
  const hasPicture = PICTURE_BOOK_SIGNALS.some((signal) => blob.includes(signal));
  const title = String(record.title || '');
  const category = String(record.category || '');
  const hasAcademicTitle = ACADEMIC_TITLE_SIGNALS.some((signal) => title.includes(signal));
  const socialCategory = SOCIAL_CATEGORIES.some((signal) => category.includes(signal));
  const authorLooksAcademic = /著|主编|编$/u.test(String(record.author || '').trim())
    && !PICTURE_BOOK_SIGNALS.some((signal) => String(record.author || '').includes(signal));
  return hasPicture && (hasAcademicTitle || (socialCategory && authorLooksAcademic));
}

function titlesCompatible(left = '', right = '') {
  const a = normalizeSearchText(cleanBookTitle(left));
  const b = normalizeSearchText(cleanBookTitle(right));
  if (!a || !b) return true;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const minLen = Math.min(a.length, b.length);
  if (minLen >= 4) {
    for (let size = minLen; size >= 4; size -= 1) {
      for (let i = 0; i <= a.length - size; i += 1) {
        const part = a.slice(i, i + size);
        if (b.includes(part)) return true;
      }
    }
  }
  return false;
}

function assessCatalogRecord(record = {}) {
  const reasons = [];
  if (detectMixedCatalogRecord(record)) reasons.push('mixed_content');
  if (!String(record.title || '').trim()) reasons.push('missing_title');
  if (!String(record.listPrice || '').replace(/[^0-9.]/g, '')) reasons.push('missing_list_price');
  if (!String(record.coverRemote || '').trim()) reasons.push('missing_cover');
  return {
    quality: reasons.length ? 'suspect' : 'trusted',
    reasons,
  };
}

function shouldTrustCatalogForMerge(existing = {}, catalog = {}) {
  if (catalog.catalogQuality === 'suspect') {
    return { ok: false, reason: 'suspect_catalog', assessment: { quality: 'suspect', reasons: catalog.catalogQualityReasons || ['suspect_catalog'] } };
  }
  const assessment = assessCatalogRecord(catalog);
  if (assessment.quality === 'suspect') {
    return { ok: false, reason: assessment.reasons[0] || 'suspect_catalog', assessment };
  }
  const existingTitle = cleanBookTitle(existing.title || existing.rawTitle);
  const catalogTitle = cleanBookTitle(catalog.title);
  if (existingTitle && catalogTitle && !titlesCompatible(existingTitle, catalogTitle)) {
    return { ok: false, reason: 'title_conflict', assessment };
  }
  return { ok: true, assessment };
}

module.exports = {
  PICTURE_BOOK_SIGNALS,
  ACADEMIC_TITLE_SIGNALS,
  detectMixedCatalogRecord,
  titlesCompatible,
  assessCatalogRecord,
  shouldTrustCatalogForMerge,
};
