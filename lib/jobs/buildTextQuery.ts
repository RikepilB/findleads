// Google's Text Search (New) documented query format composes category and
// location into one natural-language string ("pizza in New York", "shoe
// stores near Ottawa") — the only geographic-scoping mechanism available
// through the locked TextSearchParams interface (no locationBias/
// locationRestriction field; regionCode alone is a soft ranking bias, not a
// geographic filter). Never send category without location composed in.
export function buildTextQuery(category: string, location: string): string {
  return `${category} in ${location}`
}
