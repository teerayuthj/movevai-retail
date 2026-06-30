import React from 'react';
import ReactDOM from 'react-dom/client';
import { CustomerTrackingPage } from '@/pages/CustomerTracking';
import { Toaster } from '@/components/ui/sonner';
import './index.css';

// Entry แยกของ surface "ลูกค้า" (/track, /customer-track)
// เป็นหน้า public read-only — ไม่โหลด admin dashboard, messenger, native shell, หรือ service worker
// (ดู vite.config.ts → multi-entry input + dev rewrite /track* → customer.html)
function CustomerApp() {
  const [pathname, setPathname] = React.useState(() => window.location.pathname);

  React.useEffect(() => {
    const syncPathname = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', syncPathname);
    return () => window.removeEventListener('popstate', syncPathname);
  }, []);

  return <CustomerTrackingPage pathname={pathname} />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CustomerApp />
    <Toaster />
  </React.StrictMode>,
);
