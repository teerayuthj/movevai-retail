import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { Toaster } from '@/components/ui/sonner';
import 'leaflet/dist/leaflet.css';
import './index.css';

// admin เป็น web-only — service worker/native shell/push ย้ายไปผูกกับ entry messenger
// (src/main-messenger.tsx) แล้ว; SW เดิมที่เคย register จาก entry นี้จะ update ตัวเอง
// ตอน browser เช็ค /sw.js รอบถัดไป ไม่ต้อง unregister ที่นี่ (จะไปฆ่า push ของ messenger PWA)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <Toaster />
  </React.StrictMode>,
);
