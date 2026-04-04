# Local Storage Inspector — Design Spec

## Overview

A Chrome extension (Manifest V3) that provides a popup-based UI for viewing and editing `localStorage` and `sessionStorage` values. The core problem: Chrome DevTools shows storage values as flat single-line strings, making complex JSON values impossible to work with.

**Target users:** Developers debugging their own apps (primary), QA/testers manipulating state for test scenarios (secondary).

## Feature Set (v1)

### Core

- **Key list** with localStorage/sessionStorage toggle
- **Search/filter** keys by name
- **View values** — auto-detect JSON and pretty-print, otherwise show raw string
- **Edit values** — CodeMirror editor with JSON syntax highlighting and validation
- **Save values** — write updated values back to storage via `setItem()`. Save is disabled when JSON validation fails. Visual confirmation (brief flash/checkmark) on successful save. Ctrl+S keyboard shortcut.
- **"Parse as JSON" toggle** — when a value is a plain string that looks like it could be JSON (e.g., `"{\"key\":\"value\"}"`), this toggle attempts to parse it and switches the editor to JSON mode with pretty-printing. When toggled off, the raw string is shown in a plain text editor. Auto-detected JSON values start with the toggle on by default.
- **Add** new key-value pair
- **Delete** individual keys
- **Copy** value to clipboard

### Import/Export

- **Export** all keys (or selected) as a JSON file
- **Import** from JSON file — with preview of what will be overwritten

### UX Details

- Real-time JSON validation — red border / error message when invalid, save disabled until fixed
- Confirmation before destructive actions (delete, overwrite on import)
- Keyboard shortcuts: Ctrl+S to save, Escape to cancel editing

### Explicitly NOT in v1

- Change history / undo
- Real-time monitoring of storage changes
- Diff view
- Storage size visualization
- Bulk operations beyond import/export

## Architecture

```
┌─────────────────────────────────────────────┐
│              Chrome Extension                │
│                (Manifest V3)                 │
│                                              │
│  ┌─────────┐    ┌──────────┐    ┌─────────┐ │
│  │  Popup   │◄──►│ Service  │◄──►│ Content │ │
│  │  (React) │    │ Worker   │    │ Script  │ │
│  └─────────┘    └──────────┘    └─────────┘ │
│       │                              │       │
│       │         ┌──────────┐         │       │
│       └────────►│  Shared  │◄────────┘       │
│                 │  Types   │                 │
│                 └──────────┘                 │
└─────────────────────────────────────────────┘
                                       │
                                       ▼
                              ┌──────────────┐
                              │  Page's      │
                              │  localStorage│
                              │  sessionStorage
                              └──────────────┘
```

### Popup (React + TypeScript)

The UI layer. Renders key list, JSON editor, search, import/export controls. Opens when the user clicks the extension icon.

### Service Worker

Manifest V3 background script. Routes messages between popup and content script. Lightweight — mostly a message relay.

### Content Script

Injected into the active tab. The only layer with access to `window.localStorage` and `window.sessionStorage`. Reads and writes values on demand via messages from the popup.

### Shared Types

TypeScript interfaces for messages, storage entries, and related contracts. Keeps communication between layers explicit and typed.

## Component Architecture Constraints

- **Small, focused components** — one job each
- **Minimal hooks/effects** — no scattered `useEffect` chains or reactive magic
- **Explicit control flow** — user clicks button → handler calls a pure function → state updates. Cause and effect are always traceable.
- **Pure functions for all logic** — parsing, validation, transformation, filtering live in plain `.ts` files in `src/lib/`, not inside hooks or components
- **Hooks only for what truly requires them** — `useState` for UI state, minimal custom hooks for the chrome messaging bridge. No hook-per-concept pattern.
- **No context providers** unless absolutely necessary (unlikely for a popup this small)
- **Components receive data and callbacks via props** — they don't reach into global state

## File Structure

```
local-storage-inspector/
├── src/
│   ├── popup/
│   │   ├── components/
│   │   │   ├── KeyList.tsx
│   │   │   ├── ValueEditor.tsx
│   │   │   ├── SearchBar.tsx
│   │   │   ├── StorageToggle.tsx
│   │   │   ├── ImportExport.tsx
│   │   │   └── App.tsx
│   │   ├── popup.tsx
│   │   └── popup.html
│   ├── content/
│   │   └── content.ts
│   ├── background/
│   │   └── service-worker.ts
│   ├── shared/
│   │   ├── types.ts
│   │   └── messages.ts
│   └── lib/
│       ├── parse.ts
│       ├── validate.ts
│       ├── filter.ts
│       └── serialization.ts
├── tests/
│   ├── unit/
│   └── e2e/
├── public/
│   └── icons/
├── manifest.json
├── vite.config.ts
├── tsconfig.json
├── package.json
└── .prettierrc
```

- `src/lib/` — all pure functions, the testable core, zero React dependencies
- `src/popup/components/` — thin components that wire user events to lib functions
- `src/shared/` — typed contracts between content script and popup
- One file per component, one concern per file

## Data Flow

### Message Types

All defined in `shared/types.ts`:

- `GET_ALL` — returns all key-value pairs for the selected storage type (localStorage or sessionStorage)
- `SET_VALUE` — writes a single key-value pair
- `DELETE_KEY` — removes a key
- `IMPORT` — writes multiple key-value pairs (with optional clear-first flag)

### Edit → Save Flow

1. User selects key in KeyList
2. Component calls `parseStorageValue(raw)` (pure function) to format for display
3. User edits in CodeMirror
4. On save: `validateJson(draft)` (pure function) → if valid, send `SET_VALUE` message to content script
5. Content script calls `localStorage.setItem()` → responds with success/failure
6. Popup updates local state, shows visual confirmation

### Import Flow

1. User selects JSON file
2. `deserializeImport(file)` (pure function) parses and validates
3. Popup shows preview of keys to be added/overwritten
4. User confirms → sends `IMPORT` message to content script
5. Content script writes all entries → responds with results
6. Popup refreshes key list

## Tech Stack

| Layer | Tool | Rationale |
|-------|------|-----------|
| Runtime | Bun | Fast package management and script runner |
| Language | TypeScript (strict) | Type safety across all layers |
| Build | Vite + @crxjs/vite-plugin | Fast builds, HMR, Chrome extension support |
| UI | React 19 | Thin components + pure functions |
| Editor | CodeMirror 6 | Lightweight, modular, great JSON mode |
| Styling | CSS Modules | Scoped styles, no runtime cost |
| Unit tests | Vitest | Vite-native, fast, Jest-compatible API |
| E2E tests | Playwright | Can test Chrome extensions directly |
| Linting | ESLint + Prettier | Standard, enforced via pre-commit hook |
| Manifest | V3 | Required for new Chrome Web Store submissions |

## Permissions

| Permission | Why |
|-----------|-----|
| `activeTab` | Grants access to the current tab only when the user clicks the extension icon. No scary "read all your data" install warning. |
| `scripting` | Inject the content script on demand when the popup opens. Scoped to the active tab via `activeTab`. |

**Content script injection strategy:** Use `chrome.scripting.executeScript()` to inject the content script on demand when the popup opens, rather than declaring a persistent content script in the manifest. The extension only touches the page when the user explicitly activates it.

**Permissions we explicitly avoid:**
- `storage` — not needed; we access `window.localStorage`, not `chrome.storage`
- `<all_urls>` / host permissions — `activeTab` scopes access to the clicked tab
- `tabs` — not needed for our use case

## Development & Release Cycle

### Local Development

1. `bun run dev` — Vite + `@crxjs/vite-plugin` builds to `dist/`
2. `chrome://extensions` → Load Unpacked → point to `dist/`
3. Edit code → HMR auto-reloads extension (no manual refresh needed)

### Testing (fully automatable)

- `bun run test` — Vitest unit tests, no browser needed
- `bun run test:e2e` — Playwright launches Chrome with the extension loaded via `--load-extension=dist/` flag

### Release

1. `bun run build` — production build to `dist/`
2. Zip `dist/` → upload to Chrome Web Store
3. Chrome Web Store API supports automated publishing via CI

### CI Pipeline (GitHub Actions)

1. Push to GitHub triggers: `bun run test` (unit) + `bun run test:e2e` (Playwright with built extension)
2. On tagged release: build → zip → publish to Chrome Web Store via API

## Testing Strategy

### Unit Tests (Vitest)

- All pure functions in `src/lib/` — parsing, validation, filtering, serialization
- Component rendering tests for key interactions (optional, low priority for v1)

### E2E Tests (Playwright)

- Full flow: open popup → read storage → edit value → save → verify storage updated
- Import/export round-trip
- Error cases: invalid JSON prevents save, delete confirmation

### What We Don't Test in v1

- Visual regression
- Performance/load testing
- Cross-browser (Chrome only)
