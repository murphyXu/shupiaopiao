# 书架与漂流首页布局对齐 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将书架首页操作按钮按方案 A 对齐，并让漂流首页顶部模块顺序及 UI 与书架首页一致。

**Architecture:** 只调整两个页面的 WXML 结构和页面级 WXSS，不触碰数据、接口与事件处理。新增一个源码合同测试固定容器关系、模块顺序和关键视觉尺寸，再执行现有全量合同测试防止回归。

**Tech Stack:** 微信小程序 WXML/WXSS、Node.js `assert` 源码合同测试

---

## 文件结构

- Create: `scripts/test-home-layout-alignment-contract.js` — 固定书架标题/容量行结构、按钮等高约束、漂流模块顺序及关键样式。
- Modify: `scripts/test-shelf-interaction-contract.js` — 将旧容量合同从不得裁剪/省略同步为小屏 `hidden + ellipsis`。
- Modify: `scripts/test-pool-want-contract.js` — 将“搜索在筛选前”的旧顺序合同更新为统计、一级分类、二级分类、搜索、列表。
- Modify: `scripts/test-pool-navigation-and-anonymous-contract.js` — 移除跨页面复用 `shelf-search` 的旧断言，验证独立的 `pool-search-box`。
- Modify: `miniprogram/pages/shelf/index.wxml` — 将编辑、分享按钮并入标题行，将兑换按钮并入容量行。
- Modify: `miniprogram/pages/shelf/index.wxss` — 实现等高标题按钮、小屏省略和容量行对齐。
- Modify: `miniprogram/pages/pool/index.wxml` — 将搜索框移动到二级分类导航之后。
- Modify: `miniprogram/pages/pool/index.wxss` — 统一一级/二级导航间距，并补齐与书架一致的搜索框样式。

当前目录没有 `.git`，所以本计划不包含提交步骤。

### Task 1: 添加布局合同测试

**Files:**
- Create: `scripts/test-home-layout-alignment-contract.js`

- [ ] **Step 1: 写入失败测试**

```js
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
  ['page-title shelf-title', 'header-action edit-name', 'header-action share-btn'],
  'shelf name, edit and share actions should share the title row',
);
assert.deepStrictEqual(
  titleRowChildren.map((tag) => tag.match(/^<([a-z-]+)/)[1]),
  ['view', 'view', 'button'],
  'title row should use view, view and button elements',
);
assert.ok(
  titleRowChildren[1].includes('wx:if="{{!shareMode && loggedIn}}"')
    && titleRowChildren[1].includes('bindtap="startEditShelfName"'),
  'edit action should preserve its visibility and tap behavior',
);
assert.ok(
  titleRowChildren[2].includes('wx:if="{{loggedIn || shareMode}}"')
    && titleRowChildren[2].includes('open-type="share"'),
  'share action should preserve its visibility and native share behavior',
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
    && /flex-shrink:\s*0/.test(headerActionRule[1]),
  'edit and share actions should reuse one fixed-height style',
);
const shelfTitleRule = shelfWxss.match(/\.shelf-title\s*\{([^}]*)\}/s);
assert.ok(
  shelfTitleRule && /min-width:\s*0/.test(shelfTitleRule[1]),
  'shelf title should be allowed to shrink',
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
  quotaActionRule && /flex-shrink:\s*0/.test(quotaActionRule[1]),
  'quota action should remain fully clickable when capacity text shrinks',
);

const poolPage = extractViewByClass(poolWxml, 'page');
const poolPageChildren = directChildOpeningTags(poolPage);
const poolOrder = [
  poolPageChildren.findIndex((tag) => hasClass(tag, 'stat-row')),
  poolPageChildren.findIndex((tag) => hasClass(tag, 'primary-tabs')),
  poolPageChildren.findIndex((tag) => hasClass(tag, 'filter-scroll')),
  poolPageChildren.findIndex((tag) => hasClass(tag, 'pool-search-box')),
  poolPageChildren.findIndex((tag) => /(?:^|\s)id="pool-list"/.test(tag)),
];
assert.ok(poolOrder.every((position) => position >= 0), 'pool top modules should all exist');
assert.deepStrictEqual(
  poolOrder,
  [...poolOrder].sort((left, right) => left - right),
  'pool modules should be stats, primary tabs, secondary tabs, search, then list',
);

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
```

- [ ] **Step 2: 运行测试并确认按预期失败**

Run:

```bash
rtk node scripts/test-home-layout-alignment-contract.js
```

Expected: FAIL，首个错误为 `shelf name, edit and share actions should share the title row`。

### Task 2: 对齐书架标题行与容量行

**Files:**
- Modify: `miniprogram/pages/shelf/index.wxml:2-16`
- Modify: `miniprogram/pages/shelf/index.wxss:5-124`
- Test: `scripts/test-home-layout-alignment-contract.js`

- [ ] **Step 1: 调整书架头部结构**

将 `shelf-header` 内容替换为：

```xml
<view class="page-header shelf-header">
  <view wx:if="{{!editingShelfName}}" class="title-row">
    <view class="page-title shelf-title">{{shelfName}}</view>
    <view wx:if="{{!shareMode && loggedIn}}" class="header-action edit-name" bindtap="startEditShelfName">编辑</view>
    <button wx:if="{{loggedIn || shareMode}}" class="header-action share-btn" open-type="share">分享书架</button>
  </view>
  <view wx:else class="shelf-name-editor">
    <input value="{{shelfNameInput}}" maxlength="12" bindinput="onShelfNameInput" placeholder="最多12个字" />
    <view class="mini-save" bindtap="saveShelfName">保存</view>
  </view>
  <view class="capacity-row">
    <view class="page-sub capacity-line">{{shareMode ? '好友分享给你的藏书' : (loggedIn ? '剩余可收藏 ' + dashboard.remainingCapacity + ' 本 / 上限 ' + dashboard.shelfLimit + ' 本' : '登录后查看剩余容量')}}</view>
    <view wx:if="{{loggedIn && !shareMode}}" class="quota-action" bindtap="goRedeemCapacity">兑换额度</view>
  </view>
</view>
```

- [ ] **Step 2: 用统一样式固定按钮尺寸和小屏行为**

将原有 `.shelf-header`、`.shelf-header > view:first-child`、`.capacity-line`、`.title-row`、`.edit-name`、`.quota-action` 和 `.share-btn` 规则整理为：

```css
.shelf-header {
  min-width: 0;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  min-width: 0;
}

.shelf-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-sizing: border-box;
  height: 56rpx;
  padding: 0 18rpx;
  border-radius: 28rpx;
  font-size: 22rpx;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
}

.edit-name {
  color: #0C7A4B;
  background: #EAFBF2;
}

.share-btn {
  margin: 0;
  border: 1rpx solid #dcefe4;
  background: #fff;
  color: #0C7A4B;
}

.share-btn::after {
  border: none;
}

.capacity-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  min-width: 0;
  margin-top: 8rpx;
}

.capacity-line {
  min-width: 0;
  margin-top: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 22rpx;
}

.quota-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-sizing: border-box;
  height: 56rpx;
  padding: 0 18rpx;
  border-radius: 28rpx;
  background: #EAFBF2;
  color: #0C7A4B;
  font-size: 22rpx;
  font-weight: 700;
  white-space: nowrap;
}
```

保留 `.shelf-name-editor`、`.mini-save` 及其子元素规则不变。

同步更新 `scripts/test-shelf-interaction-contract.js`：将容量文案“不得裁剪/省略”的旧断言改为要求小屏使用 `overflow: hidden` 与 `text-overflow: ellipsis`。

- [ ] **Step 3: 运行合同测试，确认书架断言已通过且测试继续在漂流顺序处失败**

Run:

```bash
rtk node scripts/test-home-layout-alignment-contract.js
```

Expected: FAIL，错误为 `pool modules should be stats, primary tabs, secondary tabs, search, then list`。

### Task 3: 对齐漂流首页模块顺序和 UI

**Files:**
- Modify: `miniprogram/pages/pool/index.wxml:22-34`
- Modify: `miniprogram/pages/pool/index.wxss:6-59`
- Test: `scripts/test-home-layout-alignment-contract.js`
- Modify: `scripts/test-pool-want-contract.js`
- Modify: `scripts/test-pool-navigation-and-anonymous-contract.js`

- [ ] **Step 1: 将搜索框移动到二级分类导航之后**

顶部筛选区域使用以下顺序：

```xml
<view class="primary-tabs">
  <view wx:for="{{filterModes}}" wx:key="key" class="primary-tab {{activeFilterMode === item.key ? 'active' : ''}}" data-key="{{item.key}}" bindtap="filterMode">{{item.label}}</view>
</view>

<scroll-view scroll-x class="filter-scroll">
  <view class="secondary-tabs">
    <view wx:for="{{secondaryTabs}}" wx:key="key" class="secondary-tab {{activeFilterKey === item.key ? 'active' : ''}}" data-key="{{item.key}}" bindtap="filterSecondary">{{item.label}}</view>
  </view>
</scroll-view>

<view class="pool-search-box">
  <input placeholder="搜索书名 · 作者 · ISBN" value="{{keyword}}" bindinput="onInput" bindconfirm="loadList" />
</view>
```

同步更新 `scripts/test-pool-want-contract.js`：删除“搜索在筛选前”的旧断言，改为要求 `stat-row < primary-tabs < filter-scroll < pool-search-box < pool-list`。同步更新 `scripts/test-pool-navigation-and-anonymous-contract.js`：删除跨页面复用 `shelf-search` 的旧断言，改为验证独立的 `pool-search-box`。

- [ ] **Step 2: 对齐导航间距并补齐搜索框样式**

将 `.primary-tabs` 的 margin 改为 `margin-bottom: 18rpx;`，将 `.filter-scroll` 的 margin 改为 `margin-bottom: 26rpx;`，并添加：

```css
.pool-search-box {
  display: flex;
  align-items: center;
  gap: 14rpx;
  box-sizing: border-box;
  height: 76rpx;
  margin: 0 0 24rpx;
  padding: 0 20rpx;
  border: 1rpx solid #e6eee9;
  border-radius: 28rpx;
  background: #fff;
}

.pool-search-box input {
  flex: 1;
  min-width: 0;
  height: 76rpx;
  color: #15211B;
  font-size: 25rpx;
}
```

- [ ] **Step 3: 运行新增合同测试并确认通过**

Run:

```bash
rtk node scripts/test-home-layout-alignment-contract.js
rtk node scripts/test-pool-want-contract.js
```

Expected:

```text
home layout alignment contract ok
pool want contract ok
```

### Task 4: 回归与视觉验证

**Files:**
- Verify: `scripts/test-*.js`
- Verify: `miniprogram/pages/shelf/index.wxml`
- Verify: `miniprogram/pages/shelf/index.wxss`
- Verify: `miniprogram/pages/pool/index.wxml`
- Verify: `miniprogram/pages/pool/index.wxss`

- [ ] **Step 1: 运行书架与漂流相关测试**

Run:

```bash
rtk node scripts/test-shelf-ui-contract.js
rtk node scripts/test-shelf-quota-and-value-contract.js
rtk node scripts/test-pool-want-contract.js
rtk node scripts/test-pool-experience-contract.js
```

Expected: 四个脚本均输出各自的 `ok` 消息并以 0 退出；`test-pool-want-contract.js` 验证新顺序，不再要求搜索框位于筛选前。

- [ ] **Step 2: 运行全部合同测试**

Run:

```bash
rtk proxy sh -c 'for f in scripts/test-*.js; do node "$f" || exit 1; done'
```

Expected: 所有脚本以 0 退出，不出现 assertion failure 或未处理异常。

- [ ] **Step 3: 检查改动文件和无效空白**

Run:

```bash
rtk rg -n "title-row|header-action|capacity-row|quota-action" miniprogram/pages/shelf/index.wxml miniprogram/pages/shelf/index.wxss
rtk rg -n "stat-row|primary-tabs|filter-scroll|pool-search-box|pool-list" miniprogram/pages/pool/index.wxml miniprogram/pages/pool/index.wxss
```

Expected: 书架按钮只出现在目标行；漂流模块按设计顺序出现；不存在旧的独立分享按钮或统计后搜索框。

- [ ] **Step 4: 在浏览器视觉稿中复核**

打开已确认的方案 A 视觉稿，逐项核对：

- 书架名、编辑和分享按钮同一行且按钮等高。
- 容量文案与兑换入口同一行。
- 漂流页顺序为统计、一级分类、二级分类、搜索。
- 小屏下书架名和容量文案省略，操作按钮保持完整。
