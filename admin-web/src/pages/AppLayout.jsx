import React from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Layout, Menu, Typography, Button } from 'antd';
import {
  CheckSquareOutlined,
  ShoppingOutlined,
  BookOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { setToken } from '../api/client';

const { Header, Sider, Content } = Layout;

const items = [
  { key: '/todos', icon: <CheckSquareOutlined />, label: '待办' },
  { key: '/orders', icon: <ShoppingOutlined />, label: '订单' },
  { key: '/pool', icon: <BookOutlined />, label: '在漂书籍' },
  { key: '/users', icon: <UserOutlined />, label: '用户' },
];

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider breakpoint="lg" collapsedWidth={64}>
        <div style={{ color: '#fff', padding: '16px 20px', fontWeight: 600 }}>书漂漂运营</div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname.startsWith('/orders') ? '/orders' : location.pathname.startsWith('/users') ? '/users' : location.pathname]}
          items={items}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 24px' }}>
          <Typography.Text type="secondary">内部运营后台</Typography.Text>
          <Button
            onClick={() => {
              setToken('');
              navigate('/login', { replace: true });
            }}
          >
            退出
          </Button>
        </Header>
        <Content style={{ margin: 24 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
