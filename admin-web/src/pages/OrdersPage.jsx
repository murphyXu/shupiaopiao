import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Select, Table, message } from 'antd';
import { callAdmin } from '../api/client';

const STATUS_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'PENDING_SHIP', label: '待发货' },
  { value: 'SHIPPED', label: '待收货' },
  { value: 'DISPUTED', label: '申诉中' },
  { value: 'DONE', label: '已完成' },
  { value: 'CANCELLED', label: '已取消' },
];

export default function OrdersPage() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({ list: [], total: 0 });

  async function load(nextPage = page, nextStatus = status) {
    setLoading(true);
    try {
      const res = await callAdmin('admin.orders.list', { page: nextPage, size: 20, status: nextStatus || undefined });
      setData(res);
    } catch (err) {
      message.error(err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(1, status); }, [status]);

  const columns = [
    { title: '订单 ID', dataIndex: 'id', width: 220, ellipsis: true },
    { title: '状态', dataIndex: 'statusLabel', width: 100 },
    { title: '书名', render: (_, row) => row.book?.title || '-', ellipsis: true },
    { title: '积分', dataIndex: 'coinValue', width: 80 },
    { title: '赠书方', render: (_, row) => row.giver?.nickname || '-', width: 120 },
    { title: '接书方', render: (_, row) => row.receiver?.nickname || '-', width: 120 },
    { title: '接漂时间', dataIndex: 'claimedAt', width: 180 },
    {
      title: '操作',
      width: 80,
      render: (_, row) => <Link to={`/orders/${row.id}`}>详情</Link>,
    },
  ];

  return (
    <Card
      title="订单管理"
      extra={(
        <Select
          style={{ width: 160 }}
          value={status}
          options={STATUS_OPTIONS}
          onChange={(value) => { setStatus(value); setPage(1); }}
        />
      )}
    >
      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={data.list}
        pagination={{
          current: page,
          total: data.total,
          pageSize: 20,
          onChange: (p) => { setPage(p); load(p, status); },
        }}
      />
    </Card>
  );
}
