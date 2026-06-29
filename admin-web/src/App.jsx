import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { getToken } from './api/client';
import LoginPage from './pages/LoginPage';
import AppLayout from './pages/AppLayout';
import TodosPage from './pages/TodosPage';
import OrdersPage from './pages/OrdersPage';
import OrderDetailPage from './pages/OrderDetailPage';
import PoolPage from './pages/PoolPage';
import UsersPage from './pages/UsersPage';
import UserDetailPage from './pages/UserDetailPage';

function PrivateRoute({ children }) {
  if (!getToken()) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={(
            <PrivateRoute>
              <AppLayout />
            </PrivateRoute>
          )}
        >
          <Route index element={<Navigate to="/todos" replace />} />
          <Route path="todos" element={<TodosPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="orders/:orderId" element={<OrderDetailPage />} />
          <Route path="pool" element={<PoolPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="users/:userId" element={<UserDetailPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
