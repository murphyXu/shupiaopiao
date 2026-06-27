/**
 * Pool feed ranking: shelf + browse + claim signals, with cold-start diversity.
 * Pure functions only — no database access (testable locally).
 */
const { resolveShelfCategory } = require('./bookCategory');

const POOL_CATEGORY_KEYS = ['children', 'literature', 'social', 'business', 'science', 'art', 'life', 'other'];

const SIGNAL_WEIGHTS = {
  shelf: 3,
  want: 5,
  received: 4,
  browseDetail: 2,
  browseCard: 1,
};

const COLD_START_SIGNAL_THRESHOLD = 3;
const RECENT_DAYS_BOOST = 7;
const GIVER_DENSITY_WINDOW = 20;
const GIVER_DENSITY_MAX = 2;

function poolCategoryFromBook(book = {}) {
  const { key } = resolveShelfCategory(book);
  return key === 'child' ? 'children' : key;
}

function bumpWeight(map, key, amount) {
  if (!key) return;
  map[key] = (map[key] || 0) + amount;
}

function bumpAuthor(map, author, amount) {
  const name = String(author || '').trim();
  if (!name) return;
  map[name] = (map[name] || 0) + amount;
}

function isQuickShelfRow(row = {}) {
  return row.purpose === 'drift_quick';
}

function daysSince(iso) {
  if (!iso) return Number.POSITIVE_INFINITY;
  const ms = Date.now() - new Date(iso).getTime();
  return ms / (24 * 60 * 60 * 1000);
}

function hashSeed(text = '') {
  let hash = 0;
  const raw = String(text);
  for (let i = 0; i < raw.length; i += 1) {
    hash = ((hash << 5) - hash) + raw.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function rotateCategories(seed = 0) {
  const offset = seed % POOL_CATEGORY_KEYS.length;
  return POOL_CATEGORY_KEYS.slice(offset).concat(POOL_CATEGORY_KEYS.slice(0, offset));
}

function createEmptyProfile() {
  return {
    categoryWeights: {},
    authorWeights: {},
    signalCount: 0,
    isColdStart: true,
  };
}

function finalizeProfile(profile) {
  const signalCount = Object.values(profile.categoryWeights).reduce((sum, n) => sum + n, 0)
    + Object.values(profile.authorWeights).reduce((sum, n) => sum + n, 0);
  return {
    ...profile,
    signalCount,
    isColdStart: signalCount < COLD_START_SIGNAL_THRESHOLD,
  };
}

function applyShelfSignals(profile, shelfRows = [], books = {}) {
  shelfRows.filter((row) => !isQuickShelfRow(row)).forEach((row) => {
    const book = books[row.bookId];
    if (!book) return;
    bumpWeight(profile.categoryWeights, poolCategoryFromBook(book), SIGNAL_WEIGHTS.shelf);
    bumpAuthor(profile.authorWeights, book.author, SIGNAL_WEIGHTS.shelf);
  });
  return profile;
}

function applyBookSignals(profile, books = {}, weight) {
  Object.values(books).forEach((book) => {
    if (!book) return;
    bumpWeight(profile.categoryWeights, poolCategoryFromBook(book), weight);
    bumpAuthor(profile.authorWeights, book.author, weight);
  });
  return profile;
}

function applyBrowseSignals(profile, events = []) {
  events.forEach((evt) => {
    const props = evt.props || {};
    const page = String(props.page || '');
    if (!page.startsWith('pool/')) return;
    const weight = page === 'pool/detail' ? SIGNAL_WEIGHTS.browseDetail : SIGNAL_WEIGHTS.browseCard;
    if (props.category) bumpWeight(profile.categoryWeights, props.category, weight);
    if (props.author) bumpAuthor(profile.authorWeights, props.author, weight);
  });
  return profile;
}

function scorePoolItem(item, profile) {
  const categoryScore = profile.categoryWeights[item.category] || 0;
  const author = item.book && item.book.author;
  const authorScore = author ? (profile.authorWeights[author] || 0) : 0;
  const freshnessBoost = daysSince(item.createdAt) <= RECENT_DAYS_BOOST ? 0.5 : 0;
  return categoryScore + authorScore + freshnessBoost;
}

function diversifyPoolList(list = [], seed = 0) {
  const buckets = {};
  POOL_CATEGORY_KEYS.forEach((key) => { buckets[key] = []; });
  list.forEach((item) => {
    const key = buckets[item.category] ? item.category : 'other';
    buckets[key].push(item);
  });
  Object.keys(buckets).forEach((key) => {
    buckets[key].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  });

  const order = rotateCategories(seed);
  const merged = [];
  let added = true;
  while (added) {
    added = false;
    order.forEach((category) => {
      const bucket = buckets[category];
      if (bucket && bucket.length) {
        merged.push(bucket.shift());
        added = true;
      }
    });
  }
  return merged;
}

function rankPoolList(list = [], profile = createEmptyProfile(), options = {}) {
  if (!list.length) return list;
  if (options.preserveOrder) return list;

  if (profile.isColdStart) {
    return diversifyPoolList(list, hashSeed(options.uidHash || 'anon'));
  }

  return [...list].sort((a, b) => {
    const scoreDiff = scorePoolItem(b, profile) - scorePoolItem(a, profile);
    if (scoreDiff !== 0) return scoreDiff;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
}

function giverKey(item = {}) {
  return String(item.giverId || '').trim();
}

function applyGiverDensityCap(list = [], options = {}) {
  const windowSize = Number(options.windowSize) || GIVER_DENSITY_WINDOW;
  const maxPerGiver = Number(options.maxPerGiver) || GIVER_DENSITY_MAX;
  if (!list.length || windowSize <= 0 || maxPerGiver <= 0) return list;

  const picked = [];
  const deferred = [];
  const counts = {};

  function canPick(giverId) {
    return !giverId || (counts[giverId] || 0) < maxPerGiver;
  }

  function pick(item) {
    const giverId = giverKey(item);
    if (!canPick(giverId)) return false;
    picked.push(item);
    if (giverId) counts[giverId] = (counts[giverId] || 0) + 1;
    return true;
  }

  list.forEach((item) => {
    if (picked.length >= windowSize) {
      deferred.push(item);
      return;
    }
    if (!pick(item)) deferred.push(item);
  });

  while (picked.length < windowSize && deferred.length) {
    const nextDeferred = [];
    deferred.forEach((item) => {
      if (picked.length >= windowSize) {
        nextDeferred.push(item);
        return;
      }
      if (!pick(item)) nextDeferred.push(item);
    });
    if (nextDeferred.length === deferred.length) break;
    deferred.length = 0;
    deferred.push(...nextDeferred);
  }

  const pickedIds = new Set(picked.map((item) => item.id));
  const remainder = list.filter((item) => !pickedIds.has(item.id));
  return [...picked, ...remainder];
}

module.exports = {
  POOL_CATEGORY_KEYS,
  COLD_START_SIGNAL_THRESHOLD,
  GIVER_DENSITY_WINDOW,
  GIVER_DENSITY_MAX,
  SIGNAL_WEIGHTS,
  poolCategoryFromBook,
  createEmptyProfile,
  finalizeProfile,
  applyShelfSignals,
  applyBookSignals,
  applyBrowseSignals,
  scorePoolItem,
  diversifyPoolList,
  rankPoolList,
  applyGiverDensityCap,
};
