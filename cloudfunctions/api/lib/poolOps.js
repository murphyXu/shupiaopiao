const MAX_OPS_PINNED = 30;

const POOL_CATEGORIES = new Set(['children', 'literature', 'business', 'other']);

function isPinnedActive(drift = {}, nowIso = '') {
  if (!drift.opsPinned || drift.opsHidden) return false;
  const until = String(drift.opsPinnedUntil || '').trim();
  if (until && until <= (nowIso || new Date().toISOString())) return false;
  return true;
}

function applyOpsPinnedDrifts(drifts = [], nowIso = '') {
  const now = nowIso || new Date().toISOString();
  const pinned = [];
  const rest = [];
  drifts.forEach((drift) => {
    if (isPinnedActive(drift, now)) pinned.push(drift);
    else rest.push(drift);
  });
  pinned.sort((a, b) => (Number(a.opsPinRank) || 999) - (Number(b.opsPinRank) || 999));
  return [...pinned, ...rest];
}

function isPinnedItemActive(item = {}, nowIso = '') {
  if (!item || !item.opsPinned) return false;
  const until = String(item.opsPinnedUntil || '').trim();
  if (until && until <= (nowIso || new Date().toISOString())) return false;
  return true;
}

/** Apply ops pin as the final pool feed ordering step (after recommend ranking). */
function applyOpsPinnedItems(list = [], nowIso = '') {
  const now = nowIso || new Date().toISOString();
  const pinned = [];
  const rest = [];
  list.forEach((item) => {
    if (isPinnedItemActive(item, now)) pinned.push(item);
    else rest.push(item);
  });
  pinned.sort((a, b) => (Number(a.opsPinRank) || 999) - (Number(b.opsPinRank) || 999));
  return [...pinned, ...rest];
}

function normalizeOpsCategory(value) {
  const key = String(value || '').trim();
  return POOL_CATEGORIES.has(key) ? key : '';
}

function countActivePinned(drifts = [], nowIso = '') {
  return drifts.filter((drift) => isPinnedActive(drift, nowIso)).length;
}

module.exports = {
  MAX_OPS_PINNED,
  POOL_CATEGORIES,
  isPinnedActive,
  applyOpsPinnedDrifts,
  isPinnedItemActive,
  applyOpsPinnedItems,
  normalizeOpsCategory,
  countActivePinned,
};
