// Intl.RelativeTimeFormat, no date library — per 05-RESEARCH.md Don't
// Hand-Roll. Shared by app/jobs/page.tsx and app/leads/page.tsx (was
// duplicated in both). Deliberately directive-free (no 'server-only') so it
// stays unit-testable — the app/jobs/isTerminalStatus.ts pattern.
export function relativeTime(date: Date, now: () => number = Date.now): string {
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  const diffMs = date.getTime() - now()

  const diffMin = Math.round(diffMs / 60_000)
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, 'minute')

  const diffHour = Math.round(diffMs / 3_600_000)
  if (Math.abs(diffHour) < 24) return rtf.format(diffHour, 'hour')

  const diffDay = Math.round(diffMs / 86_400_000)
  return rtf.format(diffDay, 'day')
}
