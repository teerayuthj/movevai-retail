// ตัวยิง Web Push จาก Mac → ไปเด้งที่เครื่องที่ subscribe ไว้ (เช่น iPhone) แม้ปิดแอปอยู่
// นี่คือ "ปุ่มบน Mac" — ของจริงตรงนี้จะย้ายไปอยู่ใน backend ตอนมีงานเข้า
//
// วิธีใช้:
//   1) บนมือถือ: เปิด PWA → กด "เปิดรับ Push ข้ามเครื่อง" → copy subscription
//   2) วาง JSON ลงไฟล์ scripts/push-subscription.json
//   3) บน Mac: npm run push:send   (หรือ npm run push:send -- "หัวข้อ" "เนื้อหา")
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import webpush from 'web-push';

const here = dirname(fileURLToPath(import.meta.url));

const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error('✗ ขาด VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY — รันผ่าน npm run push:send (โหลด .env ให้)');
  process.exit(1);
}

webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:dev@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const subPath = resolve(here, 'push-subscription.json');
let subscription;
try {
  subscription = JSON.parse(readFileSync(subPath, 'utf8'));
} catch {
  console.error(`✗ อ่าน ${subPath} ไม่ได้ — วาง subscription JSON จากมือถือลงไฟล์นี้ก่อน`);
  process.exit(1);
}

const [, , titleArg, bodyArg] = process.argv;
const payload = JSON.stringify({
  title: titleArg || 'มีงานใหม่เข้ามา 🛵',
  body: bodyArg || 'ORD-2048 · คุณสมชาย ใจดี · แตะเพื่อเปิดดูงาน',
  url: '/rider/assigned',
  tag: 'rider-new-job',
});

try {
  await webpush.sendNotification(subscription, payload);
  console.log('✓ ส่ง push สำเร็จ — เช็คที่เครื่องที่ subscribe ไว้');
} catch (err) {
  console.error('✗ ส่งไม่สำเร็จ:', err.statusCode ?? '', err.body ?? err.message);
  if (err.statusCode === 410 || err.statusCode === 404) {
    console.error('  subscription หมดอายุ/ถูกถอน — subscribe ใหม่บนมือถือแล้วอัปเดตไฟล์');
  }
  process.exit(1);
}
