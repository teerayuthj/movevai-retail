/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_VAPID_PUBLIC_KEY?: string;
  readonly VITE_RIDER_API_BASE_URL?: string;
  readonly VITE_APP_API_BASE_URL?: string;
  readonly VITE_RIDER_CODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
