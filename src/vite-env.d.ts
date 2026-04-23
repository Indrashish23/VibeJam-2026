/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PARTYKIT_HOST: string | undefined
  /** e.g. ws://127.0.0.1:8765 — LAN listen relay (`npm run pvp:listen`) */
  readonly VITE_PVP_RELAY_URL: string | undefined
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
