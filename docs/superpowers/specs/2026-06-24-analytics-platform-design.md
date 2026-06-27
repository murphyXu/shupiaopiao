# 数据埋点与统计后台设计

**日期**：2026-06-24  
**状态**：已实施 Phase 0–2

## 目标

建立三层数据体系（明细 → 聚合 → 看板），支持关键指标统计、明细查询、规则分析结论，运行于微信云开发，无第三方依赖。

## 架构

- **采集层**：`track.js` + API 中间件 `logApiCall`
- **明细层**：`events`、`coin_transactions`、`credit_logs`、`drift_order_events`
- **聚合层**：`daily_metrics`（定时任务 `dailyMetrics` 00:30 UTC+8）
- **展示层**：`pages/admin/dashboard`、`pages/admin/logs`

## 权限与合规

- 仅 `ADMIN_OPENIDS` 白名单可访问 admin API
- openid 经 SHA256 截断为 16 位 uidHash，明细不展示 PII
- admin 页不在公开导航暴露，降低过审风险
- `events` 明细保留 90 天，每日聚合时自动清理

## 关键指标

| 维度 | 指标 |
|------|------|
| 增长 | DAU、新增、D1/D7 留存 |
| 供给 | 上漂量、书架新增 |
| 转化 | 被接率、寄出率、完成率、avgShipHours |
| 经济 | 积分发行/消耗/存量 |
| 质量 | 错误率、纠纷率、风控命中 |

## API

见 README「数据埋点与运营看板」章节。

## 实施分期

- **Phase 0**：集合同步、README、设计文档
- **Phase 1**：admin.events/ledger、logs 页、埋点扩展、90 天清理
- **Phase 2**：看板多指标趋势、结论规则扩展、avgShipHours 聚合
