/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENABLE_OFFLINE_DIAGNOSTICS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
