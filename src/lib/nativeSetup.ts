import { Capacitor } from '@capacitor/core';

/**
 * ตั้งค่าเฉพาะตอนรันใน Capacitor native shell (iOS/Android).
 * บน web ปกติฟังก์ชันนี้ไม่ทำอะไร (guard ด้วย isNativePlatform).
 *
 * ปัญหาที่แก้: iOS ตั้ง default ให้ status bar "overlay" ทับ WebView + index.html ใช้
 * viewport-fit=cover → เนื้อหา (เช่นปุ่ม hamburger บน topbar) ยืดขึ้นไปอยู่ใต้ status bar
 * แล้วโดน iOS กิน touch ทำให้กดไม่ได้. สั่ง overlaysWebView(false) ให้ WebView ขยับลงมา
 * ใต้ status bar — แก้ทุกหน้าทีเดียวโดยไม่ต้องไล่ใส่ safe-area CSS ราย header.
 */
export async function setupNativeShell() {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setOverlaysWebView({ overlay: false });
    // header แอปเป็นพื้นสว่าง → ใช้ตัวอักษร status bar สีเข้มให้อ่านออก
    await StatusBar.setStyle({ style: Style.Light });
  } catch (error) {
    // ไม่ critical — ถ้า plugin ไม่พร้อมก็ปล่อยให้แอปรันต่อ
    console.warn('[nativeSetup] status bar setup skipped:', error);
  }
}
