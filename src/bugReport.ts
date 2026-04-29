/**
 * Bug reports open in a new tab (Google Form). Configure via env — see `docs/bug-report-google-form.md`.
 */

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
 * Set `VITE_BUG_REPORT_FORM_URL` to the form’s **viewform** link.
 * Optionally set `VITE_BUG_FORM_ENTRY_CONTEXT` to `entry.<id>` for the “Context” question to prefill.
 */
export function openBugReport(context?: Record<string, string>): void {
  const formUrl = (import.meta.env.VITE_BUG_REPORT_FORM_URL as string | undefined)?.trim()
  if (!formUrl) {
    console.warn(
      '[bugReport] Set VITE_BUG_REPORT_FORM_URL in .env to your Google Form viewform URL (see docs/bug-report-google-form.md).',
    )
    return
  }

  let url = formUrl
  const entryKey = (import.meta.env.VITE_BUG_FORM_ENTRY_CONTEXT as string | undefined)?.trim()
  const block = buildContextBlock(context)
  if (entryKey && block) {
    const sep = url.includes('?') ? '&' : '?'
    url = `${url}${sep}${entryKey}=${encodeURIComponent(block)}`
  }

  window.open(url, '_blank', 'noopener,noreferrer')
}
