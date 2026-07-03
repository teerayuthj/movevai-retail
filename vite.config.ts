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

function readLocalEnv() {
  const envPath = path.resolve(__dirname, '.env');
  if (!fs.existsSync(envPath)) return {};

  return Object.fromEntries(
    fs
      .readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const [key, ...valueParts] = line.split('=');
        return [key, valueParts.join('=').replace(/^['"]|['"]$/g, '')];
      }),
  ) as Record<string, string>;
}

// dev-only: surface "ลูกค้า" (customer.html) และ "messenger" (messenger.html) มี entry แยก
// แต่ใช้ path เดิม (/track*, /messenger*) — rewrite ให้ vite เสิร์ฟ entry ที่ถูกต้องแทน index.html (admin)
// production: ต้องตั้ง rewrite เดียวกันที่ hosting layer:
//   /track* + /customer-track* → /customer.html, /messenger* → /messenger.html, ที่เหลือ → /index.html
function surfaceEntryRouting() {
  const entryByPrefix: Array<{ prefixes: string[]; entry: string }> = [
    { prefixes: ['/track', '/customer-track'], entry: '/customer.html' },
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

async function sendDevPush(subscription: unknown, payload: unknown) {
  const localEnv = readLocalEnv();
  const publicKey = process.env.VAPID_PUBLIC_KEY ?? localEnv.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY ?? localEnv.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? localEnv.VAPID_SUBJECT ?? 'mailto:dev@example.com';

  if (!publicKey || !privateKey) throw new Error('missing VAPID keys');

  const webpushModule = await import('web-push');
  const webpush = webpushModule.default ?? webpushModule;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  await webpush.sendNotification(subscription, JSON.stringify(payload));
}

// dev-only: รับ push subscription จากมือถือ (ตอนกด "เปิดรับ Push") มาเซฟลงไฟล์บนเครื่อง dev
// เพื่อไม่ต้อง copy-paste subscription ข้ามเครื่องเอง — ใช้กับ scripts/send-push.mjs
function devPushSubscriptionSink() {
  return {
    name: 'dev-push-subscription-sink',
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

      server.middlewares.use('/__dev/push-subscription', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            const outPath = path.resolve(__dirname, 'scripts/push-subscription.json');
            fs.writeFileSync(outPath, JSON.stringify(parsed, null, 2));
            server.config.logger.info(`✓ บันทึก push subscription → ${outPath}`);
            res.statusCode = 204;
            res.end();
          } catch {
            res.statusCode = 400;
            res.end('invalid json');
          }
        });
      });

      server.middlewares.use('/__dev/push-test', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', () => {
          void (async () => {
            try {
              const parsed = JSON.parse(body) as { subscription?: unknown; payload?: unknown };
              if (!parsed.subscription || !parsed.payload) throw new Error('missing payload');
              await sendDevPush(parsed.subscription, parsed.payload);
              server.config.logger.info('✓ ยิง dev push test สำเร็จ');
              res.statusCode = 204;
              res.end();
            } catch (error) {
              server.config.logger.error(
                `✗ ยิง dev push test ไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`,
              );
              res.statusCode = 500;
              res.end('send failed');
            }
          })();
        });
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
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
    devPushSubscriptionSink(),
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
