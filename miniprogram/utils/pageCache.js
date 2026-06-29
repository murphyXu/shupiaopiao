const DEFAULT_TTL_MS = 30000;

function ensureCacheRoot() {
  const app = getApp();
  if (!app.globalData.pageCache) app.globalData.pageCache = {};
  if (app.globalData.poolFeedVersion == null) app.globalData.poolFeedVersion = 0;
  return app.globalData;
}

function readPageCache(key, ttlMs = DEFAULT_TTL_MS) {
  const root = ensureCacheRoot();
  const entry = root.pageCache[key];
  if (!entry) return null;
  if (Date.now() - entry.at > ttlMs) return null;
  return entry;
}

function writePageCache(key, data, extra = {}) {
  const root = ensureCacheRoot();
  root.pageCache[key] = {
    data,
    at: Date.now(),
    ...extra,
  };
}

function invalidatePageCache(prefix = '') {
  const root = ensureCacheRoot();
  Object.keys(root.pageCache).forEach((key) => {
    if (!prefix || key.startsWith(prefix)) delete root.pageCache[key];
  });
}

function bumpPoolFeedVersion(feedVersion) {
  const root = ensureCacheRoot();
  if (Number(feedVersion) > Number(root.poolFeedVersion || 0)) {
    root.poolFeedVersion = Number(feedVersion);
    invalidatePageCache('pool/');
  }
}

function shouldUseCachedPage(key, ttlMs = DEFAULT_TTL_MS) {
  return !!readPageCache(key, ttlMs);
}

module.exports = {
  DEFAULT_TTL_MS,
  readPageCache,
  writePageCache,
  invalidatePageCache,
  bumpPoolFeedVersion,
  shouldUseCachedPage,
};
