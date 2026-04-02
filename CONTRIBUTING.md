# Contributing to Local Storage Inspector

Thanks for your interest in contributing! Here's how to get started.

## Development Setup

```bash
# Install dependencies
bun install

# Start dev server with HMR
bun run dev

# Load the extension in Chrome
# 1. Open chrome://extensions
# 2. Enable Developer mode
# 3. Click "Load unpacked" and select the dist/ folder
```

## Workflow

1. **Open an issue first** -- Describe the bug or feature before writing code
2. **Create a branch** -- `issue-{N}-{short-description}` (e.g., `issue-10-value-editor`)
3. **Write code** -- Follow the code style below
4. **Run checks** -- `bun run lint && bun run test && bun run build`
5. **Open a PR** -- Target `main`, include `Closes #{N}` in the body
6. **CI must pass** -- The `lint-test-build` check runs lint, type checking, unit tests, build, and E2E tests

Never commit directly to `main`.

## Code Style

- **TypeScript strict mode** -- No `any`, no non-null assertions (`!`)
- **Pure functions** -- Business logic lives in `src/lib/`, not in React components
- **Thin components** -- React components are wiring: props in, callbacks out, state updates
- **CSS Modules** -- No inline styles except trivial layout. One `.module.css` file per component.
- **One concern per file** -- Each file does one thing

## Testing

- **Unit tests** (`tests/unit/`) -- Test pure functions with Vitest. Run with `bun run test`.
- **E2E tests** (`tests/e2e/`) -- Test the full extension with Playwright. Run with `bun run test:e2e`. These require a headed Chrome browser (extensions don't load in headless mode).

Write tests for new functionality. Existing tests must continue to pass.

## Project Structure

```
src/lib/         Pure functions (imported by components and content script)
src/shared/      TypeScript types shared across extension contexts
src/sidepanel/   React side panel UI
src/content/     Content script (bridges page and extension)
src/background/  Service worker
```
