/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public website the portal treats as home (default https://medicaltourismaustralia.com). */
  readonly VITE_HOME_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
