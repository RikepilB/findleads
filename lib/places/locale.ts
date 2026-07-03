// Design pattern, not sourced from Google docs (Google does not prescribe how to
// derive languageCode/regionCode from free text — this is this app's own logic).
// Flagged [ASSUMED] as a design choice — see 02-RESEARCH.md Open Question 1.
export interface LocaleRule {
  match: RegExp
  languageCode: string
  regionCode: string
}

// Seed list covers this phase's two explicit validation markets (Toronto,
// Lima). Extend this table as new markets are validated — do not build a
// geocoding dependency for this (see 02-RESEARCH.md Don't Hand-Roll).
export const LOCALE_RULES: LocaleRule[] = [
  { match: /\b(lima|per[uú])\b/i, languageCode: 'es', regionCode: 'PE' },
  { match: /\b(toronto|ontario|canada)\b/i, languageCode: 'en', regionCode: 'CA' },
]

export const DEFAULT_LOCALE = { languageCode: 'en', regionCode: 'CA' } as const

export function inferLocale(freeTextLocation: string): {
  languageCode: string
  regionCode: string
} {
  const rule = LOCALE_RULES.find((r) => r.match.test(freeTextLocation))
  return rule
    ? { languageCode: rule.languageCode, regionCode: rule.regionCode }
    : DEFAULT_LOCALE
}
