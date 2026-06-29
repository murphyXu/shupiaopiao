import fs from 'fs';
import path from 'path';

const TOKEN_KEY = 'spp_admin_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

function adminMode() {
  const mode = import.meta.env.VITE_ADMIN_MODE || 'proxy';
  if (import.meta.env.VITE_API_BASE) return 'http';
  return mode;
}

function apiUrl() {
  const mode = adminMode();
  if (mode === 'http') return import.meta.env.VITE_API_BASE;
  return '/admin-api';
}

export async function callAdmin(action, data = {}) {
  const url = apiUrl();
  if (!url) throw new Error('请配置 VITE_API_BASE 或使用 proxy 模式（npm run dev / npm run start）');

  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, data }),
  });
  const json = await res.json();
  if (!json || json.code !== 0) {
    const err = new Error((json && json.msg) || '请求失败');
    err.code = json && json.code;
    throw err;
  }
  return json.data;
}
