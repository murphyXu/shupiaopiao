import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Button, Card, Descriptions, Input, InputNumber, Modal, Space, Table, message,
} from 'antd';
import { callAdmin } from '../api/client';

function AddressBox({ address }) {
  if (!address) return <div className="address-box">暂无地址</div>;
  return (
    <div className="address-box">
      <div>{address.name} · {address.phone}</div>
      <div>{address.region} {address.detail}</div>
    </div>
  );
}

export default function OrderDetailPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState('');

  async function load() {
    setLoading(true);
    try {
      const res = await callAdmin('admin.orders.detail', { orderId });
      setDetail(res);
    } catch (err) {
      message.error(err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [orderId]);

  async function runAction(action, extra = {}) {
    if ((action === 'admin.orders.forceCancel') && !reason.trim()) {
      message.warning('请先填写操作原因');
      return;
    }
    try {
      await callAdmin(action, { orderId, reason, ...extra });
      message.success('操作成功');
      load();
    } catch (err) {
      message.error(err.message || '操作失败');
    }
  }

  const order = detail?.order;
  const events = detail?.events || [];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card loading={loading} title={`订单详情 · ${orderId}`} extra={<Button onClick={() => navigate(-1)}>返回</Button>}>
        {order && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="状态">{order.statusLabel}</Descriptions.Item>
            <Descriptions.Item label="积分">{order.coinValue}</Descriptions.Item>
            <Descriptions.Item label="书名">{order.book?.title || '-'}</Descriptions.Item>
            <Descriptions.Item label="ISBN">{order.book?.isbn || '-'}</Descriptions.Item>
            <Descriptions.Item label="赠书方">{order.giver?.nickname || '-'}</Descriptions.Item>
            <Descriptions.Item label="接书方">{order.receiver?.nickname || '-'}</Descriptions.Item>
            <Descriptions.Item label="物流">{order.expressCompany || '-'} {order.trackingNo || ''}</Descriptions.Item>
            <Descriptions.Item label="发货截止">{order.shipDeadlineAt || '-'}</Descriptions.Item>
            <Descriptions.Item label="自动完成">{order.autoCompleteAt || '-'}</Descriptions.Item>
            <Descriptions.Item label="接漂时间">{order.claimedAt || '-'}</Descriptions.Item>
          </Descriptions>
        )}
      </Card>

      <Card title="收货地址（完整）" loading={loading}>
        <AddressBox address={order?.addressSnapshot} />
      </Card>

      <Card title="运营操作">
        <Space direction="vertical" style={{ width: '100%' }}>
          <Input.TextArea rows={2} placeholder="操作原因（取消时必填）" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Space wrap>
            <Button danger onClick={() => runAction('admin.orders.forceCancel')}>强制取消</Button>
            <Button type="primary" onClick={() => runAction('admin.orders.forceComplete')}>代确认完成</Button>
            <Button onClick={() => {
              Modal.confirm({
                title: '延长 24 小时',
                onOk: () => runAction('admin.orders.extendDeadline', { hours: 24 }),
              });
            }}
            >
              延长 24h
            </Button>
          </Space>
        </Space>
      </Card>

      <Card title="时间线">
        <Table
          rowKey={(row) => `${row.orderId}-${row.type}-${row.createdAt}`}
          pagination={false}
          dataSource={events}
          columns={[
            { title: '时间', dataIndex: 'createdAt', width: 180 },
            { title: '事件', dataIndex: 'type' },
            { title: '操作者', dataIndex: 'actorId', ellipsis: true },
          ]}
        />
      </Card>
    </Space>
  );
}
