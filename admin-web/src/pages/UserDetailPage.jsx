import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Button, Card, Descriptions, Input, InputNumber, Space, message,
} from 'antd';
import { callAdmin } from '../api/client';

export default function UserDetailPage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [coinDelta, setCoinDelta] = useState(0);
  const [creditDelta, setCreditDelta] = useState(0);
  const [reason, setReason] = useState('');

  async function load() {
    setLoading(true);
    try {
      const res = await callAdmin('admin.users.detail', { userId });
      setDetail(res);
    } catch (err) {
      message.error(err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [userId]);

  async function adjust(type) {
    if (!reason.trim()) {
      message.warning('请填写调整原因');
      return;
    }
    try {
      if (type === 'coin') {
        await callAdmin('admin.users.adjustCoin', { userId, delta: coinDelta, reason });
      } else {
        await callAdmin('admin.users.adjustCredit', { userId, delta: creditDelta, reason });
      }
      message.success('调整成功');
      setReason('');
      load();
    } catch (err) {
      message.error(err.message || '调整失败');
    }
  }

  const user = detail?.user;

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card loading={loading} title="用户详情" extra={<Button onClick={() => navigate(-1)}>返回</Button>}>
        {user && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="昵称">{user.nickname}</Descriptions.Item>
            <Descriptions.Item label="用户 ID">{user.id}</Descriptions.Item>
            <Descriptions.Item label="公益积分">{user.availableCoin}（冻结 {user.coinFrozen}）</Descriptions.Item>
            <Descriptions.Item label="信用分">{user.creditScore}</Descriptions.Item>
            <Descriptions.Item label="在途订单">{user.activeClaimCount}</Descriptions.Item>
            <Descriptions.Item label="书架容量">{user.shelfLimit}</Descriptions.Item>
            <Descriptions.Item label="申诉受限">{user.disputeRestricted ? '是' : '否'}</Descriptions.Item>
            <Descriptions.Item label="注册时间">{user.createdAt}</Descriptions.Item>
          </Descriptions>
        )}
      </Card>

      <Card title="积分 / 信用调整">
        <Space direction="vertical" style={{ width: '100%' }}>
          <Space wrap>
            <span>公益积分增减</span>
            <InputNumber value={coinDelta} onChange={setCoinDelta} />
            <Button type="primary" onClick={() => adjust('coin')}>提交积分调整</Button>
          </Space>
          <Space wrap>
            <span>信用分增减</span>
            <InputNumber value={creditDelta} onChange={setCreditDelta} />
            <Button onClick={() => adjust('credit')}>提交信用调整</Button>
          </Space>
          <Input.TextArea rows={2} placeholder="调整原因" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Space>
      </Card>

      <Card title="最近漂流" loading={loading}>
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{JSON.stringify(detail?.recentDrifts || [], null, 2)}</pre>
      </Card>
    </Space>
  );
}
