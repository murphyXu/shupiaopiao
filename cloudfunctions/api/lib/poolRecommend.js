/**
 * Pool feed ranking: shelf + browse + claim signals, with cold-start diversity.
 * Pure functions only — no database access (testable locally).
 */
const { resolveShelfCategory } = require('./bookCategory');

const POOL_CATEGORY_KEYS = ['children', 'literature', 'business', 'other'];

const LEGACY_POOL_CATEGORY_TO_PUBLIC = {
  child: 'children',
  social: 'literature',
  science: 'business',
  art: 'literature',
  life: 'other',
};

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
const PLATFORM_CHILDREN_BOOST = 2;
const DEFAULT_PRIORITIZE_CATEGORY = 'children';
const TOP_LOW_POINT_CHILDREN = 6;
const LOW_POINT_CHILDREN_MAX = 5;

function poolCategoryFromBook(book = {}) {
  const { key } = resolveShelfCategory(book);
  return normalizePoolCategory(key);
}

function normalizePoolCategory(category) {
  const key = LEGACY_POOL_CATEGORY_TO_PUBLIC[category] || category;
  return POOL_CATEGORY_KEYS.includes(key) ? key : 'other';
}

function bumpWeight(map, key, amount) {
  if (!key) return;
  const category = normalizePoolCategory(key);
  map[category] = (map[category] || 0) + amount;
}

function bumpAuthor(map, author, amount) {
  const name = String(author || '').trim();
  if (!name) return;
  map[name] = (map[name] || 0) + amount;
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

function rotateCategories(seed = 0, options = {}) {
  const prioritize = options.prioritizeCategory || '';
  const rest = prioritize
    ? POOL_CATEGORY_KEYS.filter((key) => key !== prioritize)
    : POOL_CATEGORY_KEYS.slice();
  const offset = seed % Math.max(rest.length, 1);
  const rotatedRest = rest.slice(offset).concat(rest.slice(0, offset));
  return prioritize ? [prioritize, ...rotatedRest] : rotatedRest;
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
  shelfRows.forEach((row) => {
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
  const platformBoost = item.category === DEFAULT_PRIORITIZE_CATEGORY ? PLATFORM_CHILDREN_BOOST : 0;
  return categoryScore + authorScore + freshnessBoost + platformBoost;
}

function diversifyPoolList(list = [], seed = 0, options = {}) {
  const buckets = {};
  POOL_CATEGORY_KEYS.forEach((key) => { buckets[key] = []; });
  list.forEach((item) => {
    const key = buckets[item.category] ? item.category : normalizePoolCategory(item.category);
    buckets[key].push(item);
  });
  Object.keys(buckets).forEach((key) => {
    buckets[key].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  });

  const order = rotateCategories(seed, options);
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

function isLowPointChildrenItem(item = {}) {
  const value = Number(item.coinValue) || 0;
  return item.category === DEFAULT_PRIORITIZE_CATEGORY && value >= 0 && value <= LOW_POINT_CHILDREN_MAX;
}

function promoteTopLowPointChildren(list = [], topN = TOP_LOW_POINT_CHILDREN) {
  if (!list.length || topN <= 0) return list;
  const lowPointChildren = [];
  const others = [];
  list.forEach((item) => {
    if (isLowPointChildrenItem(item)) lowPointChildren.push(item);
    else others.push(item);
  });
  return [...lowPointChildren.slice(0, topN), ...lowPointChildren.slice(topN), ...others];
}

function rankPoolList(list = [], profile = createEmptyProfile(), options = {}) {
  if (!list.length) return list;
  if (options.preserveOrder) return list;

  if (profile.isColdStart) {
    return diversifyPoolList(list, hashSeed(options.uidHash || 'anon'), {
      prioritizeCategory: DEFAULT_PRIORITIZE_CATEGORY,
    });
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
  TOP_LOW_POINT_CHILDREN,
  LOW_POINT_CHILDREN_MAX,
  PLATFORM_CHILDREN_BOOST,
  DEFAULT_PRIORITIZE_CATEGORY,
  rotateCategories,
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
  isLowPointChildrenItem,
  promoteTopLowPointChildren,
  rankPoolList,
  applyGiverDensityCap,
};
