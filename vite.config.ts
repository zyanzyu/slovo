import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { handwritingMiddleware } from './server/handwriting.mjs';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'handwriting-proxy',
      configureServer(server) {
        server.middlewares.use('/api/handwriting', handwritingMiddleware);
      },
      configurePreviewServer(server) {
        server.middlewares.use('/api/handwriting', handwritingMiddleware);
      },
    },
  ],
  server: { host: '0.0.0.0', port: 4173 },
  preview: { host: '0.0.0.0', port: 4173 },
  build: { target: 'es2020', chunkSizeWarningLimit: 1200 },
});
