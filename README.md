# Vibe Jam — Voice FPS Arena

## Local dev

```bash
npm install
npm run dev
```

**PartyKit (lobby / two-tab test):** in a second terminal:

```bash
npm run party:dev
```

Create `.env.local` in the project root:

```bash
VITE_PARTYKIT_HOST=localhost:1999
```

Rebuild or restart Vite after changing env vars. If you omit it, **`npm run dev` still assumes `localhost:1999`** so Create/Join stay enabled while PartyKit runs locally.

**Production (Vercel):** `VITE_PARTYKIT_HOST` must be set before build; there is no dev fallback on the deployed site.

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
