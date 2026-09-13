import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],

  base: '/',

  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },

  build: {
    // Build output sits next to frontend/ source — not inside the Python app
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },

  server: {
    port: 3000,
    proxy: {
      // Explicit 127.0.0.1, not 'localhost' — Node can resolve 'localhost' to
      // the IPv6 loopback (::1) first, which Flask (bound to 0.0.0.0, IPv4
      // only) never listens on, causing every proxied /api/* call to fail
      // with ECONNREFUSED even though the backend is up.
      '/api': 'http://127.0.0.1:5000',
    },
  },
});
