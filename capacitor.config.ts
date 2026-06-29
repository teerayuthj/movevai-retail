import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.movevai.retail',
  appName: 'MoveVai Retail',
  // Vite build output — `npm run build` ออกที่ dist/
  webDir: 'dist',
  // สำหรับ dev live-reload บนเครื่องจริง/emulator:
  //   1) ตั้ง CAP_SERVER_URL=http://<ip-เครื่อง dev>:5174
  //   2) npm run dev (vite host:true อยู่แล้ว)
  //   3) npx cap sync && npx cap run ios|android
  // production build อย่าตั้ง env นี้ — จะ bundle dist/ เข้า native app ตรง ๆ
  server: process.env.CAP_SERVER_URL
    ? { url: process.env.CAP_SERVER_URL, cleartext: true }
    : undefined,
  plugins: {
    // ให้ iOS เด้ง banner/เสียง/badge แม้แอปเปิดอยู่ foreground
    // (default ของ iOS คือ "เงียบ" ตอน foreground — ต้องเปิดตรงนี้)
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
