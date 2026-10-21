/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly USE_MOCKS?: string;
  readonly DEMO_MODE?: string;
  readonly VITE_API_PROXY_TARGET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
