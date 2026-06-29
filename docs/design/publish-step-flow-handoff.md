# 上漂赠书页「步骤化（方案 B）」实现交接文档

目标页面：`miniprogram/pages/drift/publish`（.js / .wxml / .wxss）

## 0. 目标

把当前的**单页长表单**重组为 **4 步引导**：

```
选书 → 品相 → 积分 → 确认
 1      2      3      4
```

硬约束：
- **不删除、不破坏任何现有功能**：批量上漂（batchMode）、套装风险确认（selectedRiskItems）、补录信息、寄出参考地、单本/批量提交流程，全部保留。
- 只是把现有卡片按步骤分组用 `wx:if="{{step === N}}"` 包起来，新增步骤条 + 底部导航。
- 配色沿用现状：主绿 `#2FBE77`、深绿 `#0C7A4B`、薄荷 `#EAFBF2`、灰绿文字 `#7b8a82`、警示红 `#ff4d4f`。

---

## 1. publish.js（✅ 已完成，无需再改）

以下改动**已经写入** `publish.js`，仅供其他 agent 理解，不要重复添加：

### 1.1 新增常量（在 `Page({` 之前）

```js
const PUBLISH_STEPS = [
  { key: 1, label: '选书' },
  { key: 2, label: '品相' },
  { key: 3, label: '积分' },
  { key: 4, label: '确认' },
];
```

### 1.2 data 新增字段

```js
data: {
  mode: 'shelf',
  step: 1,                    // 当前步骤
  publishSteps: PUBLISH_STEPS,
  // ...其余原有字段保持不变
}
```

### 1.3 新增方法（已加在 `submit()` 之前）

```js
// 校验当前步骤是否可进入下一步
canLeaveStep(step) {
  if (step === 1) {
    if (!this.data.selectedCount) {
      wx.showToast({ title: '请选择要赠出的书', icon: 'none' });
      return false;
    }
    if (!this.validateSetConfirmations()) return false;
  }
  if (step === 3) {
    if (!this.validateCoinValue()) return false;
  }
  return true;
},

goNextStep() {
  const { step } = this.data;
  if (!this.canLeaveStep(step)) return;
  if (step >= PUBLISH_STEPS.length) return;
  this.setData({ step: step + 1 });
  wx.pageScrollTo({ scrollTop: 0, duration: 0 });
},

goPrevStep() {
  const { step } = this.data;
  if (step <= 1) return;
  this.setData({ step: step - 1 });
  wx.pageScrollTo({ scrollTop: 0, duration: 0 });
},

gotoStep(e) {
  const target = Number(e.currentTarget.dataset.step) || 1;
  const { step } = this.data;
  if (target === step) return;
  if (target < step) {                  // 回退：允许直接跳
    this.setData({ step: target });
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
    return;
  }
  for (let s = step; s < target; s += 1) {   // 前进：逐步校验
    if (!this.canLeaveStep(s)) {
      if (s !== step) this.setData({ step: s });
      return;
    }
  }
  this.setData({ step: target });
  wx.pageScrollTo({ scrollTop: 0, duration: 0 });
},
```

### 1.4 现有方法/字段（必须保留，wxml 会继续绑定）

| 方法 | 用途 | 所属步骤 |
|---|---|---|
| `toggleBookSelection` | 选/取消选书 | 1 |
| `clearSelectedBook` | 重新选择 | 1 |
| `continueAddBooks` | 再加一本 | 1 |
| `goAddBook` | 书架无书时去添加 | 1 |
| `goEditBookMeta` | 补录信息 | 1 |
| `selectSetCompleteness` / `onSetDescription` | 套装赠出内容确认 | 1 |
| `selectCondition` | 选品相档位 | 2 |
| `toggleConditionIssue` | 选品相描述 | 2 |
| `decreaseCoinValue` / `increaseCoinValue` | 积分加减 | 3 |
| `toggleAnonymous` | 匿名/昵称 | 4 |
| `onShipRegionChange` | 寄出参考地 picker | 4 |
| `submit` | 最终提交（内部分 submitSingle/submitBatch） | 4 |

关键 data 字段：`selectedCount` `batchMode` `book` `shelfBooks` `selectedShelfIds` `selectedRiskItems` `setCompletenessOptions` `conditions` `condition` `conditionIssueOptions` `hasListPrice` `listPrice` `systemCoinValue` `coinValue` `coinHint` `missingPriceSelectedCount` `isAnonymous` `shipRegionLabel` `needsShipRegionPicker` `submitting` `loadingShelfBooks`。

---

## 2. publish.wxml（⬜ 待做 —— 核心工作）

把现有单页内容按步骤拆分。**整体结构如下**（用现有卡片内容填充，不要改卡片内部）：

```html
<view class="page publish-stepped">
  <!-- 顶部步骤条 -->
  <view class="stepper">
    <block wx:for="{{publishSteps}}" wx:key="key">
      <view
        class="stp {{step === item.key ? 'on' : ''}} {{step > item.key ? 'done' : ''}}"
        data-step="{{item.key}}"
        bindtap="gotoStep">
        <view class="stp-dot">{{step > item.key ? '✓' : item.key}}</view>
        <view class="stp-label">{{item.label}}</view>
      </view>
      <view wx:if="{{item.key < 4}}" class="stp-line {{step > item.key ? 'done' : ''}}"></view>
    </block>
  </view>

  <!-- ===== 步骤1：选书 ===== -->
  <view wx:if="{{step === 1}}" class="step-body">
    <!-- 原「单本摘要卡」(selectedCount>0 && !batchMode && book) -->
    <!-- 原「已选 N 本」批量卡 (batchMode) -->
    <!-- 原「选择要赠出的书（可多选）」picker 卡 -->
    <!-- 原「赠出内容确认」套装风险卡 (selectedRiskItems.length) -->
  </view>

  <!-- ===== 步骤2：品相 ===== -->
  <view wx:if="{{step === 2}}" class="step-body">
    <!-- 原「品相档位 + 品相描述」卡 -->
  </view>

  <!-- ===== 步骤3：积分 ===== -->
  <view wx:if="{{step === 3}}" class="step-body">
    <!-- 原「公益积分」卡（含 batch 警告 / 单本 stepper / 定价缺失提示） -->
  </view>

  <!-- ===== 步骤4：确认 ===== -->
  <view wx:if="{{step === 4}}" class="step-body">
    <!-- 原「漂流身份 + 寄出参考地」卡 -->
    <!-- 新增：本次上漂摘要卡（见 2.2） -->
  </view>

  <!-- 底部固定导航 -->
  <view class="step-nav">
    <view wx:if="{{step > 1}}" class="step-nav-btn ghost" bindtap="goPrevStep">上一步</view>
    <view wx:if="{{step < 4}}" class="step-nav-btn primary" bindtap="goNextStep">下一步</view>
    <button
      wx:if="{{step === 4}}"
      class="step-nav-btn primary submit-btn"
      loading="{{submitting}}"
      disabled="{{submitting || selectedCount === 0}}"
      bindtap="submit">{{batchMode ? ('提交 ' + selectedCount + ' 本上漂') : '提交上漂'}}</button>
  </view>
</view>
```

### 2.1 各步骤要搬入的现有卡片（从当前 publish.wxml 原样复制，保持内部不变）

- **步骤1 选书** ← 当前 wxml 第 2~77 行的全部内容：
  - 单本摘要卡 `wx:if="{{selectedCount > 0 && !batchMode && book}}"`
  - 批量已选卡 `wx:if="{{batchMode}}"`
  - 选书 picker 卡（含 loading / 列表 / empty-box / selection-note）
  - 套装赠出内容确认卡 `wx:if="{{selectedRiskItems.length}}"`
- **步骤2 品相** ← 当前第 79~88 行「品相档位」卡（去掉 `disabled-card`，因为此步必然已选书）
- **步骤3 积分** ← 当前第 90~111 行「公益积分」卡（保留 batch 警告 / 单本 stepper / 定价缺失 price-warning 全部分支）
- **步骤4 确认** ← 当前第 113~131 行「漂流身份 + 寄出参考地」卡 + 下方新增摘要卡

### 2.2 步骤4 新增「本次上漂摘要」卡（新写）

```html
<view class="card">
  <view class="label">本次上漂摘要</view>
  <view wx:if="{{!batchMode}}">
    <view class="summary-row"><text class="sk">书籍</text><text class="sv">{{book.title}}</text></view>
    <view class="summary-row"><text class="sk">品相</text><text class="sv">{{condition}}{{conditionIssues.length ? '（已标注）' : ''}}</text></view>
    <view class="summary-row"><text class="sk">设定公益积分</text><text class="sv hl">{{coinValue}}</text></view>
  </view>
  <view wx:else>
    <view class="summary-row"><text class="sk">赠出数量</text><text class="sv">{{selectedCount}} 本</text></view>
    <view class="summary-row"><text class="sk">公益积分</text><text class="sv">按各书系统建议</text></view>
  </view>
  <view class="summary-row"><text class="sk">漂流身份</text><text class="sv">{{isAnonymous ? '匿名漂流' : '昵称漂流'}}</text></view>
  <view wx:if="{{shipRegionLabel}}" class="summary-row"><text class="sk">寄出参考地</text><text class="sv">{{shipRegionLabel}}</text></view>
</view>
```

注：摘要里「品相」直接显示 `condition` 的 key 不够友好，建议在 js 里加一个 `conditionLabel`（用 `CONDITIONS.find(c=>c.key===condition).label`）暴露给 data，或在 wxml 用 wxs 转换；非阻塞，可后做。

### 2.3 移除原来的底部按钮

当前第 133 行的 `<button class="btn-primary publish-submit" ...>` 由步骤4 的导航区 submit 按钮替代，**删除原按钮**。

---

## 3. publish.wxss（⬜ 待做 —— 新增样式）

在 `publish.wxss` 末尾追加：

```css
.publish-stepped {
  padding-bottom: 160rpx;   /* 给底部固定导航留位 */
}

/* 步骤条 */
.stepper {
  display: flex;
  align-items: center;
  padding: 8rpx 8rpx 24rpx;
}
.stp {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
  flex-shrink: 0;
}
.stp-dot {
  width: 52rpx;
  height: 52rpx;
  border-radius: 50%;
  background: #e3ede7;
  color: #8a988f;
  font-size: 24rpx;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
}
.stp.on .stp-dot { background: #2FBE77; color: #fff; }
.stp.done .stp-dot { background: #EAFBF2; color: #0C7A4B; }
.stp-label { font-size: 22rpx; color: #7b8a82; }
.stp.on .stp-label { color: #0C7A4B; font-weight: 700; }
.stp-line {
  flex: 1;
  height: 3rpx;
  background: #e3ede7;
  margin: 0 6rpx;
  position: relative;
  top: -16rpx;     /* 对齐圆点中心 */
}
.stp-line.done { background: #2FBE77; }

.step-body { min-height: 200rpx; }

/* 摘要卡（与申请接漂页 claim-summary 同款，可直接复用类名/样式） */
.summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24rpx;
  padding: 14rpx 0;
  border-bottom: 1rpx dashed #eef2ef;
  font-size: 26rpx;
}
.summary-row:last-child { border-bottom: none; }
.summary-row .sk { color: #7b8a82; flex-shrink: 0; }
.summary-row .sv { color: #15211B; font-weight: 700; text-align: right; }
.summary-row .sv.hl { color: #0C7A4B; }

/* 底部固定导航 */
.step-nav {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  gap: 20rpx;
  padding: 16rpx 24rpx calc(16rpx + env(safe-area-inset-bottom));
  background: #fff;
  border-top: 1rpx solid #eef2ef;
  z-index: 50;
}
.step-nav-btn {
  height: 88rpx;
  border-radius: 44rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 30rpx;
  font-weight: 800;
  margin: 0;
}
.step-nav-btn::after { border: 0; }
.step-nav-btn.ghost {
  flex: 1;
  background: #f0f5f1;
  color: #46564e;
}
.step-nav-btn.primary {
  flex: 2;
  background: #2FBE77;
  color: #fff;
}
.step-nav-btn.primary[disabled] {
  opacity: 0.72;
  color: #fff;
  background: #8fd9b5;
}
```

---

## 4. 步骤流转与校验逻辑（务必实现一致）

| 操作 | 校验（在 `canLeaveStep` 中已实现） |
|---|---|
| 步骤1 → 2（下一步） | `selectedCount > 0`；套装风险项必须确认（`validateSetConfirmations`） |
| 步骤2 → 3 | 无强制校验（品相有默认值） |
| 步骤3 → 4 | 定价缺失前置阻断（`validateCoinValue`，已改为弹窗提示不静默取消） |
| 步骤4 提交 | `submit()` 内再次跑 `validateCoinValue` + `validateSetConfirmations` 兜底 |
| 点步骤条圆点 | `gotoStep`：回退随意；前进需逐步过校验 |

注意：
- 单本设 0 积分时 `submit()` 内的 `confirmZeroCoinValue` 二次确认弹窗逻辑保留不变。
- 批量模式（batchMode）下步骤3 不显示 stepper，显示「按各书系统建议积分」提示，与现状一致。
- 从书架卡片带 `bookId` 进入时（`onLoad` 预选），默认仍停在步骤1，用户确认所选书后再下一步。

---

## 5. 验收清单（其他 agent 自测）

- [ ] 单本流程：选书→品相→积分(可加减)→确认(摘要正确)→提交，跳转 check-result。
- [ ] 批量流程：多选→步骤3 显示批量提示→提交，跳转 batch-result。
- [ ] 套装书：步骤1 未确认赠出内容时点「下一步」被拦截并提示。
- [ ] 定价缺失：步骤3 点「下一步」弹窗阻断（不静默取消勾选）。
- [ ] 上一步/下一步/点步骤条 圆点 跳转正常，前进受校验、回退自由。
- [ ] 底部导航固定、安全区适配；步骤4 提交按钮 loading/disabled 正常。
- [ ] 寄出地 picker、匿名切换、补录信息跳转 均正常。

---

## 6. 当前状态小结

- ✅ `publish.js`：步骤状态、`PUBLISH_STEPS`、`canLeaveStep/goNextStep/goPrevStep/gotoStep` 已写入。
- ⬜ `publish.wxml`：仍是单页结构，待按第 2 节重组为 4 步 + 步骤条 + 底部导航。
- ⬜ `publish.wxss`：待按第 3 节追加步骤条/导航/摘要样式。

其他 agent 只需完成 wxml 重组 + wxss 追加即可，js 无需改动。
