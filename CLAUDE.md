# Local Storage Inspector

Chrome extension (Manifest V3) for viewing/editing localStorage and sessionStorage.

## Git Workflow

- **Never commit directly to `main`.** Always create a feature branch and open a PR.
- Branch naming: `issue-{N}-{short-description}` (e.g., `issue-10-value-editor`)
- PR body must include `Closes #{N}` to auto-close the linked issue on merge.
- PRs require the `lint-test-build` CI check to pass before merging.

## Before Pushing

Always run these locally before pushing a branch:

```bash
bun run lint
bun run test
bun run build
```

Fix any failures before pushing. Do not push broken code.

## Code Style

- TypeScript strict mode — no `any`, no non-null assertions (`!`)
- Pure functions for all business logic — live in `src/lib/`, not in React components
- React components are thin wiring — they receive data via props, call pure functions, update state
- Minimal hooks/effects — explicit control flow, no scattered `useEffect` chains
- CSS Modules for styling — no inline styles except trivial layout
- One file per component, one concern per file

## Commands

- `bun run dev` — Vite dev server with HMR
- `bun run build` — TypeScript check + Vite production build
- `bun run test` — Vitest unit tests
- `bun run test:e2e` — Playwright E2E tests
- `bun run lint` — ESLint
- `bun run format` — Prettier

## Project Structure

- `src/lib/` — pure functions (parse, validate, filter, diff, storage helpers)
- `src/shared/` — TypeScript types shared between sidepanel and content script
- `src/sidepanel/components/` — React components
- `src/content/` — content script (injected into active tab)
- `src/background/` — service worker
- `tests/unit/` — Vitest unit tests
- `tests/e2e/` — Playwright E2E tests

## Execution Preferences

- Always use **subagent-driven development** when executing implementation plans.

## Tech Stack

- Bun (package manager + script runner)
- TypeScript, React 19, Vite + @crxjs/vite-plugin
- CodeMirror 6 for JSON editing
- Vitest (unit), Playwright (E2E)
- ESLint + Prettier
