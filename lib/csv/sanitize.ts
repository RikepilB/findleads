import 'server-only'

// OWASP CSV Injection mitigation: prefix (never strip) any cell whose value
// starts with a character a spreadsheet app would interpret as a formula
// trigger. Stripping would corrupt legitimate data (e.g. a business literally
// named "-10% off"); prefixing preserves the original value while defusing
// the leading character.
const DANGEROUS_PREFIXES = ['=', '+', '-', '@']

export function sanitizeCsvCell(value: string): string {
  return DANGEROUS_PREFIXES.some((prefix) => value.startsWith(prefix))
    ? `'${value}`
    : value
}
