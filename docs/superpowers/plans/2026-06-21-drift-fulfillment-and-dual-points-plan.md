# 漂流履约闭环与双积分体系 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复赠书方无法录入物流的问题，并实现首位锁定、公益积分占用、双方取消、72 小时发货、10 天自动完成、申诉、书架归属和双方互评的完整闭环。

**Architecture:** 保留现有统一 `api` 云函数和 `drift.js` 业务入口，新增纯规则模块与账务模块隔离状态判断和双积分变更。前端新增统一漂流详情、独立发货、申诉和管理员处理页面；定时触发仍挂载在 `api` 云函数，直接调用幂等维护函数，避免重复部署业务逻辑。

**Tech Stack:** 微信小程序 WXML/WXSS/JavaScript、微信云开发、`wx-server-sdk`、云数据库事务、Node.js `assert` 合同测试

---

## 范围与文件结构

### 新增文件

- `cloudfunctions/api/lib/driftPolicy.js`：阶段参数、价值计算、可用公益积分、截止时间和状态常量。
- `cloudfunctions/api/lib/driftAccounting.js`：事务内公益积分、信用积分和事件明细写入。
- `cloudfunctions/api/lib/driftMigration.js`：体验版旧账务的逐单幂等迁移和版本守卫。
- `miniprogram/pages/drift/order-detail.{js,wxml,wxss,json}`：统一漂流详情和角色操作。
- `miniprogram/pages/drift/ship.{js,wxml,wxss,json}`：独立物流录入页。
- `miniprogram/pages/drift/dispute.{js,wxml,wxss,json}`：用户申诉页。
- `miniprogram/pages/mine/disputes.{js,wxml,wxss,json}`：管理员申诉列表和处理入口。
- `scripts/test-drift-policy.js`：纯规则行为测试。
- `scripts/test-drift-migration.js`：体验版旧账务迁移的状态和幂等性测试。
- `scripts/test-drift-fulfillment-contract.js`：状态机、接口、页面、权限和合规合同测试。

### 修改文件

- `cloudfunctions/api/lib/db.js`：注册积分、邀请积分、`coinFrozen`、奖励计数和管理员标识。
- `cloudfunctions/api/lib/pricing.js`：确认后的品相系数和系统定价公式。
- `cloudfunctions/api/lib/collections.js`
- `cloudfunctions/init-db/collections.js`
- `cloudfunctions/seed/collections.js`
- `cloudfunctions/api/handlers/drift.js`：发布、锁定、取消、发货、完成、申诉、评价和维护任务。
- `cloudfunctions/api/handlers/wallet.js`：返回总额、占用中和可用公益积分及双 delta 明细。
- `cloudfunctions/api/handlers/credit.js`：保持信用积分和变动原因可见。
- `cloudfunctions/api/handlers/shelf.js`：可用公益积分校验和接漂完成后一键加入书架。
- `cloudfunctions/api/index.js`：新 action 和定时触发入口。
- `cloudfunctions/api/config.json`：每小时维护触发器。
- `miniprogram/app.json`：注册新增页面。
- `miniprogram/utils/api.js`：新增履约接口封装。
- `miniprogram/utils/util.js`：统一状态名称和信用变化文案。
- `miniprogram/pages/drift/publish.{js,wxml}`：传 `shelfBookId`、系统计算积分、移除用户填写积分。
- `miniprogram/pages/drift/claim.{js,wxml}`：展示可用/占用公益积分和在途限制。
- `miniprogram/pages/drift/given.{js,wxml}`：移除嵌套 ActionSheet，统一进入漂流详情。
- `miniprogram/pages/drift/received.{js,wxml}`：统一进入漂流详情。
- `miniprogram/pages/drift/review.js`：提交后幂等反馈。
- `miniprogram/pages/mine/wallet.{js,wxml}`：展示可用、占用中和流水。
- `miniprogram/pages/mine/index.{js,wxml}`：保持双积分展示和管理员入口控制。
- `miniprogram/pages/mine/logistics.{js,wxml}`：移除伪物流轨迹，只展示已录入承运商和单号。
- `scripts/test-drift-coin-contract.js`
- `scripts/test-pool-navigation-and-anonymous-contract.js`
- `scripts/test-compliance-p0-contract.js`
- `项目进度交接文档.md`

当前目录没有 `.git`，所以本计划不包含提交、分支或 PR 步骤。

## Task 1：建立规则模块和 RED 基线

**Files:**
- Create: `cloudfunctions/api/lib/driftPolicy.js`
- Create: `scripts/test-drift-policy.js`
- Modify: `cloudfunctions/api/lib/pricing.js`

- [ ] **Step 1: 编写纯规则失败测试**

创建 `scripts/test-drift-policy.js`：

```js
const assert = require('assert');
const {
  policyForStage,
  calculateCoinValue,
  availableCoin,
  addHours,
  addDays,
} = require('../cloudfunctions/api/lib/driftPolicy');

assert.deepStrictEqual(policyForStage('cold'), {
  signupBonus: 0,
  firstGiveBonus: 10,
  publishReward: 2,
  publishRewardCap: 10,
  inviteReward: 3,
  inflightLimit: 3,
});
assert.strictEqual(calculateCoinValue(15, 'new'), 5);
assert.strictEqual(calculateCoinValue(15, 'like_new'), 3);
assert.strictEqual(calculateCoinValue(15, 'good'), 3);
assert.strictEqual(calculateCoinValue(15, 'seven_new'), 2);
assert.strictEqual(availableCoin({ coinBalance: 12, coinFrozen: 5 }), 7);
assert.strictEqual(addHours('2026-06-21T00:00:00.000Z', 72), '2026-06-24T00:00:00.000Z');
assert.strictEqual(addDays('2026-06-21T00:00:00.000Z', 10), '2026-07-01T00:00:00.000Z');
console.log('drift policy ok');
```

- [ ] **Step 2: 运行测试并确认 RED**

Run:

```bash
rtk node scripts/test-drift-policy.js
```

Expected: FAIL with `Cannot find module '../cloudfunctions/api/lib/driftPolicy'`。

- [ ] **Step 3: 实现纯规则模块**

创建 `cloudfunctions/api/lib/driftPolicy.js`：

```js
const STAGES = {
  cold: { signupBonus: 0, firstGiveBonus: 10, publishReward: 2, publishRewardCap: 10, inviteReward: 3, inflightLimit: 3 },
  cycle: { signupBonus: 0, firstGiveBonus: 5, publishReward: 0, publishRewardCap: 0, inviteReward: 3, inflightLimit: 3 },
  mature: { signupBonus: 0, firstGiveBonus: 0, publishReward: 0, publishRewardCap: 0, inviteReward: 3, inflightLimit: 3 },
};

const CONDITION_FACTORS = {
  new: 1.5,
  like_new: 1,
  good: 0.9,
  seven_new: 0.8,
  below_seven: 0.8,
  fair: 0.8,
};

function policyForStage(stage = 'cold') {
  return { ...(STAGES[stage] || STAGES.cold) };
}

function calculateCoinValue(listPrice, condition) {
  const price = Math.max(Number(listPrice) || 0, 0);
  return Math.max(Math.round(price * (CONDITION_FACTORS[condition] || 0.8) * 0.2), 0);
}

function availableCoin(user = {}) {
  return Math.max((Number(user.coinBalance) || 0) - (Number(user.coinFrozen) || 0), 0);
}

function addHours(iso, hours) {
  return new Date(new Date(iso).getTime() + hours * 3600000).toISOString();
}

function addDays(iso, days) {
  return addHours(iso, days * 24);
}

module.exports = { STAGES, CONDITION_FACTORS, policyForStage, calculateCoinValue, availableCoin, addHours, addDays };
```

业务入口统一通过 `policyForStage(process.env.DRIFT_STAGE || 'cold')` 读取阶段参数。将 `pricing.js` 的品相系数改为同一组数值，并由 `calculateCoinValue` 生成上漂积分，不再使用 `medianPrice × factor` 作为接漂积分。

- [ ] **Step 4: 验证 GREEN**

Run:

```bash
rtk node scripts/test-drift-policy.js
```

Expected: `drift policy ok`。

## Task 2：用户双积分字段、钱包和集合

**Files:**
- Modify: `cloudfunctions/api/lib/db.js`
- Modify: `cloudfunctions/api/handlers/wallet.js`
- Modify: `cloudfunctions/api/handlers/shelf.js`
- Modify: `cloudfunctions/api/lib/collections.js`
- Modify: `cloudfunctions/init-db/collections.js`
- Modify: `cloudfunctions/seed/collections.js`
- Modify: `miniprogram/pages/mine/wallet.js`
- Modify: `miniprogram/pages/mine/wallet.wxml`
- Test: `scripts/test-drift-fulfillment-contract.js`

- [ ] **Step 1: 编写双积分字段和集合合同**

创建合同文件并写入：

```js
const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

function readOptional(file) {
  const fullPath = path.join(__dirname, '..', file);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '';
}

const dbLib = read('cloudfunctions/api/lib/db.js');
const wallet = read('cloudfunctions/api/handlers/wallet.js');
const collections = [
  read('cloudfunctions/api/lib/collections.js'),
  read('cloudfunctions/init-db/collections.js'),
  read('cloudfunctions/seed/collections.js'),
];
const walletWxml = read('miniprogram/pages/mine/wallet.wxml');
const shelfHandler = read('cloudfunctions/api/handlers/shelf.js');
const driftHandler = read('cloudfunctions/api/handlers/drift.js');
const apiRoutes = read('cloudfunctions/api/index.js');

assert.ok(dbLib.includes('coinFrozen: 0') && dbLib.includes('SIGNUP_BONUS = 0'), 'users should start with zero balance and zero frozen points');
assert.ok(dbLib.includes('INVITE_REWARD = 3'), 'invite reward should match the confirmed policy');
assert.ok(wallet.includes('available') && wallet.includes('frozen'), 'wallet should expose available and frozen points');
assert.ok(walletWxml.includes('可用公益积分') && walletWxml.includes('占用中'), 'wallet page should display available and occupied points');
assert.ok(shelfHandler.includes('availableCoin(user)'), 'capacity redemption should not spend occupied points');
collections.forEach((source) => {
  assert.ok(source.includes("'drift_disputes'") && source.includes("'drift_order_events'"), 'all collection manifests should include fulfillment collections');
});
```

- [ ] **Step 2: 运行合同并确认失败**

Run: `rtk node scripts/test-drift-fulfillment-contract.js`  
Expected: FAIL at `users should start with zero balance and zero frozen points`。

- [ ] **Step 3: 实现用户和钱包字段**

在新用户文档中加入：

```js
coinBalance: 0,
coinFrozen: 0,
firstGiveRewarded: false,
publishRewardCount: 0,
invalidDisputeCount: 0,
verifiedViolationCount: 0,
coinPenaltyPending: 0,
activeClaimCount: 0,
```

`formatUser` 增加 `coinFrozen` 和：

```js
availableCoin: Math.max((Number(user.coinBalance) || 0) - (Number(user.coinFrozen) || 0), 0),
```

钱包接口返回：

```js
{
  balance: Number(user.coinBalance) || 0,
  frozen: Number(user.coinFrozen) || 0,
  available: Math.max((Number(user.coinBalance) || 0) - (Number(user.coinFrozen) || 0), 0),
}
```

流水映射增加 `balanceDelta`、`frozenDelta`，兼容旧 `amount`。

书架容量兑换使用 `availableCoin(user)` 判断和扣减，不能消费已被接漂占用的公益积分。注册积分为 0 时不创建无意义的 `signup` 流水。

- [ ] **Step 4: 同步集合和钱包 UI**

三份集合清单都加入：

```js
'drift_disputes',
'drift_order_events',
```

钱包页顶部展示可用、占用中和总记录值，列表分别显示余额变动与占用变动，不使用充值、提现或支付文案。

- [ ] **Step 5: 验证**

Run:

```bash
rtk node scripts/test-drift-fulfillment-contract.js
rtk node scripts/test-mine-profile公益-contract.js
```

Expected: 当前合同中的双积分字段、集合和钱包断言全部通过。

## Task 2A：体验版旧账务幂等迁移

**Files:**
- Create: `cloudfunctions/api/lib/driftMigration.js`
- Create: `scripts/test-drift-migration.js`
- Modify: `cloudfunctions/api/lib/db.js`
- Modify: `cloudfunctions/api/handlers/drift.js`
- Modify: `cloudfunctions/api/index.js`
- Test: `scripts/test-drift-fulfillment-contract.js`

- [ ] **Step 1: 添加旧账务迁移合同**

在合同文件中追加：

```js
const migration = readOptional('cloudfunctions/api/lib/driftMigration.js');

assert.ok(migration.includes('ensureAccountingV2') && migration.includes('accountingVersion'), 'legacy active orders should pass through one accounting guard');
assert.ok(migration.includes('legacy_accounting_migration') && migration.includes('activeCounted'), 'legacy migration should be idempotent and repair inflight count');
assert.ok(driftHandler.includes('migrateLegacyAccounting') && apiRoutes.includes("'system.migrateDriftAccounting'"), 'backend should expose an admin-only batch migration');
```

- [ ] **Step 2: 运行并确认 RED**

Run: `rtk node scripts/test-drift-fulfillment-contract.js`  
Expected: FAIL at `legacy active orders should pass through one accounting guard`。

- [ ] **Step 3: 实现逐单版本守卫**

`ensureAccountingV2(transaction, order, drift)` 仅处理缺少版本且状态为 `PENDING_SHIP`、`SHIPPED` 或 `DISPUTED` 的体验版记录：

1. 使用确定性事件 ID `${order._id}-legacy_accounting_migration-${order.receiverId}` 查询是否已迁移。
2. 未迁移时将旧扣除的 `coinValue` 加回 `coinBalance`，同时等额增加 `coinFrozen`。
3. 若 `activeCounted !== true`，将用户 `activeClaimCount` 加 1。
4. 将履约记录更新为 `accountingVersion: 2`、`activeCounted: true`，并写迁移事件。
5. 已为版本 2 时直接返回；未知非空版本、终态旧记录或金额异常时抛出 `ACCOUNTING_VERSION_UNSUPPORTED`，不得继续结算。

所有取消、发货、结算和申诉处理事务必须先调用此守卫。记录结束时仅在 `activeCounted === true` 时减少在途数，并将其置为 `false`。

- [ ] **Step 4: 实现受控批量迁移**

`db.js` 在此任务先通过 `ADMIN_OPENIDS` 环境变量计算服务端 `isAdmin`。`migrateLegacyAccounting` 每批最多扫描 50 条缺少 `accountingVersion` 的活动记录，逐条调用版本守卫，返回 `processed / migrated / failed / nextCursor`。仅允许管理员从云函数控制台调用 `system.migrateDriftAccounting`；普通小程序用户得到 403。部署时循环调用至 `nextCursor` 为空，定时维护函数仍保留逐单守卫作为兜底。

- [ ] **Step 5: 验证迁移幂等性**

在 `scripts/test-drift-migration.js` 用内存事务桩构造一笔已直接扣余额的旧 `SHIPPED` 记录，连续调用两次 `ensureAccountingV2`。断言第二次不再返还余额、不再增加占用、不再增加 `activeClaimCount`，且只有一条 `legacy_accounting_migration` 事件；再覆盖未知版本和终态旧记录拒绝处理。

Run:

```bash
rtk node scripts/test-drift-migration.js
rtk node scripts/test-drift-fulfillment-contract.js
```

Expected: 逐单守卫、管理员权限、批量迁移和重复执行合同全部通过。

## Task 3：系统定价、具体书架记录和冷启动奖励

**Files:**
- Modify: `miniprogram/pages/drift/publish.js`
- Modify: `miniprogram/pages/drift/publish.wxml`
- Modify: `cloudfunctions/api/handlers/drift.js`
- Modify: `cloudfunctions/api/lib/db.js`
- Test: `scripts/test-drift-publish-form-contract.js`
- Test: `scripts/test-drift-fulfillment-contract.js`

- [ ] **Step 1: 将发布合同改为系统定价**

新增断言：

```js
const publishJs = read('miniprogram/pages/drift/publish.js');
const publishWxml = read('miniprogram/pages/drift/publish.wxml');
assert.ok(publishJs.includes('shelfBookId') && driftHandler.includes('shelfBookId'), 'publish should bind the exact shelf record');
assert.ok(!publishWxml.includes('bindinput="onCoinValueInput"'), 'users should not edit the system coin value');
assert.ok(driftHandler.includes('calculateCoinValue'), 'backend should calculate coin value from list price and condition');
assert.ok(driftHandler.includes('publishRewardGranted'), 'publish reward should be idempotent');
```

- [ ] **Step 2: 运行并确认 RED**

Run: `rtk node scripts/test-drift-fulfillment-contract.js`  
Expected: FAIL at `publish should bind the exact shelf record`。

- [ ] **Step 3: 修改发布数据流**

前端选择书架记录时保存：

```js
setSelectedBook(item) {
  this.setData({
    shelfBookId: item.id,
    bookId: item.bookId,
    book: item.book,
    coinValue: calculateDisplayValue(item.book.listPrice, this.data.condition),
  });
}
```

提交只发送 `shelfBookId`、`condition`、品相问题、图片、匿名设置和备注，不发送用户可修改的 `coinValue`。

后端读取 `shelf_books` 文档，确认所有权后保存 `shelfBookId`，调用 `calculateCoinValue`。审核通过且 `publishRewardGranted !== true` 时，按阶段和终身上限发放一次 `publish_reward`。

- [ ] **Step 4: 验证**

Run:

```bash
rtk node scripts/test-drift-publish-form-contract.js
rtk node scripts/test-drift-fulfillment-contract.js
rtk node scripts/test-pool-compliance-contract.js
```

Expected: 发布定价、具体书架记录和审核状态合同通过。

## Task 4：首位锁定、公益积分占用和地址快照

**Files:**
- Create: `cloudfunctions/api/lib/driftAccounting.js`
- Modify: `cloudfunctions/api/handlers/drift.js`
- Modify: `miniprogram/pages/drift/claim.js`
- Modify: `miniprogram/pages/drift/claim.wxml`
- Modify: `miniprogram/utils/api.js`
- Test: `scripts/test-drift-policy.js`
- Test: `scripts/test-drift-fulfillment-contract.js`

- [ ] **Step 1: 添加接漂合同**

```js
const accounting = readOptional('cloudfunctions/api/lib/driftAccounting.js');
const claimWxml = read('miniprogram/pages/drift/claim.wxml');

assert.ok(driftHandler.includes("status !== 'IN_POOL'") && driftHandler.includes('runTransaction'), 'claim should recheck IN_POOL inside a transaction');
assert.ok(driftHandler.includes('coinFrozen') && driftHandler.includes('shipDeadlineAt'), 'claim should occupy points and create a 72-hour deadline');
assert.ok(driftHandler.includes('addressSnapshot') && driftHandler.includes('activeClaimCount'), 'claim should snapshot address and enforce inflight limit');
assert.ok(accounting.includes('writeCoinEvent') && accounting.includes('writeCreditEvent'), 'accounting writes should be centralized');
assert.ok(claimWxml.includes('可用公益积分') && claimWxml.includes('占用'), 'claim page should explain point occupation');
```

- [ ] **Step 2: 运行并确认 RED**

Run: `rtk node scripts/test-drift-fulfillment-contract.js`  
Expected: FAIL at `claim should recheck IN_POOL inside a transaction`。

- [ ] **Step 3: 实现账务写入辅助函数**

`driftAccounting.js` 导出：

```js
async function writeCoinEvent(transaction, data) {
  const id = `${data.refId}-${data.type}-${data.userId}`;
  await transaction.collection('coin_transactions').doc(id).set({ data: { ...data, _id: id } });
}

async function writeCreditEvent(transaction, data) {
  const id = `${data.refId}-${data.reasonCode}-${data.userId}`;
  await transaction.collection('credit_logs').doc(id).set({ data: { ...data, _id: id } });
}

async function writeOrderEvent(transaction, data) {
  const id = `${data.orderId}-${data.type}`;
  await transaction.collection('drift_order_events').doc(id).set({ data: { ...data, _id: id } });
}

module.exports = { writeCoinEvent, writeCreditEvent, writeOrderEvent };
```

- [ ] **Step 4: 重写 claim 事务**

事务内重新读取用户、漂流和地址，通过用户文档 `activeClaimCount` 做并发安全的在途限制；达到 3 笔返回 `INFLIGHT_LIMIT`。成功时将 `activeClaimCount` 加 1：

```js
await transaction.collection('users').doc(userId).update({ data: { coinFrozen: _.inc(drift.coinValue), activeClaimCount: _.inc(1) } });
await transaction.collection('drifts').doc(driftId).update({ data: { status: 'CLAIMED', activeOrderId: orderId } });
await transaction.collection('drift_orders').doc(orderId).set({
  data: {
    driftId,
    giverId: drift.userId,
    receiverId: userId,
    shelfBookId: drift.shelfBookId,
    addressSnapshot: { name: address.name, phone: address.phone, region: address.region, detail: address.detail },
    coinValue: drift.coinValue,
    status: 'PENDING_SHIP',
    claimedAt: now,
    shipDeadlineAt: addHours(now, 72),
    expressCompany: '',
    trackingNo: '',
    accountingVersion: 2,
    activeCounted: true,
  },
});
```

写入 `claim_freeze` 流水，`balanceDelta: 0`、`frozenDelta: coinValue`。

- [ ] **Step 5: 错误映射和页面提示**

`api/index.js` 将 `INSUFFICIENT_COINS`、`INFLIGHT_LIMIT`、`ALREADY_CLAIMED` 映射为明确文案。接漂页展示可用与占用中积分，不足时显示差额和“去上漂”。

- [ ] **Step 6: 验证**

Run:

```bash
rtk node scripts/test-drift-policy.js
rtk node scripts/test-drift-migration.js
rtk node scripts/test-drift-fulfillment-contract.js
rtk node scripts/test-pool-want-contract.js
```

Expected: 接漂锁定、占用、地址快照和在途限制合同通过。

## Task 5：统一漂流详情和独立发货页

**Files:**
- Create: `miniprogram/pages/drift/order-detail.{js,wxml,wxss,json}`
- Create: `miniprogram/pages/drift/ship.{js,wxml,wxss,json}`
- Modify: `miniprogram/app.json`
- Modify: `miniprogram/utils/api.js`
- Modify: `cloudfunctions/api/index.js`
- Modify: `cloudfunctions/api/handlers/drift.js`
- Modify: `miniprogram/pages/drift/given.{js,wxml}`
- Modify: `miniprogram/pages/drift/received.{js,wxml}`
- Modify: `miniprogram/pages/mine/logistics.{js,wxml}`
- Test: `scripts/test-drift-fulfillment-contract.js`

- [ ] **Step 1: 添加发货和详情合同**

```js
const appJson = read('miniprogram/app.json');
const givenJs = read('miniprogram/pages/drift/given.js');
const shipWxml = readOptional('miniprogram/pages/drift/ship.wxml');

assert.ok(apiRoutes.includes("'drift.orderDetail'") && apiRoutes.includes("'drift.ship'"), 'api should expose detail and ship routes');
assert.ok(appJson.includes('pages/drift/order-detail') && appJson.includes('pages/drift/ship'), 'fulfillment pages should be registered');
assert.ok(!givenJs.includes('showActionSheet') && givenJs.includes('/pages/drift/ship?orderId='), 'given page should navigate to the dedicated ship page');
assert.ok(shipWxml.includes('<picker') && shipWxml.includes('运单号') && shipWxml.includes('快递到付'), 'ship page should use a picker and explicit COD copy');
```

- [ ] **Step 2: 运行并确认 RED**

Run: `rtk node scripts/test-drift-fulfillment-contract.js`  
Expected: FAIL at `api should expose detail and ship routes`。

- [ ] **Step 3: 实现 orderDetail 权限**

只有 `giverId`、`receiverId` 或管理员可以读取。列表格式不得包含完整地址；详情接口仅在相关状态向双方返回 `addressSnapshot`，取消后不返回地址。

返回：

```js
{
  order,
  role: user._id === order.giverId ? 'giver' : 'receiver',
  actions: { canShip, canCancel, canConfirm, canDispute, canReview, canAddToShelf },
  timeline,
}
```

- [ ] **Step 4: 实现独立发货页**

页面使用 `EXPRESS_COMPANIES` 的 `picker`，输入框 `maxlength="32"`。提交前 trim 单号，按钮在 `submitting` 时禁用；成功后 `redirectTo` 订单详情。

后端只允许赠书方在 `PENDING_SHIP` 且未过截止时间时提交，写入 `SHIPPED`、`shippedAt`、`autoCompleteAt = addDays(now, 10)` 和状态事件。

- [ ] **Step 5: 移除伪物流**

物流页只显示：

```xml
<view>承运商：{{expressCompany}}</view>
<view>运单号：{{trackingNo}}</view>
<view class="muted">物流状态以承运商实际查询结果为准，平台仅记录用户填写的信息。</view>
```

- [ ] **Step 6: 验证**

Run:

```bash
rtk node scripts/test-drift-fulfillment-contract.js
rtk node scripts/test-pool-navigation-and-anonymous-contract.js
rtk node --check miniprogram/pages/drift/ship.js
rtk node --check miniprogram/pages/drift/order-detail.js
```

Expected: 发货入口、详情权限和物流文案合同通过。

## Task 6：发货前双方取消和信用积分

**Files:**
- Modify: `cloudfunctions/api/handlers/drift.js`
- Modify: `cloudfunctions/api/index.js`
- Modify: `miniprogram/utils/api.js`
- Modify: `miniprogram/pages/drift/order-detail.{js,wxml}`
- Test: `scripts/test-drift-fulfillment-contract.js`

- [ ] **Step 1: 添加取消合同**

```js
const detailWxml = read('miniprogram/pages/drift/order-detail.wxml');
assert.ok(apiRoutes.includes("'drift.cancel'"), 'api should expose cancellation');
assert.ok(driftHandler.includes('claim_unfreeze') && driftHandler.includes("status: 'IN_POOL'"), 'cancellation should release occupied points and restore the pool');
assert.ok(driftHandler.includes('cancelledBy') && driftHandler.includes('cancelReason'), 'cancellation should be auditable');
assert.ok(detailWxml.includes('取消接漂') && detailWxml.includes('取消漂流'), 'both roles should have pre-shipment cancellation actions');
```

- [ ] **Step 2: 运行并确认 RED**

Run: `rtk node scripts/test-drift-fulfillment-contract.js`  
Expected: FAIL at `api should expose cancellation`。

- [ ] **Step 3: 实现幂等取消事务**

只允许双方在 `PENDING_SHIP` 取消。事务执行：

```js
coinFrozen: _.inc(-order.coinValue)
order.status = 'CANCELLED'
drift.status = 'IN_POOL'
drift.activeOrderId = ''
```

接漂方主动取消写信用 −2；赠书方主动取消写信用 −5；仅当 `activeCounted === true` 时将接漂方 `activeClaimCount` 减 1，并同步把记录的 `activeCounted` 置为 `false`。所有事件使用确定性 ID，重复请求返回当前取消结果而不再次减分或释放。

- [ ] **Step 4: 验证**

Run: `rtk node scripts/test-drift-fulfillment-contract.js`  
Expected: 双方取消、积分释放、恢复漂流池和信用变动合同通过。

## Task 7：完成结算、首赠奖励和书架归属

**Files:**
- Modify: `cloudfunctions/api/handlers/drift.js`
- Modify: `cloudfunctions/api/handlers/shelf.js`
- Modify: `cloudfunctions/api/index.js`
- Modify: `miniprogram/utils/api.js`
- Modify: `miniprogram/pages/drift/order-detail.{js,wxml}`
- Test: `scripts/test-drift-fulfillment-contract.js`

- [ ] **Step 1: 添加结算合同**

```js
assert.ok(driftHandler.includes('claim_spend') && driftHandler.includes('drift_reward'), 'completion should convert occupied points and reward the giver');
assert.ok(driftHandler.includes('first_give_bonus') && driftHandler.includes('firstGiveRewarded'), 'first completed gift should be rewarded once');
assert.ok(driftHandler.includes("collection('shelf_books').doc") && driftHandler.includes('shelfBookId'), 'completion should remove the exact giver shelf record');
assert.ok(apiRoutes.includes("'drift.addReceivedBook'"), 'receiver should be able to add the completed book to the shelf');
```

- [ ] **Step 2: 运行并确认 RED**

Run: `rtk node scripts/test-drift-fulfillment-contract.js`  
Expected: FAIL at `completion should convert occupied points and reward the giver`。

- [ ] **Step 3: 提取统一 settleOrder**

`confirm` 和定时任务共同调用 `settleOrder(orderId, completionType)`。事务内确认状态为 `SHIPPED`，然后：

```js
receiver.coinFrozen -= coinValue
receiver.coinBalance -= coinValue
if (order.activeCounted === true) receiver.activeClaimCount -= 1
giver.coinBalance += coinValue
order.status = 'DONE'
order.activeCounted = false
drift.status = 'COMPLETED'
giver.creditScore += 2
receiver.creditScore += 2
```

删除赠书方 `shelfBookId`，写 `claim_spend`、`drift_reward`、双方信用明细和完成事件。首次完成赠书时按阶段发放 `first_give_bonus` 并设置 `firstGiveRewarded`。

状态权限必须按完成来源区分：`USER` 和 `AUTO` 只接受 `SHIPPED`，其中 `AUTO` 还必须确认没有 `OPEN` 申诉；`ADMIN` 只接受已由管理员锁定处理的 `DISPUTED`。结算事务再次读取最新状态，防止确认收货、自动完成和申诉处理并发重复结算。

- [ ] **Step 4: 一键加入书架**

`addReceivedBook` 只允许接漂方操作已完成记录，调用现有容量和重复校验，创建来源 `drift_received` 的新书架记录。重复点击返回现有记录，不重复创建。

- [ ] **Step 5: 验证**

Run:

```bash
rtk node scripts/test-drift-fulfillment-contract.js
rtk node scripts/test-shelf-quota-and-value-contract.js
rtk node scripts/test-shelf-data-contract.js
```

Expected: 结算、首赠、精确移除和接漂方加书合同通过。

## Task 8：72 小时取消和 10 天自动完成

**Files:**
- Modify: `cloudfunctions/api/handlers/drift.js`
- Modify: `cloudfunctions/api/index.js`
- Modify: `cloudfunctions/api/config.json`
- Test: `scripts/test-drift-fulfillment-contract.js`

- [ ] **Step 1: 添加维护任务合同**

```js
const apiConfig = read('cloudfunctions/api/config.json');
assert.ok(apiConfig.includes('driftMaintenance') && apiConfig.includes('0 0 * * * * *'), 'api cloud function should run hourly maintenance');
assert.ok(driftHandler.includes('maintainDriftOrders') && driftHandler.includes('shipDeadlineAt') && driftHandler.includes('autoCompleteAt'), 'maintenance should handle both deadlines');
assert.ok(driftHandler.includes('SHIP_TIMEOUT') && driftHandler.includes('-10'), 'shipment timeout should record credit -10');
```

- [ ] **Step 2: 运行并确认 RED**

Run: `rtk node scripts/test-drift-fulfillment-contract.js`  
Expected: FAIL at `api cloud function should run hourly maintenance`。

- [ ] **Step 3: 添加定时触发入口**

`config.json`：

```json
{
  "timeout": 20,
  "memorySize": 256,
  "triggers": [
    { "name": "driftMaintenance", "type": "timer", "config": "0 0 * * * * *" }
  ]
}
```

`index.js` 在普通 action 路由前处理：

```js
if (event.Type === 'Timer' && event.TriggerName === 'driftMaintenance') {
  return drift.maintainDriftOrders();
}
```

- [ ] **Step 4: 实现维护函数**

- `PENDING_SHIP` 且 `shipDeadlineAt <= now`：复用取消事务，角色 `SYSTEM`，释放占用积分，信用 −10，恢复 `IN_POOL`。
- `SHIPPED` 且 `autoCompleteAt <= now` 且没有 `OPEN` 申诉：调用 `settleOrder(orderId, 'AUTO')`。
- 每批最多处理 50 条，单条失败记录日志并继续；幂等键阻止重复处理。

- [ ] **Step 5: 验证**

Run:

```bash
rtk node scripts/test-drift-fulfillment-contract.js
rtk node --check cloudfunctions/api/index.js
rtk node --check cloudfunctions/api/handlers/drift.js
```

Expected: 两种截止时间和定时配置合同通过。

## Task 9：申诉、管理员处理和处罚

**Files:**
- Create: `miniprogram/pages/drift/dispute.{js,wxml,wxss,json}`
- Create: `miniprogram/pages/mine/disputes.{js,wxml,wxss,json}`
- Modify: `miniprogram/app.json`
- Modify: `cloudfunctions/api/handlers/drift.js`
- Modify: `cloudfunctions/api/index.js`
- Modify: `cloudfunctions/api/lib/db.js`
- Modify: `miniprogram/utils/api.js`
- Modify: `miniprogram/pages/mine/index.{js,wxml}`
- Test: `scripts/test-drift-fulfillment-contract.js`

- [ ] **Step 1: 添加申诉合同**

```js
const disputeWxml = readOptional('miniprogram/pages/drift/dispute.wxml');
const adminWxml = readOptional('miniprogram/pages/mine/disputes.wxml');
assert.ok(apiRoutes.includes("'drift.dispute'") && apiRoutes.includes("'drift.resolveDispute'"), 'api should expose dispute create and resolution');
assert.ok(driftHandler.includes("status: 'DISPUTED'") && driftHandler.includes('assertSafeTextFields'), 'dispute should pause settlement and check UGC');
assert.ok(disputeWxml.includes('上传举证') && disputeWxml.includes('申诉原因'), 'user dispute page should collect evidence');
assert.ok(adminWxml.includes('确认完成') && adminWxml.includes('退款关闭'), 'admin should have both resolution outcomes');
```

- [ ] **Step 2: 运行并确认 RED**

Run: `rtk node scripts/test-drift-fulfillment-contract.js`  
Expected: FAIL at `api should expose dispute create and resolution`。

- [ ] **Step 3: 实现用户申诉**

只允许双方对 `SHIPPED` 记录申诉；文本和图片通过内容安全后创建 `drift_disputes`，状态 `OPEN`，履约状态改为 `DISPUTED`。详情页暂停自动完成并显示处理中。

- [ ] **Step 4: 实现管理员鉴权和处理**

复用 Task 2A 的 `ADMIN_OPENIDS` 服务端鉴权，不把管理员权限交给可写的前端字段。`resolveDispute` 只允许管理员：

- `COMPLETE`：调用 `settleOrder(orderId, 'ADMIN')`。
- `REFUND_CLOSE`：释放接漂方占用积分，记录和漂流进入 `CLOSED`；若 `activeCounted === true`，接漂方在途数减 1 并将标记置为 `false`。
- `GIVER_FAULT_FIRST`：释放积分、赠书方信用 −5，可选补偿 +5。
- `GIVER_FAULT_REPEAT`：释放积分、赠书方信用 −20、增加等额待抵扣。
- 无效投诉：接漂方 `invalidDisputeCount += 1`，满 3 次标记异常。

- [ ] **Step 5: 验证**

Run:

```bash
rtk node scripts/test-drift-fulfillment-contract.js
rtk node scripts/test-compliance-p0-contract.js
```

Expected: 申诉暂停、管理员权限、处理结果和内容安全合同通过。

## Task 10：双方一次性互评

**Files:**
- Modify: `cloudfunctions/api/handlers/drift.js`
- Modify: `miniprogram/pages/drift/review.js`
- Modify: `miniprogram/pages/drift/order-detail.{js,wxml}`
- Test: `scripts/test-drift-fulfillment-contract.js`

- [ ] **Step 1: 添加评价权限合同**

```js
assert.ok(driftHandler.includes("order.status !== 'DONE'") && driftHandler.includes('fromUser'), 'reviews should require completed participation');
assert.ok(driftHandler.includes('`${order._id}-${user._id}`'), 'review id should be deterministic per participant');
assert.ok(!driftHandler.includes('data.rating >= 4') || !driftHandler.includes('creditScore: toUserDoc.creditScore + 1'), 'reviews should not directly add credit');
```

- [ ] **Step 2: 运行并确认 RED**

Run: `rtk node scripts/test-drift-fulfillment-contract.js`  
Expected: FAIL at `reviews should require completed participation`。

- [ ] **Step 3: 实现一次性互评**

后端验证 `DONE`、当前用户为双方之一，评价目标为另一方。使用 `${orderId}-${fromUser}` 作为文档 ID；已存在时返回 409。保留内容安全，删除好评自动加信用积分逻辑。

详情页分别显示“去评价”或“已评价”。

- [ ] **Step 4: 验证**

Run: `rtk node scripts/test-drift-fulfillment-contract.js`  
Expected: 双方权限、唯一评价和不加信用合同通过。

## Task 11：列表、提醒、合规文案和最终回归

**Files:**
- Modify: `miniprogram/pages/drift/given.{js,wxml,wxss}`
- Modify: `miniprogram/pages/drift/received.{js,wxml,wxss}`
- Modify: `miniprogram/pages/mine/index.{js,wxml}`
- Modify: `miniprogram/utils/util.js`
- Modify: `scripts/test-compliance-p0-contract.js`
- Modify: `scripts/test-pool-compliance-contract.js`
- Modify: `项目进度交接文档.md`
- Test: `scripts/test-drift-fulfillment-contract.js`

- [ ] **Step 1: 添加最终文案合同**

```js
const allUi = [
  read('miniprogram/pages/drift/given.wxml'),
  read('miniprogram/pages/drift/received.wxml'),
  read('miniprogram/pages/drift/order-detail.wxml'),
  read('miniprogram/pages/drift/claim.wxml'),
].join('\n');

assert.ok(!/购买|卖家|买家|支付|充值|提现|下单/.test(allUi), 'fulfillment UI should avoid transaction wording');
assert.ok(allUi.includes('快递到付') && allUi.includes('平台不收取'), 'fulfillment UI should explain COD and no platform fee');
assert.ok(allUi.includes('接漂占用') || allUi.includes('占用中'), 'frontend should use occupied-point wording');
```

- [ ] **Step 2: 列表简化为概览**

赠出和接漂列表只展示状态、倒计时、一个主要动作和“查看详情”。所有取消、申诉、评价等次要操作集中在详情页。状态文案使用 `待寄出 / 已寄出 / 申诉处理中 / 已完成 / 已取消 / 已关闭`。

- [ ] **Step 3: 站内提醒**

“我的”页面和列表统计：

- 待发货数量。
- 24 小时内到期数量。
- 待确认收货数量。
- 申诉处理中数量。
- 待评价数量。

第一阶段不依赖订阅消息，不增加聊天或开放社区入口。

- [ ] **Step 4: 更新交接文档**

记录新增集合、定时触发器、环境参数、部署顺序、隐私地址快照、管理员环境变量和个人主体降级边界。

- [ ] **Step 5: 运行聚焦测试**

```bash
rtk node scripts/test-drift-policy.js
rtk node scripts/test-drift-migration.js
rtk node scripts/test-drift-fulfillment-contract.js
rtk node scripts/test-drift-coin-contract.js
rtk node scripts/test-drift-publish-form-contract.js
rtk node scripts/test-pool-compliance-contract.js
rtk node scripts/test-compliance-p0-contract.js
rtk node scripts/test-shelf-data-contract.js
```

Expected: 全部输出各自 `ok`，0 failures。

- [ ] **Step 6: 运行全量合同测试**

```bash
rtk proxy sh -c 'count=0; for f in scripts/test-*.js; do node "$f" || exit 1; count=$((count+1)); done; echo "contract_tests=$count"'
```

Expected: 所有测试退出 0；远程封面和 Open Library 的预期降级日志不算失败。

- [ ] **Step 7: 运行语法和 JSON 校验**

```bash
rtk proxy sh -c "find cloudfunctions/api -name '*.js' -not -path '*/node_modules/*' -print0 | xargs -0 -n1 node --check"
rtk proxy sh -c "find miniprogram/pages/drift -name '*.js' -print0 | xargs -0 -n1 node --check"
rtk proxy python3 -m json.tool miniprogram/app.json
rtk proxy python3 -m json.tool cloudfunctions/api/config.json
```

Expected: 全部退出 0。

- [ ] **Step 8: 按安全顺序部署并核对云端配置**

1. 先创建 `drift_disputes`、`drift_order_events` 集合和必要索引，不开放新版前端。
2. 配置 `DRIFT_STAGE=cold`、`ADMIN_OPENIDS`，上传新版 `api` 云函数。
3. 从云函数控制台以管理员身份循环调用 `system.migrateDriftAccounting`，直至 `nextCursor` 为空；核对活动旧记录均为 `accountingVersion: 2`、`activeCounted: true`。
4. 抽样核对迁移前后接漂方可用公益积分不变，即 `coinBalance - coinFrozen` 保持一致。
5. 在云开发控制台确认 `driftMaintenance` 已创建、下次执行时间正常，并手动触发一次空跑。
6. 再上传小程序体验版；在微信公众平台人工复核当期个人主体类目、隐私保护指引和 UGC 要求后提交审核。

Expected: 旧活动记录迁移完整、可用积分不漂移、维护触发器可执行，前后端不存在混用两套账务语义的窗口。

- [ ] **Step 9: 微信开发者工具和真机验收**

按以下顺序使用两个测试账号验证：

1. 赠书方上漂并通过审核。
2. 接漂方确认地址，公益积分进入占用中。
3. 第二个接漂方申请同一本书，得到已被接漂提示。
4. 双方分别验证发货前取消及积分释放。
5. 重新接漂后，赠书方进入独立发货页并录入物流。
6. 接漂方确认收货，核对积分、信用和赠书方书架。
7. 接漂方一键加入书架。
8. 双方分别评价一次，第二次提交被拒绝。
9. 创建申诉，确认自动完成暂停，管理员完成两种处理路径。
10. 通过测试数据验证 72 小时取消和 10 天自动完成的幂等性。
11. 复查信用积分仍在“我的”和信用明细页可见，评价不会直接增加信用积分。

Expected: 所有状态、积分、信用、书架和隐私行为与设计文档一致。

## 执行检查点

- Task 1–4 完成后：后端账务与锁定必须稳定，才允许开始前端发货页。
- Task 5–8 完成后：正常履约和定时闭环可用，才允许开始申诉和评价。
- Task 9–11 完成后：完成合规、隐私、管理处理和全量验收。

任何检查点出现积分重复变更、并发双接漂、地址越权或自动任务重复执行，必须停止后续任务并回到对应事务设计修复。
