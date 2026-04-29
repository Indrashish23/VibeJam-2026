/**
 * Build-time flag: when `VITE_PUBLIC_BUILD=true` is set in the build environment
 * (Vercel "Production" env var on the `prod` branch), Vite inlines this constant as
 * `true` and dead-code-eliminates dev-only branches such as the Tweaks panel mount
 * and MP debug logging. Leave unset for normal `vite build` / preview deployments.
 */
export const IS_PUBLIC_BUILD: boolean = import.meta.env.VITE_PUBLIC_BUILD === 'true'
