import React, { useCallback, useEffect, useState } from 'react';
import {
  Button, Card, Input, InputNumber, Modal, Select, Space, Table, Typography, message,
} from 'antd';
import { callAdmin } from '../api/client';

const CATEGORY_OPTIONS = [
  { value: 'all', label: '全部分类' },
  { value: 'children', label: '童书' },
  { value: 'literature', label: '文学' },
  { value: 'business', label: '经管' },
  { value: 'other', label: '其他' },
];

const COIN_OPTIONS = [
  { value: 'all', label: '全部积分' },
  { value: 'low', label: '0–5 分' },
  { value: 'middle', label: '6–10 分' },
  { value: 'high', label: '11–20 分' },
  { value: 'premium', label: '21 分以上' },
];

const PINNED_OPTIONS = [
  { value: 'all', label: '全部置顶' },
  { value: 'pinned', label: '已置顶' },
  { value: 'unpinned', label: '未置顶' },
];

const STATUS_TRANSITIONS = {
  PENDING_REVIEW: ['IN_POOL', 'REJECTED', 'CANCELLED'],
  IN_POOL: ['PENDING_REVIEW', 'REJECTED', 'CANCELLED'],
  REJECTED: ['IN_POOL', 'PENDING_REVIEW', 'CANCELLED'],
  CANCELLED: ['IN_POOL', 'PENDING_REVIEW'],
};

const STATUS_LABELS = {
  PENDING_REVIEW: '待审核',
  IN_POOL: '在池',
  REJECTED: '已拒绝',
  CANCELLED: '已取消',
  CLAIMED: '已接漂',
  COMPLETED: '已完成',
};

const STATUS_FILTER_OPTIONS = [
  { value: 'IN_POOL', label: '在池' },
  { value: 'PENDING_REVIEW', label: '待审核' },
  { value: 'REJECTED', label: '已拒绝' },
  { value: 'all', label: '全部状态' },
];

function statusEditOptions(currentStatus) {
  const targets = STATUS_TRANSITIONS[currentStatus] || [];
  return targets.map((value) => ({ value, label: STATUS_LABELS[value] || value }));
}

export default function PoolPage() {
  const [status, setStatus] = useState('IN_POOL');
  const [category, setCategory] = useState('all');
  const [valueKey, setValueKey] = useState('all');
  const [pinnedFilter, setPinnedFilter] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [rawTotal, setRawTotal] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [pinned, setPinned] = useState({ list: [], count: 0, max: 30 });
  const [editRow, setEditRow] = useState(null);
  const [reason, setReason] = useState('');

  const loadList = useCallback(async (opts = {}) => {
    const nextPage = opts.page ?? page;
    const kw = opts.keyword ?? keyword;
    setLoading(true);
    try {
      const res = await callAdmin('admin.drifts.list', {
        status,
        category: category === 'all' ? undefined : category,
        valueKey: valueKey === 'all' ? undefined : valueKey,
        pinnedFilter: pinnedFilter === 'all' ? undefined : pinnedFilter,
        keyword: kw || undefined,
        page: nextPage,
        size: pageSize,
      });
      setList(res.list || []);
      setTotal(res.total || 0);
      setRawTotal(res.rawTotal || res.total || 0);
      setTruncated(!!res.truncated);
      setPage(nextPage);
    } catch (err) {
      message.error(err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [status, category, valueKey, pinnedFilter, keyword, page, pageSize]);

  async function loadPinned() {
    try {
      const res = await callAdmin('admin.drifts.listPinned');
      setPinned(res);
    } catch (err) {
      message.error(err.message || '加载置顶失败');
    }
  }

  useEffect(() => {
    setPage(1);
    loadList({ page: 1 });
    loadPinned();
  }, [status, category, valueKey, pinnedFilter]);

  async function runAction(action, payload) {
    try {
      await callAdmin(action, payload);
      message.success('操作成功');
      loadList();
      loadPinned();
      setEditRow(null);
      setReason('');
    } catch (err) {
      message.error(err.message || '操作失败');
    }
  }

  function openEdit(row) {
    setEditRow({
      ...row,
      nextCoin: row.coinValue,
      nextCategory: row.opsCategory || row.category,
      nextStatus: row.status,
    });
    setReason('');
  }

  const columns = [
    { title: '书名', dataIndex: 'bookTitle', ellipsis: true },
    { title: '积分', dataIndex: 'coinValue', width: 70 },
    { title: '分类', dataIndex: 'categoryLabel', width: 80 },
    { title: '状态', dataIndex: 'statusLabel', width: 90 },
    {
      title: '置顶',
      width: 70,
      render: (_, row) => (row.opsPinned ? `#${row.opsPinRank || '-'}` : '-'),
    },
    {
      title: '隐藏',
      width: 70,
      render: (_, row) => (row.opsHidden ? '是' : '-'),
    },
    { title: '赠书方', render: (_, row) => row.giver?.nickname || '-', width: 100 },
    { title: '上架时间', dataIndex: 'createdAt', width: 170 },
    {
      title: '操作',
      width: 280,
      fixed: 'right',
      render: (_, row) => (
        <Space wrap>
          <Button size="small" onClick={() => openEdit(row)}>编辑</Button>
          {row.opsPinned
            ? <Button size="small" onClick={() => runAction('admin.drifts.unpin', { driftId: row.id })}>取消置顶</Button>
            : (
              <Button
                size="small"
                type="primary"
                onClick={() => runAction('admin.drifts.pin', { driftId: row.id, opsPinRank: (pinned.count || 0) + 1 })}
              >
                置顶
              </Button>
            )}
          {row.appealStatus === 'OPEN' && (
            <>
              <Button size="small" onClick={() => runAction('admin.drifts.approve', { driftId: row.id, reason: '申诉通过' })}>通过</Button>
              <Button
                size="small"
                danger
                onClick={() => Modal.confirm({
                  title: '拒绝申诉',
                  content: <Input.TextArea id="reject-reason" placeholder="拒绝原因" />,
                  onOk: () => {
                    const el = document.getElementById('reject-reason');
                    return runAction('admin.drifts.reject', { driftId: row.id, reason: el?.value || '不符合上架要求' });
                  },
                })}
              >
                拒绝
              </Button>
            </>
          )}
          {row.opsHidden
            ? <Button size="small" onClick={() => runAction('admin.drifts.show', { driftId: row.id })}>恢复</Button>
            : <Button size="small" danger onClick={() => runAction('admin.drifts.hide', { driftId: row.id, reason: '运营下架' })}>下架</Button>}
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card title={`置顶列表（${pinned.count || 0}/${pinned.max || 30}）`}>
        <Table
          rowKey="driftId"
          pagination={false}
          dataSource={pinned.list || []}
          columns={[
            { title: '排序', dataIndex: 'opsPinRank', width: 80 },
            { title: '书名', dataIndex: 'bookTitle' },
            { title: '积分', dataIndex: 'coinValue', width: 80 },
            { title: '到期', dataIndex: 'opsPinnedUntil', width: 180, render: (v) => v || '不限' },
          ]}
        />
      </Card>

      <Card title="在漂书籍">
        <Space wrap className="toolbar" style={{ marginBottom: 16 }}>
          <Select value={status} style={{ width: 120 }} options={STATUS_FILTER_OPTIONS} onChange={setStatus} />
          <Select value={category} style={{ width: 120 }} options={CATEGORY_OPTIONS} onChange={setCategory} />
          <Select value={valueKey} style={{ width: 130 }} options={COIN_OPTIONS} onChange={setValueKey} />
          <Select value={pinnedFilter} style={{ width: 120 }} options={PINNED_OPTIONS} onChange={setPinnedFilter} />
          <Input.Search
            allowClear
            placeholder="书名 / ISBN / 赠书方"
            style={{ width: 220 }}
            onSearch={(v) => {
              setKeyword(v);
              setPage(1);
              loadList({ page: 1, keyword: v });
            }}
          />
          <Button onClick={() => { loadList(); loadPinned(); }}>刷新</Button>
        </Space>

        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          匹配 {total} 本
          {rawTotal !== total ? `（当前状态共 ${rawTotal} 本）` : ''}
          {truncated ? '；已达单次加载上限 1000 本，请缩小筛选范围' : ''}
        </Typography.Text>

        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={list}
          scroll={{ x: 1100 }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: false,
            showTotal: (t) => `共 ${t} 本`,
            onChange: (p) => loadList({ page: p }),
          }}
        />
      </Card>

      <Modal
        open={!!editRow}
        title={`编辑 · ${editRow?.bookTitle || ''}`}
        onCancel={() => setEditRow(null)}
        onOk={async () => {
          if (!reason.trim()) {
            message.warning('请填写原因');
            return;
          }
          const statusChanged = editRow.nextStatus && editRow.nextStatus !== editRow.status;
          const coinChanged = editRow.nextCoin !== editRow.coinValue;
          const categoryChanged = editRow.nextCategory !== (editRow.opsCategory || editRow.category);
          if (!statusChanged && !coinChanged && !categoryChanged) {
            message.info('未修改任何内容');
            setEditRow(null);
            return;
          }
          try {
            if (statusChanged) {
              await callAdmin('admin.drifts.updateStatus', {
                driftId: editRow.id,
                status: editRow.nextStatus,
                reason,
              });
            }
            if (coinChanged) {
              await callAdmin('admin.drifts.updateCoin', {
                driftId: editRow.id,
                coinValue: editRow.nextCoin,
                reason,
              });
            }
            if (categoryChanged) {
              await callAdmin('admin.drifts.updateCategory', {
                driftId: editRow.id,
                opsCategory: editRow.nextCategory,
                reason,
              });
            }
            message.success('保存成功');
            setEditRow(null);
            setReason('');
            loadList();
            loadPinned();
          } catch (err) {
            if (err.code === 404 && String(err.message || '').includes('未知 action')) {
              message.error('云函数未更新：请在微信开发者工具右键 cloudfunctions/api → 上传并部署：云端安装依赖');
            } else {
              message.error(err.message || '保存失败');
            }
          }
        }}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>当前状态：{editRow?.statusLabel || STATUS_LABELS[editRow?.status] || editRow?.status}</div>
          {statusEditOptions(editRow?.status || '').length > 0 ? (
            <Select
              style={{ width: '100%' }}
              placeholder="选择目标状态（不修改请保持当前）"
              value={editRow?.nextStatus}
              options={statusEditOptions(editRow?.status || '')}
              onChange={(v) => setEditRow((row) => ({ ...row, nextStatus: v }))}
            />
          ) : (
            <Typography.Text type="secondary">该状态不可在此修改（已接漂/已完成请走订单）</Typography.Text>
          )}
          <div>系统建议积分：{editRow?.systemCoinValue}</div>
          <InputNumber
            min={0}
            style={{ width: '100%' }}
            value={editRow?.nextCoin}
            onChange={(v) => setEditRow((row) => ({ ...row, nextCoin: v }))}
          />
          <Select
            style={{ width: '100%' }}
            value={editRow?.nextCategory}
            options={CATEGORY_OPTIONS.filter((o) => o.value !== 'all')}
            onChange={(v) => setEditRow((row) => ({ ...row, nextCategory: v }))}
          />
          <Input.TextArea rows={2} placeholder="调整原因" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Space>
      </Modal>
    </Space>
  );
}
