import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Input, Table, message } from 'antd';
import { callAdmin } from '../api/client';

export default function UsersPage() {
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({ list: [], total: 0 });
  const [page, setPage] = useState(1);

  async function load(nextPage = page, kw = keyword) {
    setLoading(true);
    try {
      const res = await callAdmin('admin.users.list', { page: nextPage, size: 20, keyword: kw || undefined });
      setData(res);
    } catch (err) {
      message.error(err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(1, ''); }, []);

  const columns = [
    { title: '昵称', dataIndex: 'nickname', width: 140 },
    { title: '用户 ID', dataIndex: 'id', ellipsis: true },
    { title: '公益积分', dataIndex: 'availableCoin', width: 100 },
    { title: '信用分', dataIndex: 'creditScore', width: 90 },
    { title: '在途订单', dataIndex: 'activeClaimCount', width: 90 },
    { title: '注册时间', dataIndex: 'createdAt', width: 180 },
    {
      title: '操作',
      width: 80,
      render: (_, row) => <Link to={`/users/${row.id}`}>详情</Link>,
    },
  ];

  return (
    <Card
      title="用户管理"
      extra={(
        <Input.Search
          allowClear
          placeholder="昵称 / 用户 ID"
          onSearch={(v) => { setKeyword(v); setPage(1); load(1, v); }}
          style={{ width: 260 }}
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
          onChange: (p) => { setPage(p); load(p, keyword); },
        }}
      />
    </Card>
  );
}
