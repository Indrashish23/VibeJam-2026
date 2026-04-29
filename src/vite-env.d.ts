/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PARTYKIT_HOST: string | undefined
  /** e.g. ws://127.0.0.1:8765 — LAN listen relay (`npm run pvp:listen`) */
  readonly VITE_PVP_RELAY_URL: string | undefined
  /** When `true`, Tweaks panel mounts even if `VITE_PUBLIC_BUILD=true`. */
  readonly VITE_ENABLE_TWEAKS: string | undefined
  /** Google Form viewform URL for in-game / lobby “Report a bug”. */
  readonly VITE_BUG_REPORT_FORM_URL: string | undefined
  /** e.g. `entry.1234567890` — paragraph field for auto context (see docs/bug-report-google-form.md). */
  readonly VITE_BUG_FORM_ENTRY_CONTEXT: string | undefined
  /** Webring exit-portal hub (full URL). Default: `https://vibejam.cc/portal/2026`. */
  readonly VITE_VIBEJAM_PORTAL_URL: string | undefined
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
