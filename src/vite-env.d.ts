/// <reference types="vite/client" />

declare const __MOVEVAI_CAP_API_BASE__: string;

interface ImportMetaEnv {
  readonly VITE_VAPID_PUBLIC_KEY?: string;
  readonly VITE_MESSENGER_API_BASE_URL?: string;
  readonly VITE_APP_API_BASE_URL?: string;
  readonly VITE_CUSTOMER_TRACKING_PUBLIC_ORIGIN?: string;
  readonly VITE_MESSENGER_CODE?: string;
  readonly VITE_DELIVERY_REPORT_API_ENABLED?: string;
  // 'true' = โชว์บัญชีตัวอย่าง/ปุ่มกรอกอัตโนมัติบนหน้า messenger login (native/prod build)
  readonly VITE_SHOW_TEST_LOGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
