# Branding

> Name, voice, audience, visual identity. Fill this before calling the project "documented" —
> an agent writing copy, error messages, or marketing pages reads this to stay on-brand.

## Name & tagline
**findleads** — Turn overlooked local businesses into a focused outreach pipeline.

## Audience
Richard, operating solo, uses it to find and track local businesses that may need a website.
The product is a repeated-use operations console, not a public marketing site or general CRM.

## Voice & tone
Direct, factual, compact, and action-oriented. State Places data as a signal rather than a fact.
Example: "No website found on Google" — never "This business has no website."

## Visual identity
No logo yet; the lowercase wordmark is text. Geist is the sole UI family. Warm near-white and
ink neutrals support long scanning sessions; teal marks primary actions, blue marks links,
amber/red/green are reserved for operational status. Layout is dense, square-edged, and
table-led. Avoid editorial italics, marketing cards, gradients, oversized heroes, and decoration.

## Problem & solution (one paragraph each)
**Problem:** Local prospecting starts with noisy business directories and quickly becomes a
spreadsheet that does not show what has been contacted or what should happen next.

**Solution:** Search Google Places by category and location, retain each business as a durable
lead, and work the resulting queue with contact status, notes, job history, and CSV export.

## Product surface architecture

- `/leads` is the default work surface: pipeline metrics, a filtered queue, CRM edits.
- `/jobs` is acquisition and capacity: create a focused run, monitor it, export completed batches.
- Empty states route the operator to the next action. Explanatory "about" copy stays out of the
  recurring workflow.

## Verification

Check `/leads` and `/jobs` at 1440×900 and 390×844. Tables may scroll inside their own region but
must not create page-level horizontal overflow. Verify active navigation, search, all filters,
notes blur-save, contacted toggle, running/done/error/cap-hit states, and keyboard focus.

**2026-09-10 review: pass.** Verified with the real local Neon-backed dataset (400 businesses,
7 completed runs) at 1440×900 and 390×844. Both routes render without framework overlays or
page-level horizontal overflow; active navigation, required signal wording, 25-row pagination,
search, capacity metrics, and responsive form/table containers are present. Kept the quiet
table-led direction; removed the always-open product explainer and editorial italic treatment.

## 2026-09-11 usability iteration

**Primary task:** move through a practical call list without mentally combining separate
"No website" and "Phone ready" counts. The highest-value segment is an uncontacted business
with no website found on Google and a listed phone number; label this segment **Ready to call**.

**Interaction decisions:** show counts inside queue filters, default to Ready to call when that
segment exists, and offer a compact sort menu with priority, recently updated, rating, and name.
Keep filtering and sorting client-side at the current 400-row scale. Do not introduce bulk CRM
writes, lead scoring claims, or a new database field: priority is a transparent ordering over
existing Places and CRM data.

**Responsive decisions:** desktop remains table-led. Below the desktop breakpoint, render each
lead and run as an unframed, bordered work row with the same information and actions in reading
order; do not require horizontal scrolling to edit notes or inspect status. Controls must retain
stable heights and visible keyboard focus.

**Mutation feedback:** notes submit only when their value changed. Show Dirty, Saving, Saved,
or Save failed as actual state rather than permanent instructional copy.

**Verification:** recheck Ready to call derivation, every sort option, empty segments, page reset,
note dirty/save behavior, mobile lead and run rows, desktop tables, console errors, and page-level
overflow at 1440×900 and 390×844.

**2026-09-11 review: pass after revision.** At 390×844, the queue renders 10 complete work
rows per page and run history uses the same stacked information order; neither route has page-level
horizontal overflow. At 1440×900, the queue renders 25 rows and both routes retain compact tables.
The real 400-business dataset produced 78 Ready to call leads, 399 To contact, 1 Contacted, and
82 No website. Verified priority/name sorting, Contacted filtering, secure website links, no-op
note blur behavior, explicit Completed/Activity run labels, and a fresh browser console with no
application errors. Keep the restrained metric bands, segmented desktop filter, native mobile
menus, unframed repeated rows, and status-only pills; no additional decorative layer is warranted.
