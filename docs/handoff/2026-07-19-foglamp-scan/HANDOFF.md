# Session - 2026-07-19 - foglamp-scan

## Goal
User asked: analyze this repo and publish a shareable "foglamp" codebase scan (architecture map:
models/tools/integrations/flows, no code/secrets) to foglamp.dev, per the fixed foglamp output
contract in the prompt.

## What was done (concrete one-liners)
- Read the scrape/CRM pipeline (`app/api/jobs/*`, `lib/jobs/runScrapeJob.ts`, `lib/places/*`,
  `lib/db/*`, `lib/csv/export.ts`, `app/leads/actions.ts`) to map real data flow.
- Confirmed the repo has zero AI/LLM usage (no `generateText`/agents/models/tool-calling
  anywhere) - this is Google Places API + Neon Postgres CRM only, per project's own locked
  decisions (Places API only, no LLM enrichment yet).
- Wrote `.foglamp/scan.json` (17 nodes / 19 edges, groups "Scraping pipeline" + "Data layer",
  stats agents=0 models=0 tools=0 integrations=2 [Google Places API, Neon]).
- Asked user to confirm the foglamp.dev upload/public-unlisted-link disclosure before sending
  anything - user confirmed "Yes, upload".
- First upload attempt hit a 422 (3 edge labels over the 24-char cap) - shortened labels, re-sent.
- Published successfully: **https://foglamp.dev/scan/findleads-amc6tw**
- Saved `.foglamp/scan.lock.json` (slug/url/editToken/expiresAt) so a future run can update the
  same URL instead of minting a new one.
- Added `.foglamp/` to `.gitignore` - the lock file's `editToken` is a secret, must not be
  committed.

## Files changed
- `.foglamp/scan.json` - new, the published architecture-scan data (safe, no secrets/code).
- `.foglamp/scan.lock.json` - new, gitignored, holds the foglamp edit token.
- `.gitignore` - added `.foglamp/` ignore rule + comment.

## Failed attempts
- First `curl` POST to `api.foglamp.dev/scan` → 422 "scan data is invalid" (3 edge labels
  exceeded the 24-char limit: "retry on token-not-active", "job leads + businesses join",
  "notes/contacted CRM state"). Fixed by shortening all three, re-uploaded successfully.

## Next steps
- None from this task - it's a one-shot publish. Unrelated to the paused Phase 6 UI/UX
  brainstorm (see father `HANDOFF.md` Current state) - that still awaits user's placement
  confirm, untouched this session.
- If the repo's architecture changes meaningfully later, re-run the same foglamp flow using
  the existing `.foglamp/scan.lock.json` editToken to update this same URL instead of creating
  a new one.

## Part 2 (same session, follow-up ask): deploy findleads live

User opened the published foglamp link, then pasted a Cloudflare Drop blog post and asked to
"deploy this on the web so I can use it" - ambiguous ("this" = article vs the app). Clarified
via AskUserQuestion: user meant deploy the **findleads app itself**, not the pasted article.

- Opened `https://foglamp.dev/scan/findleads-amc6tw` in Chrome via claude-in-chrome to confirm
  the published scan renders.
- Flagged Cloudflare Drop is static-only (HTML/CSS/JS, no server) - incompatible with findleads
  (Server Actions, `/api/jobs` routes, Neon DB, `after()`-based background worker). User initially
  said "use cloudflare now" (typo'd) - re-asked with an explicit Vercel-vs-Cloudflare-Workers
  choice; user confirmed **Vercel via GitHub import** (matches the project's own existing
  assumption: "Vercel Hobby assumed by design — 300s ceiling shapes the worker").
- Checked available Vercel MCP tools (`list_teams`, `list_projects`) - no git-import tool exists
  in the connected Vercel MCP surface, `list_teams` returned empty (no team on this account),
  `list_projects` errored without a teamId. Concluded the GitHub-import step has to happen in
  Vercel's own dashboard, not something this session can do headlessly.
- Gave the user a 6-step manual walkthrough: vercel.com/new → Import Git Repository →
  `RikepilB/findleads` → leave Next.js defaults → **user sets `DATABASE_URL` and
  `PLACES_API_KEY` themselves** in Vercel's env-var UI (never touched the secrets myself,
  `.env*` is hard-denied anyway) → Deploy. **Not yet actually deployed** - waiting on the user
  to run through Vercel's UI on their end.

### Files changed (part 2)
- None - guidance/clarification only, no repo changes this part.

### Failed attempts (part 2)
- Tried `mcp__claude_ai_Vercel__list_projects` with an empty `teamId` to check for an existing
  Vercel project before recommending the manual flow - errored ("Failed to list projects."),
  confirming there's no already-imported project to reuse.

### Next steps (part 2)
- User needs to actually run the Vercel import (vercel.com/new → import `RikepilB/findleads` →
  set the 2 env vars → Deploy). Not done yet.
- Once deployed, share the Vercel project URL/any build error back - `get_deployment_build_logs`
  / `get_runtime_errors` Vercel MCP tools are already available to debug from here.

## Files in this folder
- `HANDOFF.md` - this file (curated digest)
- `transcript.md` - full `/export` of the session (raw archive) - **not yet created, user must
  run `/export docs/handoff/2026-07-19-foglamp-scan/transcript.md` manually**
