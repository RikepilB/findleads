# Phase 5: CRM Leads Dashboard - Research

**Researched:** 2026-07-03
**Domain:** Next.js App Router CRM UI (Server Components + Server Actions) over an existing Drizzle/Neon data layer; Google Maps attribution compliance
**Confidence:** HIGH (codebase-grounded findings, official-docs-verified); MEDIUM on testing-strategy and SCRAPE-07 heuristic recommendations (judgment calls, not single-answer facts)

## Summary

Phase 5 is pure additive work on top of an already-complete, well-tested data/worker layer (Phases 1-4). No new external service integrations are needed — this phase is Server Components reading `businesses`/`jobs`, two new Server Actions, a handful of new DAL functions, and a client-side poller so Job History behaves live. `05-UI-SPEC.md` is the locked visual/copy contract; this research does not relitigate it except where it makes a factual claim that conflicts with a verifiable source — two such conflicts were found (attribution copy, SCRAPE-07 heuristic accuracy) and are flagged prominently below, not buried.

**Primary recommendation:** Build `app/leads/page.tsx` and `app/jobs/page.tsx` as async Server Components per `ARCHITECTURE.md`'s already-locked structure, add four new DAL functions (`listBusinesses`, `updateBusinessNotes`, `setBusinessContacted`, `listJobs`) following the exact upsert/timestamp pattern already established in `lib/db/businesses.ts`, keep Server Actions as thin validate-then-DAL-then-`revalidatePath` wrappers, and add one small client component to poll `GET /api/jobs/[id]` for any non-terminal job — without it, the JOB-04/JOB-05 continuation/watchdog mechanisms this phase's UI surfaces have no trigger.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SCRAPE-07 | UI surfaces "60+ results found..." message when cap is hit | See Pitfall 1 — UI-SPEC's `leads_found >= 60` heuristic has a false-negative failure mode from closed-business filtering; two remediation options given, Option B recommended |
| CRM-01 | Leads list reads from `businesses`, shows tier, contacted, notes | `listBusinesses()` DAL function (new) + tier derived at query time from `website IS NULL`, no new column needed |
| CRM-02 | Add/edit freeform notes per business | `updateBusinessNotes()` DAL function (new) + `updateNotesAction` Server Action |
| CRM-03 | Toggle contacted/not-contacted per business | `setBusinessContacted()` DAL function (new) + `setContactedAction` Server Action |
| CRM-04 | Notes/contacted changes timestamped (`updated_at`) | Both new DAL functions MUST explicitly set `updatedAt: new Date()` — Drizzle does not auto-bump `.notNull().defaultNow()` columns on `UPDATE`, only on `INSERT` |
| CRM-05 | Job history list: status, category/location, leads found, created_at | `listJobs()` DAL function (new, does not exist yet) |
| SEC-03 | Google Maps attribution visible on any UI showing Places content | Verified against official policy page — see Pitfall 2. UI-SPEC's exact copy ("Powered by Google") is not the current required text |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Leads list display (CRM-01) | Frontend Server (SSR) | Database | Async Server Component reads `businesses` directly via DAL — no client fetch needed, no API route needed |
| Notes edit / contacted toggle (CRM-02/03) | API/Backend (Server Action) | Database | Server Action is a backend mutation boundary even though it's colocated in `app/`; DAL owns the actual SQL |
| Job history list (CRM-05) | Frontend Server (SSR) | Database | Same pattern as leads list — server-rendered table |
| Live job status while a job is running/partial | Browser / Client | API/Backend (existing `GET /api/jobs/[id]`) | Requires a client component polling the existing route — this is new client-tier scope introduced by this phase, not present in Phases 1-4 |
| CSV export | API/Backend | — | Already built (Phase 4), only needs a link from the new UI, no research needed |
| Google attribution | Frontend Server (SSR, layout) | — | Static text/logo in the shared layout — no client interactivity needed |

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `swr` | npm | published 2026-06-22 (recent version, package itself is Vercel's long-established polling library) | 12,208,080/week | github.com/vercel/swr | [SUS] — seam flags "too-new" based on latest-version publish date, not package age | Flagged — see note below |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** `swr`. The `too-new` signal fired on this version's publish timestamp, not the package's actual history — 12M weekly downloads and the official `vercel/swr` repo make it very unlikely to be a supply-chain risk, but per protocol it is tagged `[WARNING: flagged as suspicious by the legitimacy seam — recency of latest publish, not package trustworthiness. Verify `npm view swr` output yourself before installing.]` and the planner must add a `checkpoint:human-verify` task before `pnpm add swr`. `swr@2.4.2` was already recommended in `.planning/research/STACK.md` (Phase-1-era research, `[CITED: STACK.md]`) specifically for `GET /api/jobs/:id` polling — this phase is the first to actually need that polling, so the recommendation is being exercised, not newly introduced.

*A dependency-free fallback (plain `fetch` + `setInterval` + `router.refresh()`) is documented in Code Examples below in case the planner wants to avoid the checkpoint gate — functionally equivalent for this phase's single polling surface, at the cost of writing the interval-cleanup/backoff logic by hand instead of getting it from the library.*

## Standard Stack

### Core (already installed, no action needed)

| Library | Version (installed) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | 16.2.10 | App Router, Server Components, Server Actions | Locked project stack |
| `drizzle-orm` / `@neondatabase/serverless` | 0.45.2 / 1.1.0 | DB access | Locked, already used by every existing DAL file |
| `zod` | 4.4.3 | Validate Server Action inputs | Same pattern as `createJobSchema` in `app/api/jobs/route.ts` |
| `tailwindcss` | ^4 | Styling | Locked per UI-SPEC — no component library |

### New for this phase

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `swr` [ASSUMED — see Package Legitimacy Audit] | `2.4.2` [VERIFIED: npm registry `npm view swr version`, run 2026-07-03] | Client-side polling of `GET /api/jobs/[id]` for any job in `pending`/`running`/`partial` state | Job History page only — Leads page needs no polling |

**Installation:**
```bash
pnpm add swr
```

No other new dependency is needed. Do not add `@testing-library/react`, `react-hook-form`, `date-fns`/`dayjs`, or an icon library — see Don't Hand-Roll and testing sections below for why each is unnecessary for this phase's actual scope.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `swr` for polling | Plain `fetch` + `setInterval` + `router.refresh()` in a client component | Zero new dependency, but you hand-write interval cleanup on unmount and the "stop polling once terminal" condition that `useSWR`'s `refreshInterval` callback gives for free |
| `Intl.RelativeTimeFormat` (built-in) for "2h ago" (CRM-04) | `date-fns`/`dayjs` | Built-in `Intl.RelativeTimeFormat` covers "N hours/minutes ago" formatting with zero dependencies — do not add a date library for this one string |

## Architecture Patterns

### System Architecture Diagram

```
Browser
  │
  ├─ GET /leads ──────────────────────────────────────────┐
  │                                                         ▼
  │                                          app/leads/page.tsx (Server Component)
  │                                          listBusinesses() → lib/db/businesses.ts → Neon
  │                                          renders LeadsTable (tier badge, notes, contacted)
  │
  ├─ GET /jobs ────────────────────────────────────────────┐
  │                                                          ▼
  │                                          app/jobs/page.tsx (Server Component)
  │                                          listJobs() → lib/db/jobs.ts → Neon
  │                                          + <JobForm> (existing POST /api/jobs, unchanged)
  │                                          + <JobStatusPoller> (Client Component, per non-terminal row)
  │                                                          │
  │                                                          ▼ every ~1-2s while non-terminal
  │                                          GET /api/jobs/[id]  (EXISTING route — unchanged)
  │                                          → claimPartialJob / flagStaleJob / continuation after()
  │                                                          │
  │                                                          ▼ updates local row state
  │                                          re-render row status badge (client-side, no full page reload)
  │
  └─ Notes edit (blur) / Contacted toggle (click)
        │
        ▼ Server Action call (form action / onClick → action)
   updateNotesAction(businessId, notes) / setContactedAction(businessId, contacted)
        │  [validate with zod] → [call DAL] → [revalidatePath('/leads')]
        ▼
   lib/db/businesses.ts → UPDATE businesses SET notes/contacted, updated_at = now()
```

### Recommended Project Structure

```
app/
├── layout.tsx              # add Google attribution + 2-tab nav (Leads / Job History)
├── leads/
│   ├── page.tsx            # Server Component — listBusinesses(), renders table
│   └── actions.ts           # "use server" — updateNotesAction, setContactedAction
├── jobs/
│   ├── page.tsx             # Server Component — listJobs() + <JobForm> (existing POST /api/jobs)
│   └── JobStatusPoller.tsx  # "use client" — polls GET /api/jobs/[id] for non-terminal rows
lib/
└── db/
    ├── businesses.ts         # ADD: listBusinesses, updateBusinessNotes, setBusinessContacted
    └── jobs.ts               # ADD: listJobs
```

### Pattern 1: New DAL functions follow the exact upsert-with-preserved-CRM-fields idiom already in the codebase

**What:** `lib/db/businesses.ts`'s existing `upsertBusiness` deliberately omits `notes`/`contacted`/`firstSeenAt` from its `onConflictDoUpdate.set` so those columns survive a re-scrape. The new mutation functions must mirror this discipline in reverse: they touch ONLY `notes`+`updatedAt` or `contacted`+`updatedAt`, never `businessName`/`website`/etc.
**When to use:** every new write path in this phase.
**Example:**
```typescript
// lib/db/businesses.ts — ADD (pattern matches existing upsertBusiness exactly)
import { eq } from 'drizzle-orm'

export async function updateBusinessNotes(id: number, notes: string): Promise<void> {
  await db
    .update(businesses)
    .set({ notes, updatedAt: new Date() }) // CRM-04: Drizzle does NOT auto-bump
    // .notNull().defaultNow() columns on UPDATE — only on INSERT. Must set explicitly.
    .where(eq(businesses.id, id))
}

export async function setBusinessContacted(id: number, contacted: boolean): Promise<void> {
  await db
    .update(businesses)
    .set({ contacted, updatedAt: new Date() })
    .where(eq(businesses.id, id))
}

export async function listBusinesses() {
  return db.select().from(businesses).orderBy(desc(businesses.updatedAt))
}
```
```typescript
// lib/db/jobs.ts — ADD (does not exist yet; CRM-05 needs it)
export async function listJobs() {
  return db.select().from(jobs).orderBy(desc(jobs.createdAt))
}
```

### Pattern 2: Server Actions stay thin — validate, call DAL, revalidate. Nothing else.

**What:** per `ARCHITECTURE.md`'s already-locked "Route Handlers for job lifecycle, Server Actions for CRM mutations" split. Keep all business logic in the DAL (already unit-testable per the existing `tests/integration/db/*` pattern) so the Server Action itself needs no dedicated rendering test — see Validation Architecture below.
**Example:**
```typescript
// app/leads/actions.ts
'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { updateBusinessNotes, setBusinessContacted } from '@/lib/db/businesses'

const notesSchema = z.object({
  businessId: z.coerce.number().int().positive(),
  notes: z.string().trim().max(2000), // V5 input validation — cap freeform text
})

export async function updateNotesAction(formData: FormData) {
  const parsed = notesSchema.safeParse({
    businessId: formData.get('businessId'),
    notes: formData.get('notes'),
  })
  if (!parsed.success) return { ok: false, error: 'Invalid input' }

  await updateBusinessNotes(parsed.data.businessId, parsed.data.notes)
  revalidatePath('/leads')
  return { ok: true }
}

const contactedSchema = z.object({
  businessId: z.coerce.number().int().positive(),
  contacted: z.coerce.boolean(),
})

export async function setContactedAction(formData: FormData) {
  const parsed = contactedSchema.safeParse({
    businessId: formData.get('businessId'),
    contacted: formData.get('contacted'),
  })
  if (!parsed.success) return { ok: false, error: 'Invalid input' }

  await setBusinessContacted(parsed.data.businessId, parsed.data.contacted)
  revalidatePath('/leads')
  return { ok: true }
}
```

### Pattern 3: A client poller is required for Job History, not optional polish

**What:** `GET /api/jobs/[id]` is where JOB-04 (atomic claim + continuation for `partial` jobs) and JOB-05 (stale-job watchdog) both live. Both are triggered ONLY by a read of that specific route — not by rendering `app/jobs/page.tsx`, which reads the DB directly via `listJobs()` and never calls the route at all.
**Why this matters:** if this phase ships `app/jobs/page.tsx` as a pure Server Component with no client-side polling, a job that goes `partial` (JOB-03, hits the 250s safety window) or gets orphaned mid-`running` (crash, deploy, tab closed) will sit forever with nothing ever hitting `GET /api/jobs/[id]` to advance or flag it — because nothing is polling it anymore once Richard leaves the page. This is a real, not hypothetical, regression risk versus Phases 3-4's implicit assumption that *something* keeps polling.
**When to use:** any job row where `status` is `pending`, `running`, or `partial`.
**Example (SWR):**
```typescript
// app/jobs/JobStatusPoller.tsx
'use client'
import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function JobStatusPoller({ jobId, initialStatus }: { jobId: string; initialStatus: string }) {
  const isTerminal = (s: string) => s === 'done' || s === 'error'
  const { data } = useSWR(isTerminal(initialStatus) ? null : `/api/jobs/${jobId}`, fetcher, {
    refreshInterval: (latest) => (latest && isTerminal(latest.status) ? 0 : 1500),
  })
  const status = data?.status ?? initialStatus
  // render status badge from `status` — see UI-SPEC status badge color table
  return <StatusBadge status={status} leadsFound={data?.leadsFound} />
}
```
**Dependency-free fallback (if the `swr` checkpoint is not approved):**
```typescript
'use client'
import { useEffect, useState } from 'react'

export function JobStatusPoller({ jobId, initialStatus }: { jobId: string; initialStatus: string }) {
  const [job, setJob] = useState({ status: initialStatus, leadsFound: 0 })
  useEffect(() => {
    if (job.status === 'done' || job.status === 'error') return
    const id = setInterval(async () => {
      const res = await fetch(`/api/jobs/${jobId}`)
      setJob(await res.json())
    }, 1500)
    return () => clearInterval(id)
  }, [job.status, jobId])
  return <StatusBadge status={job.status} leadsFound={job.leadsFound} />
}
```

### Anti-Patterns to Avoid

- **Server Component job history with zero client polling:** silently disables JOB-04/JOB-05 for any job not actively being watched via the old per-job detail flow this phase doesn't build (see Pattern 3).
- **Putting notes/contacted mutation logic inline in a `.tsx` file instead of the DAL:** breaks the "all SQL lives in `lib/db/*`" boundary this codebase has held since Phase 1, and makes the mutation untestable without rendering (see Validation Architecture).
- **Trusting `leads_found >= 60` as ground truth for SCRAPE-07 without reading Pitfall 1 below** — it has a documented false-negative mode.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Live job status polling | A custom polling hook from scratch | `swr`'s `refreshInterval` (see Package Legitimacy Audit for the human-verify gate) | Handles interval cleanup, dedup, and stop-on-terminal for free; if the checkpoint is declined, the dependency-free fallback above is the acceptable manual alternative — don't reinvent a third approach |
| "2h ago" relative time (CRM-04) | A hand-rolled diff-and-round-to-unit function, or a new date library | Built-in `Intl.RelativeTimeFormat('en', { numeric: 'auto' })` | Zero dependencies, handles pluralization/locale correctly; a full date library is overkill for one string format |
| CSRF protection on the two new Server Actions | A custom token/header check | Next.js's built-in Server Action origin verification (automatic since Next 13.4+, unchanged in 16.x) [ASSUMED — training knowledge, not verified this session; re-confirm against `nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations#security` before relying on it for anything beyond this internal single-user tool] | Don't add a manual CSRF layer on top of a mechanism the framework already provides |

**Key insight:** Every write path this phase needs already has a proven pattern one file away (`upsertBusiness`, `createJob`, `getJob`) — the job is disciplined repetition of that pattern, not new architecture.

## Common Pitfalls

### Pitfall 1: The UI-SPEC's SCRAPE-07 heuristic (`leads_found >= 60 && status === 'done'`) has a false-negative mode the spec didn't identify

**What goes wrong:** `05-UI-SPEC.md` Assumption #3 worried about a false *positive* (exactly 60 organic results, no more available). Reading `lib/places/mapPlaceToLead.ts` and `lib/jobs/runScrapeJob.ts` directly shows the more likely failure is a false **negative**: `leadsFound` is incremented by `mapped.length`, and `mapped` is the *post*-closed-business-filter array (`mapPlaceToLead` returns `null`, filtered out, for `CLOSED_PERMANENTLY`/`CLOSED_TEMPORARILY` places). Google's raw page-3 response can legitimately return a full 60 raw results (hitting `MAX_PAGES = 3` at `pageSize` 20/page) while `leadsFound` ends up below 60 because some of those 60 were closed businesses and got filtered before the count was incremented. In that case the cap genuinely was hit (more businesses exist that were never fetched, since Google stopped issuing `nextPageToken` after page 3), but the UI's `>= 60` check will not fire, and Richard gets no "refine your search" signal at all — a silent, not just imprecise, miss.

**Why it happens:** `leadsFound` was designed (Phase 3) purely as a progress counter for the checkpointed worker, not as a cap-detection signal — SCRAPE-04 (closed-business filtering) and SCRAPE-07 (cap messaging) are two independent requirements from different phases that happen to interact through this one counter.

**How to avoid — two options, pick one explicitly in the plan:**
- **Option A (cheap, no worker/schema change):** Keep the UI-SPEC's heuristic as-is and document the known limitation in the UI copy/comments. Defensible because SCRAPE-07's own wording ("refine your search") is advisory, not a hard guarantee, and closed-business density on exactly the cap-boundary page is a real but narrow edge case.
- **Option B (recommended — small, additive, and actually correct):** Add one nullable/defaulted boolean column, e.g. `jobs.resultCapHit` (additive migration, same category as Phase 3's `leadsFound`/`cursor`/`errorReason` additions). In `runScrapeJob.ts`, at the point `nextCursor` is computed (`hasMore = Boolean(response.nextPageToken) && pagesFetched < MAX_PAGES`), the loop already has the exact signal needed: if `pagesFetched >= MAX_PAGES` AND `response.nextPageToken` was truthy on that final page, the cap was genuinely hit regardless of how many results were then filtered for being closed. Persist that boolean instead of discarding it when `cursor` is nulled on `status: 'done'`. This is a small, targeted change to code Phase 5 doesn't otherwise need to touch, but it directly and correctly satisfies SCRAPE-07 rather than approximating it.

**Warning signs:** A job that returns exactly 58-59 leads for a category/location combo known to be dense (e.g., "restaurant" downtown) with no cap message shown — that's Option A's blind spot manifesting.

**Phase to address:** This phase (SCRAPE-07 is tracked here). Verification: test against a query expected to return close to or over 60 raw results, including at least one closed business, and confirm the message fires (Option B) or confirm the documented limitation is acceptable (Option A).

---

### Pitfall 2: SEC-03 attribution — `05-UI-SPEC.md`'s exact copy ("Powered by Google") does not match the current official requirement

**What goes wrong:** the UI-SPEC's Copywriting Contract and Attribution Requirement section specify the text **"Powered by Google"**. Fetched directly from `developers.google.com/maps/documentation/places/web-service/policies` (the same page `PITFALLS.md` already cited) [CITED: developers.google.com/maps/documentation/places/web-service/policies, fetched 2026-07-03], the actual current requirement is:
- Required content: the **Google Maps logo** whenever possible; the text **"Google Maps"** (exact capitalization, not localized) only when space is genuinely limited. "Powered by Google" is not the documented attribution string for Places API content — it appears to be conflated with a different, older Google product's attribution convention.
- If text is used: font Roboto (sans-serif fallback), weight 400, size 12sp-16sp, color white / `#1F1F1F` / `#5E5E5E`, 4.5:1 contrast minimum against its background. [CITED — same source, corroborated across two independent fetches of the same page. Note: "sp" is a Material-Design-derived unit; for a web (not Android) surface, treating 1sp ≈ 1px is the standard interpretation but this specific px-equivalence is not itself stated on the page — tag as reasonable practice, not a verified 1:1 mapping.]
- Placement: "near the top or bottom of the content, and within the same visual container" as the Places-derived content — for single-line content, left/right placement is acceptable. Must never be hidden, resized below spec, or placed behind a collapsed menu.
- Must visually distinguish Google-sourced content from other content (border/background/shadow/whitespace).

**Why it happens:** "Powered by Google" is a plausible-sounding, commonly-seen phrase from other Google product integrations (e.g., older Google Search/reCAPTCHA badging conventions), easy to reach for without checking the specific Places API policy page, which this session did check.

**How to avoid:** Change the attribution copy from "Powered by Google" to the text **"Google Maps"** (or, better per the policy's own stated preference, the Google Maps logo asset). Keep the UI-SPEC's placement instinct (visible on every page) but strengthen it: place attribution within or immediately adjacent to each Places-content-bearing table/section (Leads table, Job History table), not only in a page-level global footer that may not read as "within the same visual container" as the content itself if there's significant layout distance between the footer and the table. A single global placement is acceptable ONLY if it sits directly adjacent to the content region on every view that shows Places data — verify this visually once built, not just structurally.

**Warning signs:** Attribution text reading "Powered by Google" anywhere in the shipped UI; attribution isolated in a footer far from the actual data table it's meant to cover.

**Phase to address:** This phase (SEC-03 is tracked here, and no code exists yet — this is a pre-implementation correction, not a retrofit).

---

### Pitfall 3: Drizzle does not auto-update `.defaultNow()` timestamp columns on `UPDATE`

**What goes wrong:** `updatedAt: timestamp(...).notNull().defaultNow()` in the schema only applies its default on `INSERT`. A naive `db.update(businesses).set({ notes })` call leaves `updatedAt` untouched, silently breaking CRM-04 (staleness must be visible).

**Why it happens:** this is standard Drizzle/Postgres behavior (`DEFAULT` clauses fire on insert only, not on every update) and is easy to miss if you assume the column "just works" like an ORM-level `updatedAt` auto-touch feature (which Drizzle does not provide out of the box).

**How to avoid:** every new mutation function must explicitly include `updatedAt: new Date()` in its `.set({...})` call — already the exact pattern `upsertBusiness` uses today (verified directly in `lib/db/businesses.ts`).

**Warning signs:** a note/contacted edit that doesn't move the "updated X ago" indicator in the UI.

**Phase to address:** This phase, in the two new DAL mutation functions.

## Runtime State Inventory

Not applicable — this phase is pure greenfield addition (new pages, new DAL functions, new columns via additive migration if Option B is taken). No rename/refactor/migration of existing identifiers occurs. **None — verified by reading every existing DAL/schema/route file in scope; nothing is being renamed or relocated.**

## Code Examples

### Leads page (Server Component, CRM-01)
```typescript
// app/leads/page.tsx
import { listBusinesses } from '@/lib/db/businesses'
import { updateNotesAction, setContactedAction } from './actions'

export default async function LeadsPage() {
  const rows = await listBusinesses()
  if (rows.length === 0) {
    return <EmptyState heading="No leads yet" body="Run a scrape to start finding businesses with no website found on Google. Go to Job History to start one." />
  }
  return (
    <table>
      <tbody>
        {rows.map((b) => (
          <tr key={b.id}>
            <td>{b.businessName}</td>
            <td>{b.website ? 'Has website' : 'No website found on Google'}</td>
            <td>{b.phone}</td>
            <td>{b.address}</td>
            <form action={setContactedAction}>
              <input type="hidden" name="businessId" value={b.id} />
              <input type="hidden" name="contacted" value={String(!b.contacted)} />
              <button type="submit">{b.contacted ? 'Contacted' : 'Not contacted'}</button>
            </form>
            <form action={updateNotesAction}>
              <input type="hidden" name="businessId" value={b.id} />
              <textarea name="notes" defaultValue={b.notes ?? ''} onBlur={(e) => e.currentTarget.form?.requestSubmit()} />
            </form>
            <td>{relativeTime(b.updatedAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function relativeTime(date: Date): string {
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  const diffMs = date.getTime() - Date.now()
  const diffH = Math.round(diffMs / 3_600_000)
  return rtf.format(diffH, 'hour')
}
```

### Google attribution (SEC-03, corrected copy — layout-level, adjacent to content)
```tsx
// app/layout.tsx — add near top/bottom of each content region, not just a disconnected footer
<p className="text-xs text-[#5E5E5E]">Google Maps</p>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| "Powered by Google" as generic Places attribution copy | "Google Maps" text or logo per current policy page | Confirmed as of this research (2026-07-03) | UI-SPEC copy needs updating before this phase ships |

**Deprecated/outdated:** none specific to this phase's stack — Next.js 16 `after()`/Server Actions/App Router patterns used are current.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Next.js Server Actions include automatic CSRF/origin-header protection since 13.4+, unaffected by the 16.x jump | Don't Hand-Roll | Low for this single-user, no-auth internal tool, but should be reconfirmed against current docs before this claim is used to justify skipping any manual check in a future public-facing phase |
| A2 | 1sp ≈ 1px is an acceptable interpretation of Google's attribution text-size spec for a web (non-Android) UI | Pitfall 2 | Low — worst case the attribution text is a couple px larger/smaller than Google's Android-oriented spec intends; still clearly legible and compliant in spirit |
| A3 | A single global attribution placement is acceptable only if visually adjacent to each Places-content region | Pitfall 2 | Medium — if built as a footer far from the tables, could be read as non-compliant with "within the same visual container" wording; verify visually once built |

**If this table is empty:** N/A — see above.

## Open Questions

1. **SCRAPE-07: Option A vs Option B (Pitfall 1)**
   - What we know: Option A is cheaper; Option B is more correct and cheap enough to be worth it.
   - What's unclear: whether the planner wants to expand this phase's blast radius into `runScrapeJob.ts` + a schema migration for a `Pending`-status requirement that reads, on its surface, like a pure UI task.
   - Recommendation: take Option B — it's a one-column, few-line change, and this is the requirement's home phase.

2. **`swr` checkpoint approval (Package Legitimacy Audit)**
   - What we know: the SUS verdict is a recency-of-publish artifact, not a real trust signal, for a 12M-download official Vercel package.
   - What's unclear: whether the human-verify gate should still be inserted per protocol regardless of this session's own assessment.
   - Recommendation: insert the `checkpoint:human-verify` task per protocol; expect it to pass trivially, but don't skip the gate.

## Environment Availability

No new external dependencies beyond the optional `swr` package (see above) — no new services, CLIs, or runtimes are required. Node/pnpm/Neon are all already in place from Phases 1-4.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.9 (existing) |
| Config file | `vitest.config.ts` — `environment: 'node'`, `conditions: ['react-server']` (both `resolve` and `ssr.resolve`) |
| Quick run command | `pnpm test -- <path>` |
| Full suite command | `pnpm test` |

**Important constraint found this session:** the current `vitest.config.ts` sets `conditions: ['react-server']` globally, which is required for existing `server-only` imports (e.g. `lib/env.ts`, `lib/db/*`) to resolve correctly under Vitest — but this condition is incompatible with `jsdom` + `@testing-library/react` component rendering (which needs the browser/client condition, not `react-server`). Official Next.js docs [CITED: nextjs.org/docs/app/guides/testing/vitest, fetched 2026-07-03] independently confirm: *"Since `async` Server Components are new to the React ecosystem, Vitest currently does not support them... we recommend using E2E tests for `async` components."* Since every new page this phase adds (`app/leads/page.tsx`, `app/jobs/page.tsx`) is an async Server Component, rendering-based unit tests for them are not a supported Vitest pattern regardless of this project's own config.

**Recommendation:** do not add `@testing-library/react`/`jsdom` for this phase. Test the underlying logic directly, in the existing `node` environment, mirroring `tests/integration/db/businesses.test.ts`:
- New DAL functions (`listBusinesses`, `updateBusinessNotes`, `setBusinessContacted`, `listJobs`) get integration tests identical in shape to the existing `businesses.test.ts`/`leads.test.ts` — call the function, assert DB state, clean up.
- Server Actions get unit tests by importing and calling them directly with a constructed `FormData`, asserting the DAL was called correctly (mock the DAL module) or asserting resulting DB state (integration-style) — the same pattern already used for `tests/unit/app/api/jobs/route.test.ts`.
- The two async Server Component pages themselves, and the client `JobStatusPoller`, are **manual-verify only** for this phase — justified by the official Vitest async-Server-Component caveat above, and because this is a solo internal tool where the `/run` skill (browser-drive the actual app) is a faster, more representative check than fighting a rendering setup Next.js itself says isn't supported yet.
- If component-level interaction testing is wanted later (e.g., autosave-on-blur edge cases), the documented fallback is a **second Vitest `test.projects` entry** (Vitest 4's replacement for the deprecated `workspace` file) scoped to `jsdom` + no `react-server` condition, kept separate from the existing `node`/`react-server` project — not a change to the existing config.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CRM-01 | `listBusinesses()` returns rows with tier derivable from `website` | integration | `pnpm test -- tests/integration/db/businesses.test.ts` | ❌ Wave 0 — extend existing file |
| CRM-02 | `updateBusinessNotes()` persists notes | integration | same file | ❌ Wave 0 |
| CRM-03 | `setBusinessContacted()` persists contacted | integration | same file | ❌ Wave 0 |
| CRM-04 | Both mutations bump `updatedAt` | integration | same file | ❌ Wave 0 |
| CRM-05 | `listJobs()` returns all jobs ordered by `createdAt` | integration | `pnpm test -- tests/integration/db/jobs.test.ts` (new file) | ❌ Wave 0 |
| SCRAPE-07 | Cap-hit message logic (Option A heuristic or Option B flag) | unit | `pnpm test -- tests/unit/lib/jobs/*` (extend or new) | ❌ Wave 0 |
| SEC-03 | Attribution text/placement | manual | `/run` skill visual check | manual-only — justified: static copy/layout, no logic to unit test |

### Sampling Rate
- **Per task commit:** `pnpm test -- <changed test file>`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`, plus one manual `/run` pass over both new pages.

### Wave 0 Gaps
- [ ] `tests/integration/db/jobs.test.ts` — new file, covers `listJobs()` (CRM-05) — no test file exists for `jobs.ts` today
- [ ] Extend `tests/integration/db/businesses.test.ts` — covers CRM-01/02/03/04
- [ ] If Option B (Pitfall 1) is taken: extend `tests/unit/lib/jobs/runScrapeJob.test.ts` and/or `checkpoint.test.ts` for the new `resultCapHit` signal

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No | Project has no auth by design (single user, locked decision) |
| V3 Session Management | No | Same as above |
| V4 Access Control | No | Single user, no roles |
| V5 Input Validation | Yes | Zod schemas on both new Server Actions (`businessId` coerced+positive-int, `notes` trimmed+capped at 2000 chars, `contacted` coerced boolean) — mirrors the existing `createJobSchema` pattern in `app/api/jobs/route.ts` |
| V6 Cryptography | No | No secrets/crypto introduced by this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| XSS via untrusted Places-sourced business names/addresses/reviews rendered in the leads table | Tampering / Information Disclosure | React's default JSX text-node rendering auto-escapes string content — safe as long as no `dangerouslySetInnerHTML` is used anywhere in the new components (verify at code review; none of the patterns above use it) |
| CSRF on notes/contacted Server Actions | Spoofing | Next.js Server Actions perform automatic origin-header verification [ASSUMED — A1 above]; no additional manual CSRF token needed for this internal tool |
| Over-long freeform notes causing storage/display abuse | Denial of Service (minor) | `.max(2000)` in the Server Action's zod schema |
| Business ID tampering (submitting an arbitrary `businessId` in the hidden form field) | Tampering | No auth boundary exists to violate (single user, no per-user data ownership) — worst case is editing another business's notes, which is not a security boundary in this app's threat model, only a UX-integrity one; DAL functions still validate the ID is a positive integer before querying |

## Sources

### Primary (HIGH confidence)
- `lib/db/schema.ts`, `lib/db/businesses.ts`, `lib/db/jobs.ts`, `lib/db/leads.ts`, `lib/jobs/runScrapeJob.ts`, `lib/jobs/checkpoint.ts`, `lib/places/mapPlaceToLead.ts`, `lib/places/client.ts`, `lib/places/paginate.ts`, `app/api/jobs/route.ts`, `app/api/jobs/[id]/route.ts`, `app/api/jobs/[id]/export/route.ts`, `lib/csv/export.ts`, `lib/db/client.ts`, `tests/integration/db/businesses.test.ts`, `vitest.config.ts`, `package.json` — read directly this session
- `developers.google.com/maps/documentation/places/web-service/policies` — fetched directly twice this session (attribution text/size/placement requirements)
- `nextjs.org/docs/app/guides/testing/vitest` — fetched directly this session (async Server Component testing limitation, official)
- `npm view swr version` — run directly this session (2.4.2 confirmed current)

### Secondary (MEDIUM confidence)
- `.planning/research/STACK.md`, `.planning/research/PITFALLS.md`, `.planning/research/ARCHITECTURE.md` — prior-phase research, cited where reused (SWR recommendation, upsert/CRM-split pattern, `after()`/polling design)
- WebSearch results on Next.js+Vitest+Testing Library ecosystem consensus (2026) — cross-checked against the official Next.js docs fetch above, used only to corroborate, not as standalone authority

### Tertiary (LOW confidence)
- Claim A1 (Server Actions CSRF protection) — training-knowledge only, not verified this session; flagged in Assumptions Log

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries beyond one already-recommended, version-verified package
- Architecture: HIGH — directly extends an already-built, tested, and previously-researched codebase; patterns are repetitions of existing code, not novel design
- Pitfalls: HIGH for Pitfalls 1 and 3 (directly grounded in reading the actual source code); MEDIUM for Pitfall 2 (official source fetched and quoted, but the px/sp equivalence detail is an inference, not a verified 1:1 mapping)

**Research date:** 2026-07-03
**Valid until:** 30 days (stable stack; re-verify the Google attribution policy page specifically if this phase's implementation slips past that window, as Places API policy pages have changed before)

---
*Research for: findleads Phase 5 (CRM Leads Dashboard)*
*Researched: 2026-07-03*
