# Architecture

> **Superseded pointer (2026-07-18).** This file described the pre-pivot, pre-implementation
> design and drifted badly from the shipped code (it even claimed "no ToS risk" — the
> Places "No Caching" ToS risk is in fact a knowingly-accepted, documented decision).
>
> The real, current architecture narrative lives in root **`PROJECT.md`** — data flow,
> module boundaries, job execution model, design decisions, and gotchas, written from a full
> codebase read. Known weaknesses: root **`GAPS.md`**. Decision log: `docs/decisions.md`.
> Planning record: `.planning/` (REQUIREMENTS.md, ROADMAP.md, phase plans).
