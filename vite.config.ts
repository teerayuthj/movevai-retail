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

const messengerManifest = {
  name: 'MoveVai Messenger',
  short_name: 'Messenger',
  description: 'แอปสำหรับ messenger — รับงาน ส่งของ และปิดงานของตัวเอง',
  lang: 'th',
  // เปิดจากหน้าจอ home แล้วเข้า surface ของ messenger ตรงๆ
  start_url: '/messenger',
  scope: '/',
  display: 'standalone' as const,
  orientation: 'portrait' as const,
  background_color: '#ffffff',
  theme_color: '#16a34a',
  icons: [
    { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
    { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
    { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};

// dev-only: surface "ลูกค้า" (customer.html) และ "messenger" (messenger.html) มี entry แยก
// แต่ใช้ path เดิม (/t*, /track*, /messenger*) — rewrite ให้ vite เสิร์ฟ entry ที่ถูกต้องแทน index.html (admin)
// production: ต้องตั้ง rewrite เดียวกันที่ hosting layer:
//   /t/* + /track* + /customer-track* → /customer.html, /messenger* → /messenger.html, ที่เหลือ → /index.html
function surfaceEntryRouting() {
  const entryByPrefix: Array<{ prefixes: string[]; entry: string }> = [
    // '/t' = ลิงก์ติดตามแบบสั้น (/t/:trackingCode) ที่ส่งให้ลูกค้าทาง SMS/LINE
    { prefixes: ['/t', '/track', '/customer-track'], entry: '/customer.html' },
    { prefixes: ['/messenger'], entry: '/messenger.html' },
  ];

  const matchEntry = (pathname: string) =>
    entryByPrefix.find(({ prefixes }) =>
      prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)),
    )?.entry;

  return {
    name: 'surface-entry-routing',
    apply: 'serve' as const,
    configureServer(server: import('vite').ViteDevServer) {
      server.middlewares.use((req, _res, next) => {
        const pathname = (req.url ?? '').split('?')[0];
        const entry = matchEntry(pathname);
        if (entry) {
          req.url = entry;
        }
        next();
      });
    },
  };
}

// capacitor-only: native app ต้อง boot เข้า messenger surface (ไม่ใช่ admin)
// Capacitor WebView เปิด index.html เสมอ → หลัง build เสร็จ copy messenger.html ทับ index.html
// (asset path เป็น absolute /assets/... จึง copy ได้ตรงๆ)
function nativeEntryAlias() {
  return {
    name: 'native-entry-alias',
    apply: 'build' as const,
    closeBundle() {
      const distDir = path.resolve(__dirname, 'dist');
      fs.copyFileSync(path.resolve(distDir, 'messenger.html'), path.resolve(distDir, 'index.html'));
    },
  };
}

// VitePWA ปิด dev service worker ไว้ จึงเสิร์ฟ manifest ของ Messenger เองใน dev
function devMessengerManifest() {
  return {
    name: 'dev-messenger-manifest',
    apply: 'serve' as const,
    configureServer(server: import('vite').ViteDevServer) {
      server.middlewares.use('/manifest.webmanifest', (req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          next();
          return;
        }
        res.setHeader('content-type', 'application/manifest+json');
        res.end(JSON.stringify(messengerManifest));
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  // Vite โหลด .env.capacitor หลัง config และอาจทับ VITE_* ที่ส่งจาก shell ได้
  // จึงส่ง CAP_API_BASE ผ่าน define โดยตรง: simulator ใช้ localhost, Android emulator ใช้ 10.0.2.2
  define: {
    __MOVEVAI_CAP_API_BASE__: JSON.stringify(
      mode === 'capacitor' ? (process.env.CAP_API_BASE ?? '') : '',
    ),
  },
  build: {
    rollupOptions: {
      input:
        mode === 'capacitor'
          ? {
              // native bundle มีเฉพาะ messenger surface — ไม่แบก admin code
              // (customer tracking เข้าถึงได้ผ่าน lazy chunk ใน messenger entry)
              messenger: path.resolve(__dirname, 'messenger.html'),
            }
          : {
              // admin (web-only)
              main: path.resolve(__dirname, 'index.html'),
              // surface "ลูกค้า" เป็น entry/bundle แยก → ลูกค้าไม่ต้องโหลด JS ของ admin
              customer: path.resolve(__dirname, 'customer.html'),
              // surface "messenger" — mobile app จริง; บน web ใช้ทดสอบผ่าน /messenger*
              messenger: path.resolve(__dirname, 'messenger.html'),
            },
    },
  },
  plugins: [
    react(),
    surfaceEntryRouting(),
    ...(mode === 'capacitor' ? [nativeEntryAlias()] : []),
    devMessengerManifest(),
    // PWA: ทำให้ "เปิดแอป Messenger" ติดตั้งลงหน้าจอมือถือได้ + offline app-shell
    // (ระยะ 2 ส่วนที่ไม่ต้องมี backend — ดู CLAUDE.md / messenger architecture)
    VitePWA({
      // injectManifest: ใช้ custom service worker (src/sw.ts) เพื่อรองรับ push/notificationclick
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectRegister: false,
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'messenger-icon.svg'],
      manifest: messengerManifest,
      injectManifest: {
        // precache app-shell + assets ที่ Vite build (hashed) เพื่อให้เปิดได้ตอนเน็ตหลุด
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
      devOptions: {
        // dev ใช้ manual SW registration ใน src/registerServiceWorker.ts
        // เพื่อให้ iPhone รับ custom push handler โดยตรง ไม่ใช้ /dev-sw.js?dev-sw ของ plugin
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // เคารพ PORT จาก tooling (เช่น preview launcher) ก่อน แล้วค่อย fallback ค่า default
    port: process.env.PORT ? Number(process.env.PORT) : 5174,
    host: true,
    headers: {
      'Service-Worker-Allowed': '/',
    },
    // อนุญาตให้เปิดผ่าน ngrok (สำหรับทดสอบ PWA บนมือถือจริงผ่าน HTTPS)
    allowedHosts: ['.ngrok-free.app', '.ngrok.app', '.ngrok.io'],
    proxy: {
      '/api/messenger': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        // backend ยังเสิร์ฟที่ /v1/rider — proxy alias /api/messenger → /v1/rider
        rewrite: (requestPath) => requestPath.replace(/^\/api\/messenger/, '/v1/rider'),
        headers: internalApiKey ? { 'x-internal-key': internalApiKey } : undefined,
      },
      '/api/app': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/api\/app/, '/v1/app'),
        headers: internalApiKey ? { 'x-internal-key': internalApiKey } : undefined,
      },
      '/api/ai': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/api\/ai/, '/v1/ai'),
        headers: internalApiKey ? { 'x-internal-key': internalApiKey } : undefined,
      },
    },
  },
}));
