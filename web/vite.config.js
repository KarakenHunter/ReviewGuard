import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development/preview the browser talks to this origin and Vite forwards /api to Express,
// so no CORS is involved locally. In production set VITE_API_URL to the Render backend URL.
const proxy = { '/api': { target: process.env.VITE_DEV_API || 'http://127.0.0.1:8000', changeOrigin: true } };
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy },
  preview: { port: 4173, proxy },
  build: { rollupOptions: { output: { manualChunks: { charts: ['recharts'], vendor: ['react', 'react-dom', 'react-router-dom', 'axios'] } } } },
  test: { environment: 'node' },
});
