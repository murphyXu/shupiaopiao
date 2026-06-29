import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { adminApiProxyPlugin } from './vite.adminProxy.js';

export default defineConfig({
  plugins: [react(), adminApiProxyPlugin()],
  base: './',
  server: {
    port: 5174,
  },
});
