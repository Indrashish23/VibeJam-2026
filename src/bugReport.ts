/**
 * Bug reports open in a new tab (Google Form). Override with `VITE_BUG_REPORT_FORM_URL` — see `docs/bug-report-google-form.md`.
 */

/** Default: [RAGEBAIT FEEDBACK FORM](https://docs.google.com/forms/d/e/1FAIpQLSe9CAqUeIBrjXjhuZZlf5J-APZ7Nff88pUfVCqSEVm72obA7w/viewform) */
export const DEFAULT_BUG_REPORT_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSe9CAqUeIBrjXjhuZZlf5J-APZ7Nff88pUfVCqSEVm72obA7w/viewform?usp=dialog'

function buildContextBlock(context?: Record<string, string>): string {
  const lines = [
    `URL: ${typeof window !== 'undefined' ? window.location.href : ''}`,
    `Time: ${new Date().toISOString()}`,
  ]
  if (context) {
    for (const [k, v] of Object.entries(context)) {
      lines.push(`${k}: ${v}`)
    }
  }
  return lines.join('\n')
}

/**
 * Opens the bug report Google Form in a new tab.
 * Uses {@link DEFAULT_BUG_REPORT_FORM_URL} unless `VITE_BUG_REPORT_FORM_URL` is set.
 * Optionally set `VITE_BUG_FORM_ENTRY_CONTEXT` to `entry.<id>` to prefill a context field.
 */
export function openBugReport(context?: Record<string, string>): void {
  const formUrl =
    (import.meta.env.VITE_BUG_REPORT_FORM_URL as string | undefined)?.trim() ||
    DEFAULT_BUG_REPORT_FORM_URL

  let url = formUrl
  const entryKey = (import.meta.env.VITE_BUG_FORM_ENTRY_CONTEXT as string | undefined)?.trim()
  const block = buildContextBlock(context)
  if (entryKey && block) {
    const sep = url.includes('?') ? '&' : '?'
    url = `${url}${sep}${entryKey}=${encodeURIComponent(block)}`
  }

  window.open(url, '_blank', 'noopener,noreferrer')
}
