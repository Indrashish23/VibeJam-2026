# Vibe Jam — Voice FPS Arena

**Players** only open the deployed game URL — Create lobby, copy the code, join. No in-game setup.

**Operators** (who ship the site): multiplayer requires a realtime endpoint baked into the production build. Set **`VITE_PARTYKIT_HOST`** on your host (e.g. Vercel) before `npm run build`, then deploy. See **Deploy** below.

## Local dev

```bash
npm install
npm run dev
```

**Both Vite + PartyKit in one terminal (maintainers):**

```bash
npm run dev:online
```

**PartyKit (lobby / two-tab test):** alternatively, in a second terminal:

```bash
npm run party:dev
```

Create `.env.local` in the project root:

```bash
VITE_PARTYKIT_HOST=localhost:1999
```

Rebuild or restart Vite after changing env vars. If you omit it, **`npm run dev` still assumes `localhost:1999`** so Create/Join stay enabled while PartyKit runs locally.

**Production (Vercel):** `VITE_PARTYKIT_HOST` must be set before build; there is no dev fallback on the deployed site.

**Troubleshooting “Online isn’t available” on the live URL:** In Vercel → your project → **Settings → Environment Variables**, add **`VITE_PARTYKIT_HOST`** = your PartyKit host (e.g. `my-room.myuser.partykit.dev`, no `https://`). Apply to **Production**, then trigger a **new deployment** so the client is rebuilt with that value.

**Temporary workaround** (no redeploy): open the game once as  
`https://your-site.vercel.app/?pk=your-deployment.partykit.dev`  
— the host is saved for that browser tab session.

## Deploy

### 1. PartyKit (realtime lobby)

```bash
npm run party:deploy
```

Copy the production host (e.g. `your-project.your-user.partykit.dev`) from the CLI output.

### 2. Vercel (game client)

1. Import this repo in [Vercel](https://vercel.com) (or `vercel link` + `vercel --prod`).
2. Under **Settings → Environment Variables**, add **`VITE_PARTYKIT_HOST`** = your PartyKit host (no `https://`). Apply to **Production** (and **Preview** if you want PR previews to use a dev PartyKit host).
3. **Redeploy** after adding env vars so Vite can inline `import.meta.env.VITE_PARTYKIT_HOST` at build time.
4. Open the production URL in **two tabs**: tab A **Create lobby**, tab B **Join** with the code; host **Start match** when both are connected.

Voice clips stay in the browser only (no DB, no audio over PartyKit in this phase).
