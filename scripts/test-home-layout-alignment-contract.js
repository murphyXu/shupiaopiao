const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function stripWxmlComments(source) {
  return source.replace(/<!--[\s\S]*?-->/g, '');
}

function classNamesFromTag(tag) {
  const match = tag.match(/(?:^|\s)class="([^"]*)"/);
  return match ? match[1].split(/\s+/).filter(Boolean) : [];
}

function hasClass(tag, className) {
  return classNamesFromTag(tag).includes(className);
}

function extractViewByClass(source, className) {
  const openingViewPattern = /<view\b[^>]*>/g;
  let openingMatch;

  while ((openingMatch = openingViewPattern.exec(source)) !== null) {
    if (!hasClass(openingMatch[0], className)) {
      continue;
    }

    const start = openingMatch.index;
    const viewPattern = /<view\b[^>]*>|<\/view>/g;
    viewPattern.lastIndex = start;
    let depth = 0;
    let viewMatch;

    while ((viewMatch = viewPattern.exec(source)) !== null) {
      depth += viewMatch[0].startsWith('</view') ? -1 : 1;
      if (depth === 0) {
        return source.slice(start, viewPattern.lastIndex);
      }
    }

    return '';
  }

  return '';
}

function directChildOpeningTags(fragment) {
  const tags = [];
  const tagPattern = /<\/?([a-z-]+)\b[^>]*>/g;
  let depth = 0;
  let match;

  while ((match = tagPattern.exec(fragment)) !== null) {
    const tag = match[0];
    if (tag.startsWith('</')) {
      depth -= 1;
      continue;
    }

    if (depth === 1) {
      tags.push(tag);
    }
    if (!tag.endsWith('/>')) {
      depth += 1;
    }
  }

  return tags;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cssDeclarations(source, selector) {
  const rulePattern = new RegExp(`^\\s*${escapeRegExp(selector)}\\s*\\{([^}]*)\\}`, 'gms');
  const rules = [...source.matchAll(rulePattern)];
  assert.strictEqual(rules.length, 1, `expected exactly one CSS rule for ${selector}`);

  const declarations = rules[0][1]
    .split(';')
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .map((declaration) => {
      const separator = declaration.indexOf(':');
      assert.ok(separator >= 0, `invalid CSS declaration in ${selector}: ${declaration}`);
      return [
        declaration.slice(0, separator).trim(),
        declaration.slice(separator + 1).trim().replace(/\s+/g, ' '),
      ];
    })
    .sort(([left], [right]) => left.localeCompare(right));

  return Object.fromEntries(declarations);
}

const shelfWxml = stripWxmlComments(read('miniprogram/pages/shelf/index.wxml'));
const shelfWxss = read('miniprogram/pages/shelf/index.wxss');
const poolWxml = stripWxmlComments(read('miniprogram/pages/pool/index.wxml'));
const poolWxss = read('miniprogram/pages/pool/index.wxss');

const titleRow = extractViewByClass(shelfWxml, 'title-row');
const titleRowChildren = directChildOpeningTags(titleRow);
assert.deepStrictEqual(
  titleRowChildren.map((tag) => classNamesFromTag(tag).join(' ')),
  ['page-title shelf-title', 'header-action edit-name'],
  'shelf name and edit action should share the title row',
);
assert.deepStrictEqual(
  titleRowChildren.map((tag) => tag.match(/^<([a-z-]+)/)[1]),
  ['view', 'view'],
  'title row should use view elements',
);
assert.ok(
  titleRowChildren[1].includes('wx:if="{{!shareMode && loggedIn}}"')
    && titleRowChildren[1].includes('bindtap="startEditShelfName"'),
  'edit action should preserve its visibility and tap behavior',
);
assert.ok(
  !shelfWxml.includes('class="header-action share-btn"') && !shelfWxml.includes('分享书架</button>'),
  'shelf header should remove the top-right share shelf button',
);
const capacityRow = extractViewByClass(shelfWxml, 'capacity-row');
const capacityRowChildren = directChildOpeningTags(capacityRow);
assert.deepStrictEqual(
  capacityRowChildren.map((tag) => classNamesFromTag(tag).join(' ')),
  ['page-sub capacity-line', 'quota-action'],
  'remaining capacity and redeem action should share one row',
);
assert.ok(
  capacityRowChildren[1].includes('wx:if="{{loggedIn && !shareMode}}"')
    && capacityRowChildren[1].includes('bindtap="goRedeemCapacity"'),
  'quota action should preserve its visibility and navigation behavior',
);
const headerActionRule = shelfWxss.match(/\.header-action\s*\{([^}]*)\}/s);
assert.ok(
  headerActionRule
    && /height:\s*56rpx/.test(headerActionRule[1])
    && /width:\s*132rpx/.test(headerActionRule[1])
    && /flex-shrink:\s*0/.test(headerActionRule[1]),
  'edit action should match redeem action size',
);
const shelfTitleRule = shelfWxss.match(/\.shelf-title\s*\{([^}]*)\}/s);
assert.ok(
  shelfTitleRule && /flex:\s*0\s+1\s+216rpx/.test(shelfTitleRule[1]),
  'shelf title column should keep edit action close to the title',
);
assert.ok(
  shelfTitleRule && /(?:^|;)\s*overflow:\s*hidden(?:;|$)/.test(shelfTitleRule[1]),
  'shelf title should stay within the title row',
);
assert.ok(
  shelfTitleRule && /text-overflow:\s*ellipsis/.test(shelfTitleRule[1]),
  'long shelf names should ellipsize on narrow screens',
);
assert.ok(
  shelfTitleRule && /white-space:\s*nowrap/.test(shelfTitleRule[1]),
  'shelf title should stay on one line',
);
assert.ok(
  /\.capacity-row\s*\{[^}]*display:\s*flex[^}]*align-items:\s*center/s.test(shelfWxss),
  'capacity row should vertically align text and redeem action',
);
const capacityLineRule = shelfWxss.match(/\.capacity-line\s*\{([^}]*)\}/s);
assert.ok(
  capacityLineRule && /min-width:\s*0/.test(capacityLineRule[1]),
  'capacity text should be allowed to shrink',
);
assert.ok(
  capacityLineRule && /(?:^|;)\s*overflow:\s*hidden(?:;|$)/.test(capacityLineRule[1]),
  'capacity text should stay within the row',
);
assert.ok(
  capacityLineRule && /text-overflow:\s*ellipsis/.test(capacityLineRule[1]),
  'capacity text should ellipsize on narrow screens',
);
assert.ok(
  capacityLineRule && /white-space:\s*nowrap/.test(capacityLineRule[1]),
  'capacity text should stay on one line',
);
assert.ok(
  capacityLineRule && /margin-top:\s*0/.test(capacityLineRule[1]),
  'capacity text should cancel the global subtitle top margin',
);
const quotaActionRule = shelfWxss.match(/\.quota-action\s*\{([^}]*)\}/s);
assert.ok(
  quotaActionRule
    && /height:\s*56rpx/.test(quotaActionRule[1])
    && /width:\s*132rpx/.test(quotaActionRule[1])
    && /flex-shrink:\s*0/.test(quotaActionRule[1]),
  'quota action should match edit action size and remain clickable',
);
assert.ok(
  /\.title-row\s*\{[^}]*gap:\s*14rpx/s.test(shelfWxss)
    && /\.capacity-row\s*\{[^}]*gap:\s*14rpx/s.test(shelfWxss),
  'shelf header actions should sit close to the title while staying aligned',
);

const poolPointRow = extractViewByClass(poolWxml, 'pool-point-row');
const poolPointRowChildren = directChildOpeningTags(poolPointRow);
assert.deepStrictEqual(
  poolPointRowChildren.map((tag) => classNamesFromTag(tag).join(' ')),
  ['page-sub pool-point-line', 'earn-point-action'],
  'pool available points and earn action should share shelf-like one-row structure',
);
assert.ok(
  poolPointRow.includes('stats.availableCoin')
    && poolPointRowChildren[1].includes('bindtap="showEarnPointGuide"'),
  'pool point row should show available points and keep earn-points tap behavior',
);
assert.ok(
  /\.pool-title-row\s*\{[^}]*gap:\s*14rpx/s.test(poolWxss)
    && /\.pool-point-row\s*\{[^}]*gap:\s*14rpx/s.test(poolWxss),
  'pool guide and earn-points actions should sit close to the title while staying aligned',
);
assert.ok(
  /\.pool-title-row \.page-title\s*\{[^}]*flex:\s*0\s+1\s+216rpx/s.test(poolWxss)
    && /\.pool-point-line\s*\{[^}]*flex:\s*0\s+1\s+216rpx/s.test(poolWxss),
  'pool title and point text should share a compact left column',
);
assert.ok(
  /\.guide-entry\s*\{[^}]*width:\s*156rpx/s.test(poolWxss)
    && /\.guide-entry\s*\{[^}]*white-space:\s*nowrap/s.test(poolWxss)
    && /\.earn-point-action\s*\{[^}]*width:\s*132rpx/s.test(poolWxss),
  'pool guide entry should stay on one line and earn-points action should keep the aligned column',
);

const shelfPage = extractViewByClass(shelfWxml, 'shelf-page');
const shelfPageChildren = directChildOpeningTags(shelfPage);
const shelfOrder = [
  shelfPageChildren.findIndex((tag) => hasClass(tag, 'shelf-search')),
  shelfPageChildren.findIndex((tag) => hasClass(tag, 'primary-tabs')),
  shelfPageChildren.findIndex((tag) => hasClass(tag, 'secondary-scroll')),
];
assert.ok(shelfOrder.every((position) => position >= 0), 'shelf search and filters should all exist');
assert.deepStrictEqual(
  shelfOrder,
  [...shelfOrder].sort((left, right) => left - right),
  'shelf modules should be search, primary tabs, then secondary tabs',
);

const poolPage = extractViewByClass(poolWxml, 'page');
const poolPageChildren = directChildOpeningTags(poolPage);
const poolOrder = [
  poolPageChildren.findIndex((tag) => hasClass(tag, 'pool-search-box')),
  poolPageChildren.findIndex((tag) => hasClass(tag, 'primary-tabs')),
  poolPageChildren.findIndex((tag) => hasClass(tag, 'filter-scroll')),
  poolPageChildren.findIndex((tag) => /(?:^|\s)id="pool-list"/.test(tag)),
];
assert.ok(poolOrder.every((position) => position >= 0), 'pool top modules should all exist');
assert.deepStrictEqual(
  poolOrder,
  [...poolOrder].sort((left, right) => left - right),
  'pool modules should be search, primary tabs, secondary tabs, then list',
);
assert.ok(!poolWxml.includes('stat-row') && !poolWxml.includes('pool-user-metrics'), 'pool home should not render the top stats row');

const alignedStyleRules = [
  ['.primary-tabs', '.primary-tabs'],
  ['.primary-tab', '.primary-tab'],
  ['.primary-tab.active', '.primary-tab.active'],
  ['.secondary-scroll', '.filter-scroll'],
  ['.secondary-tabs', '.secondary-tabs'],
  ['.secondary-tab', '.secondary-tab'],
  ['.secondary-tab.active', '.secondary-tab.active'],
  ['.shelf-search', '.pool-search-box'],
  ['.shelf-search input', '.pool-search-box input'],
  ['.capacity-row', '.pool-point-row'],
  ['.capacity-line', '.pool-point-line'],
  ['.quota-action', '.earn-point-action'],
];
alignedStyleRules.forEach(([shelfSelector, poolSelector]) => {
  assert.deepStrictEqual(
    cssDeclarations(poolWxss, poolSelector),
    cssDeclarations(shelfWxss, shelfSelector),
    `${poolSelector} should match shelf ${shelfSelector} declarations`,
  );
});

const poolSearchBox = extractViewByClass(poolWxml, 'pool-search-box');
const poolSearchChildren = directChildOpeningTags(poolSearchBox);
assert.deepStrictEqual(
  poolSearchChildren.map((tag) => tag.match(/^<([a-z-]+)/)[1]),
  ['input'],
  'pool search box should contain one direct input child',
);
assert.ok(
  poolSearchChildren[0].includes('placeholder="搜索书名 · 作者 · ISBN"')
    && poolSearchChildren[0].includes('value="{{keyword}}"')
    && poolSearchChildren[0].includes('bindinput="onInput"')
    && poolSearchChildren[0].includes('bindconfirm="loadList"'),
  'pool search input should preserve placeholder, value and input/confirm behavior',
);

console.log('home layout alignment contract ok');
