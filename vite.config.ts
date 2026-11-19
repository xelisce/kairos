import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // The local database server (server/index.mjs) answers /api.
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:5175' } },
});
