# 赠书方可调低流转积分设计

**日期：** 2026-06-24  
**状态：** 已确认，实施中

## 1. 目标

允许赠书方在系统建议流转积分基础上下调（最低 0），便于快速出清闲置图书；仅允许单向下调，不可议价或上调。

## 2. 核心规则

- `systemCoinValue` = `calculateCoinValue(listPrice, condition)`
- `coinValue` = 赠书方设定，整数，满足 `0 <= coinValue <= systemCoinValue`
- 入池后不可修改；取消后重新上漂可重新设定
- 切换品相时：`coinValue = min(当前值, 新 systemCoinValue)`

## 3. 0 积分附加规则

完成结算时若 `order.coinValue === 0`：

- 无积分冻结/扣除/到账
- **不发放首赠奖励**
- **`firstGiveRewarded` 不置 true**（不消耗首赠资格）
- 上漂审核 +2、信用 +2、邀请奖励逻辑不变

## 4. 数据模型

`drifts` 新增 `systemCoinValue`；历史记录缺失时视为等于 `coinValue`。

## 5. 交互

上漂页使用步进器（− / +），范围 0 ~ systemCoinValue；设为 0 时提交前二次确认。

## 6. API

`drift.publish` 可选参数 `coinValue`；服务端重算并校验。

## 7. 验收

见实施计划与合约测试 `scripts/test-drift-coin-value-adjustment.js`。
