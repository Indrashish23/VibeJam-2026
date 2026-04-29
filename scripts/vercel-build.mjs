/**
 * Vercel build entry. When VERCEL_ENV=production (the production branch, e.g. `main`),
 * we bake `VITE_PUBLIC_BUILD=true` so Vite + tree-shaking strip the tweaks panel,
 * MP debug overlay, dev keybinds (R/1/2/3), and the diagnostic globals from the
 * production bundle. Preview deploys (e.g. `dev` branch, PR previews) build with
 * tweaks intact so we can keep iterating on a separate URL.
 *
 * Why a wrapper instead of Vercel UI env vars: keeps the prod-vs-preview split
 * declarative in the repo so non-technical contributors can ship without touching
 * the Vercel dashboard.
 */
import { spawn } from 'node:child_process'

const vercelEnv = process.env.VERCEL_ENV ?? '(none)'
const isProd = process.env.VERCEL_ENV === 'production'

const env = { ...process.env }
if (isProd) env.VITE_PUBLIC_BUILD = 'true'

console.log(
  `[vercel-build] VERCEL_ENV=${vercelEnv} -> VITE_PUBLIC_BUILD=${env.VITE_PUBLIC_BUILD ?? '(unset)'}`,
)

const child = spawn('npm', ['run', 'build'], {
  stdio: 'inherit',
  env,
  shell: true,
})

child.on('exit', (code) => {
  process.exit(code ?? 1)
})
