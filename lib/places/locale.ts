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
  { match: /\b(lima|peru)\b/i, languageCode: 'es', regionCode: 'PE' },
  // Canada before the UK rule so "London, Ontario" resolves en/CA, not en/GB
  // (find() scans in order).
  { match: /\b(toronto|ontario|canada)\b/i, languageCode: 'en', regionCode: 'CA' },
  { match: /\b(barcelona|madrid|spain|espana)\b/i, languageCode: 'es', regionCode: 'ES' },
  { match: /\b(london|england|uk|united kingdom)\b/i, languageCode: 'en', regionCode: 'GB' },
  { match: /\b(buenos aires|argentina)\b/i, languageCode: 'es', regionCode: 'AR' },
  { match: /\b(santiago|chile)\b/i, languageCode: 'es', regionCode: 'CL' },
]

export const DEFAULT_LOCALE = { languageCode: 'en', regionCode: 'CA' } as const

// JS \b is ASCII-word-based, so it doesn't treat accented letters (e.g. the
// "ú" in "Perú") as word characters — matching against a diacritic-stripped
// copy sidesteps that instead of hand-tuning each regex's boundaries.
// Combining Diacritical Marks block is U+0300..U+036F; built from code
// points (rather than a literal escape) so the source stays plain ASCII.
const COMBINING_DIACRITICS_START = 0x0300
const COMBINING_DIACRITICS_END = 0x036f
const COMBINING_DIACRITICS = new RegExp(
  `[${String.fromCodePoint(COMBINING_DIACRITICS_START)}-${String.fromCodePoint(COMBINING_DIACRITICS_END)}]`,
  'g',
)

function stripDiacritics(input: string): string {
  return input.normalize('NFD').replace(COMBINING_DIACRITICS, '')
}

export function inferLocale(freeTextLocation: string): {
  languageCode: string
  regionCode: string
} {
  const normalized = stripDiacritics(freeTextLocation)
  const rule = LOCALE_RULES.find((r) => r.match.test(normalized))
  return rule
    ? { languageCode: rule.languageCode, regionCode: rule.regionCode }
    : DEFAULT_LOCALE
}
