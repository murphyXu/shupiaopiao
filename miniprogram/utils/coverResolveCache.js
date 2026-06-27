const RESOLVED_COVER_ISBNS_KEY = 'resolvedCoverIsbns';
const RESOLVED_COVER_ISBNS_LIMIT = 500;

function readResolvedCoverIsbns() {
  try {
    const stored = wx.getStorageSync(RESOLVED_COVER_ISBNS_KEY);
    return new Set(Array.isArray(stored) ? stored : []);
  } catch (err) {
    return new Set();
  }
}

function rememberResolvedCoverIsbn(isbn) {
  if (!isbn) return;
  const resolved = readResolvedCoverIsbns();
  resolved.add(isbn);
  const next = [...resolved].slice(-RESOLVED_COVER_ISBNS_LIMIT);
  try {
    wx.setStorageSync(RESOLVED_COVER_ISBNS_KEY, next);
  } catch (err) {
    console.warn('[covers] resolved isbn cache skipped', err);
  }
}

module.exports = {
  readResolvedCoverIsbns,
  rememberResolvedCoverIsbn,
};
