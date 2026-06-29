import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, List, Space, Statistic, Row, Col, Button, message } from 'antd';
import { callAdmin } from '../api/client';

export default function TodosPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await callAdmin('admin.orders.todos');
      setData(res);
    } catch (err) {
      message.error(err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const counts = data?.counts || {};

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Row gutter={16}>
        <Col span={8}><Card loading={loading}><Statistic title="超时未发货" value={counts.overdueShip || 0} /></Card></Col>
        <Col span={8}><Card loading={loading}><Statistic title="即将自动完成" value={counts.autoCompleteSoon || 0} /></Card></Col>
        <Col span={8}><Card loading={loading}><Statistic title="申诉待审" value={counts.appealOpen || 0} /></Card></Col>
      </Row>

      <Card title="超时未发货" loading={loading} extra={<Button onClick={load}>刷新</Button>}>
        <List
          dataSource={data?.overdueShip || []}
          locale={{ emptyText: '暂无' }}
          renderItem={(item) => (
            <List.Item actions={[<Link key="go" to={`/orders/${item.orderId}`}>查看订单</Link>]}>
              订单 {item.orderId} · 截止 {item.shipDeadlineAt || '-'}
            </List.Item>
          )}
        />
      </Card>

      <Card title="即将自动完成" loading={loading}>
        <List
          dataSource={data?.autoCompleteSoon || []}
          locale={{ emptyText: '暂无' }}
          renderItem={(item) => (
            <List.Item actions={[<Link key="go" to={`/orders/${item.orderId}`}>查看订单</Link>]}>
              订单 {item.orderId} · 自动完成 {item.autoCompleteAt || '-'}
            </List.Item>
          )}
        />
      </Card>

      <Card title="申诉待审" loading={loading}>
        <List
          dataSource={data?.appealOpen || []}
          locale={{ emptyText: '暂无' }}
          renderItem={(item) => (
            <List.Item
              actions={[<Link key="go" to="/pool">去在漂书籍处理</Link>]}
            >
              漂流 {item.driftId} · {item.appealReason || '无原因'} · {item.appealAt || '-'}
            </List.Item>
          )}
        />
      </Card>
    </Space>
  );
}
