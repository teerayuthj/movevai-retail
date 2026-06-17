import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
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
  plugins: [
    react(),
    // PWA: ทำให้ "เปิดแอป Rider" ติดตั้งลงหน้าจอมือถือได้ + offline app-shell
    // (ระยะ 2 ส่วนที่ไม่ต้องมี backend — ดู CLAUDE.md / rider architecture)
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['apple-touch-icon.png', 'rider-icon.svg'],
      manifest: {
        name: 'MoveVai Rider',
        short_name: 'Rider',
        description: 'แอปสำหรับ rider — รับงาน ส่งของ และปิดงานของตัวเอง',
        lang: 'th',
        // เปิดจากหน้าจอ home แล้วเข้า surface ของ rider ตรงๆ
        start_url: '/rider',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffffff',
        theme_color: '#16a34a',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // cache app-shell + assets ที่ Vite build (hashed) เพื่อให้เปิดได้ตอนเน็ตหลุด
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
      },
      devOptions: {
        // ให้ทดสอบ PWA บน dev server ได้ (npm run dev)
        enabled: true,
        type: 'module',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5174,
    host: true,
    // อนุญาตให้เปิดผ่าน ngrok (สำหรับทดสอบ PWA บนมือถือจริงผ่าน HTTPS)
    allowedHosts: ['.ngrok-free.app', '.ngrok.app', '.ngrok.io'],
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
