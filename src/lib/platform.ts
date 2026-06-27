import { Capacitor } from '@capacitor/core';

/**
 * true เมื่อรันใน Capacitor native shell (iOS/Android), false บน web/PWA ปกติ.
 * ใช้ซ่อน UI ที่มีไว้สำหรับ web PWA เท่านั้น เช่น "เพิ่มลงหน้าจอโฮม" / Web Push
 * (ใน native แอปติดตั้งจาก store แล้ว + Web Push ใช้ใน WKWebView ไม่ได้).
 */
export const isNativeApp = Capacitor.isNativePlatform();
