# 赠书方可调低流转积分 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 允许赠书方在上漂时将流转积分从系统建议值下调至 0，0 积分完成不消耗首赠资格。

**Architecture:** 在 `driftPolicy` 增加可测试的校验函数；`drift.publish` 持久化 `systemCoinValue`/`coinValue`；`settleOrder` 调整首赠分支；上漂页步进器 + 0 积分确认；合约测试锁定行为。

**Tech Stack:** 微信云开发、CommonJS、Node assert 合约测试

---

### Task 1: 后端校验与发布

- [ ] `resolveRequestedCoinValue` in `driftPolicy.js`
- [ ] `publish` 写入 `systemCoinValue`、校验 `coinValue`
- [ ] `settleOrder` 0 积分首赠规则

### Task 2: 前端上漂页

- [ ] 步进器 UI、`coinHint`、0 积分提交确认
- [ ] `check-result` 与 `pointRules` 文案

### Task 3: 合约测试

- [ ] `scripts/test-drift-coin-value-adjustment.js`
- [ ] 更新 `test-drift-publish-form-contract.js`
