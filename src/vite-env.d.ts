/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PARTYKIT_HOST: string | undefined
  /** e.g. ws://127.0.0.1:8765 — LAN listen relay (`npm run pvp:listen`) */
  readonly VITE_PVP_RELAY_URL: string | undefined
  /** When `true`, Tweaks panel mounts even if `VITE_PUBLIC_BUILD=true`. */
  readonly VITE_ENABLE_TWEAKS: string | undefined
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
