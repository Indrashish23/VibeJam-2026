# Windows desktop build (Electron)

The game is a Vite + Three.js SPA. The native **.exe** is a thin **Electron** shell that loads the same `dist` output as the web build.

## Quick commands

| Command | Purpose |
|--------|---------|
| `npm run electron:dev` | Vite dev server + Electron window (hot reload) |
| `npm run electron:build` | Production Vite build with `ELECTRON=1`, then **portable** Windows x64 `.exe` into `release/` |

## Build output

After `npm run electron:build`, look under **`release/`** for the **portable** executable (name includes the app version from `package.json`).

## Environment variables (baked at build time)

Vite inlines `VITE_*` at **build** time. For a production EXE, create **`.env.production`** in the project root (see [`.env.example`](../.env.example)) with the same values you use for a deployed web build.

| Variable | Role |
|----------|------|
| `VITE_PARTYKIT_HOST` | PartyKit WebSocket host (no `https://`, e.g. `your-project.partykit.dev` or `localhost:1999` for local server) |
| `VITE_PVP_RELAY_URL` | Optional; WebRTC / PvP relay if your build uses it ([`src/net/transportConfig.ts`](../src/net/transportConfig.ts)) |
| `VITE_PUBLIC_BUILD` | When `true`, production-style bundle (e.g. tweaks panel stripped) — same idea as Vercel production ([`scripts/vercel-build.mjs`](../scripts/vercel-build.mjs)) |

**Web vs desktop:** `npm run build` (default) uses `base: '/'` for normal hosting. `npm run build:electron` sets `ELECTRON=1` so Vite uses `base: './'` for `file://` loading inside Electron. You do not set `ELECTRON` in `.env` for this; the npm script sets it.

## Notes

- Unsigned Windows builds may trigger **SmartScreen**; code signing is a separate step.
- Online play against your PartyKit / relay hosts requires those hosts to be reachable from the machine running the EXE.

## Troubleshooting (Windows)

### “Online play isn’t available right now” in the EXE

Production builds **do not** fall back to `localhost:1999` (that dev-only shortcut is disabled when `import.meta.env.PROD` is true — see `src/net/partyKitHost.ts`). If you packaged the EXE **without** setting `VITE_PARTYKIT_HOST`, the lobby hides online modes **unless** you use one of the fixes below.

**Fix A — bake at build (same as web):**

1. Copy [`.env.example`](../.env.example) or [`.env.production.example`](../.env.production.example) to **`.env.production`** in the project root.
2. Set `VITE_PARTYKIT_HOST` to your deployed PartyKit host (same value as Vercel / web prod — **no** `https://` prefix).
3. Run **`npm run electron:build`** again and use the new `.exe` under `release/`.

**Fix B — no rebuild (portable EXE):** Next to the folder that contains `Vibe Jam.exe`, create **`Assets/Config/partykit-host.txt`** with a **single line** (no `https://`), e.g. `my-room.myuser.partykit.dev`. Copy from [partykit-host.example.txt](../Assets/Config/partykit-host.example.txt). Electron reads this at startup and injects `window.__PARTYKIT_HOST` (see `electron/main.cjs` + `electron/preload.cjs`).

**Fix C — launch env:** Start the exe from a shell with `VITE_PARTYKIT_HOST` or `PARTYKIT_HOST` set (same host string as above).

Local PartyKit: run `npm run party:dev`, use `localhost:1999` in `.env.production` (Fix A) or in `partykit-host.txt` (Fix B), rebuild if using A.

- **`electron-builder` fails extracting `winCodeSign` / symlink errors:** The project sets `signAndEditExecutable: false` under `build.win` in `package.json` so packaging does not require creating symlinks for signing tools (which can fail without Developer Mode or elevation). If you add real code signing later, you may re-enable signing and use an environment that supports those symlinks.
