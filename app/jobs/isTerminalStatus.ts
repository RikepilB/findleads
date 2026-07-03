// Pure helper, deliberately kept in its own module with no 'use client'
// directive and no imports. JobStatusPoller.tsx ('use client') imports
// swr, which in turn imports React APIs (createContext) that are not
// provided under this project's Vitest `conditions: ['react-server']`
// setup (see vitest.config.ts) — pulling swr into a test's module graph
// at all throws a SyntaxError before any assertion runs. Splitting this
// function out keeps it independently unit-testable without dragging
// swr through that loader.
export function isTerminalStatus(status: string): boolean {
  return status === 'done' || status === 'error'
}
