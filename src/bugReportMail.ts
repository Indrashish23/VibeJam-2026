/** Low-tech bug reports: opens the user's mail client (no server). */
export const BUG_REPORT_EMAIL = 'afkstudiocontact@gmail.com'

/**
 * Opens `mailto:` with a short template body. `context` lines are appended as `Key: value`.
 */
export function openBugReportEmail(context?: Record<string, string>): void {
  const lines = [
    'What happened:',
    '',
    '(describe the bug above this line)',
    '',
    '---',
    `URL: ${typeof window !== 'undefined' ? window.location.href : ''}`,
    `Time: ${new Date().toISOString()}`,
  ]
  if (context) {
    for (const [k, v] of Object.entries(context)) {
      lines.push(`${k}: ${v}`)
    }
  }
  const subject = encodeURIComponent('Vibe Jam — bug report')
  const body = encodeURIComponent(lines.join('\n'))
  window.location.href = `mailto:${BUG_REPORT_EMAIL}?subject=${subject}&body=${body}`
}
