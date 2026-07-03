/**
 * Google Maps Platform attribution (SEC-03).
 *
 * Required text is the literal "Google Maps" — an earlier draft of the UI-SPEC used a
 * different, non-standard attribution string; this was corrected against the official
 * developers.google.com/maps/documentation/places/web-service/policies page. Do not
 * reintroduce the old wording.
 * Plain, un-linked text satisfies the requirement when no interactive map is shown.
 * Must never be smaller than 12px, recolored, or hidden behind a collapsed menu.
 */
export default function GoogleAttribution() {
  return <p className="text-xs text-[#5E5E5E]">Google Maps</p>;
}
