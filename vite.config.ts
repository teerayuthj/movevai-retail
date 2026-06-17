import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'path';

function readBackendInternalKey() {
  const backendEnvPath = path.resolve(__dirname, '../movevai-retail-backend/.env');
  if (!fs.existsSync(backendEnvPath)) return undefined;

  const envText = fs.readFileSync(backendEnvPath, 'utf8');
  const line = envText
    .split(/\r?\n/)
    .find((current) => current.trim().startsWith('INTERNAL_API_KEY='));

  if (!line) return undefined;
  const [, rawValue = ''] = line.split('=', 2);
  return rawValue.trim();
}

const internalApiKey = process.env.INTERNAL_API_KEY ?? readBackendInternalKey();

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5174,
    host: true,
    proxy: {
      '/api/ai': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/api\/ai/, '/v1/ai'),
        headers: internalApiKey ? { 'x-internal-key': internalApiKey } : undefined,
      },
    },
  },
});
