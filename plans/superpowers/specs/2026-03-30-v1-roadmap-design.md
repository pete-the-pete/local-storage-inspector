# Local Storage Inspector v1.0 Roadmap Design

## Context

The extension (v0.1.0) has been submitted for Chrome Web Store review. It currently provides a popup-based UI for viewing and editing localStorage/sessionStorage. This spec defines three features to reach v1.0: syntax highlighting, sidepanel migration, and storage change monitoring with a real-time log.

## Versioning Strategy

- **v0.2.0** — Syntax highlighting (One Dark theme for JSON editing)
- **v0.3.0** — Sidepanel migration (replace popup entirely)
- **v0.4.0** — Storage change monitoring & log
- **v1.0.0** — All features complete, stable release

Patch versions (0.2.1, 0.2.2...) for incremental work within a feature. Git tags on minor/major version bumps only.

Each feature tracked via GitHub issues. Branches: `issue-{N}-description`. PRs close issues.

---

## Feature 1: Syntax Highlighting (v0.2.0)

### What

Add a visible color theme to the CodeMirror editor so JSON tokens (keys, strings, numbers, booleans, null) are color-differentiated.

### Design

- Add `@codemirror/theme-one-dark` dependency
- Apply the theme as a CodeMirror extension when JSON mode is active
- Plain text mode stays unthemed (monospace, single color)
- No structural changes to the editor

### Files

- `src/popup/components/ValueEditor.tsx` — add theme extension
- `package.json` — add `@codemirror/theme-one-dark`

### Tests

- E2E: verify CodeMirror renders with the theme's CSS classes when viewing a JSON value

---

## Feature 2: Sidepanel Migration (v0.3.0)

### What

Replace the popup with a Chrome sidepanel. Clicking the extension icon opens the sidepanel. The popup is fully removed.

### Architecture

**Manifest changes:**
- Remove `action.default_popup`
- Add `side_panel.default_path: "src/sidepanel/sidepanel.html"`
- Add `sidePanel` to permissions
- Keep `action` (icon only) — `chrome.action.onClicked` triggers `chrome.sidePanel.open()`

**Service worker** (`src/background/service-worker.ts`):
- Add `chrome.action.onClicked` listener that calls `chrome.sidePanel.open({ tabId })`

**File moves:**
- `src/popup/` → `src/sidepanel/`
- Entry point: `sidepanel.html` + `sidepanel.tsx`
- All components, CSS modules, and lib functions move as-is

**CSS updates:**
- Remove fixed 450px width from `App.module.css`
- Use flexible layout that fills sidepanel width (naturally ~400px, user-resizable)

**Vite config:**
- `@crxjs/vite-plugin` v2.4.0 auto-discovers HTML entry points from manifest.json. Changing `side_panel.default_path` should be sufficient. If the build doesn't pick it up, add explicit `build.rollupOptions.input` for the sidepanel HTML.

**Communication:**
- `chrome.scripting.executeScript()` works identically from sidepanel — no changes to storage read/write.

### Files

- `manifest.json` — restructure action/side_panel/permissions
- `src/background/service-worker.ts` — add sidepanel open handler
- `src/popup/` → `src/sidepanel/` (full directory rename)
- `vite.config.ts` — update if needed for sidepanel entry
- All `*.module.css` files — remove fixed dimensions
- `tests/e2e/fixtures.ts` — new `openSidePanel` fixture
- `tests/e2e/extension.spec.ts` — update all test references

### Tests

- E2E: rewrite `openPopup` fixture to open sidepanel via `chrome-extension://` URL
- All existing E2E tests adapted to sidepanel context
- Verify sidepanel opens on extension icon click
- Verify sidepanel persists when clicking elsewhere (unlike popup)

---

## Feature 3: Storage Change Monitoring & Log (v0.4.0)

### What

Real-time log of storage mutations in the sidepanel. Shows what changed, when, the operation type, and source (page script vs extension editor). Recording on by default, clearable.

### Architecture

#### 3a. Page-level Interceptor (`src/content/storage-interceptor.ts`)

Runs in `MAIN` world (page JS context). Injected dynamically when recording starts.

- Monkey-patches `Storage.prototype.setItem`, `removeItem`, `clear`
- Each patch: calls the original method, then dispatches a `CustomEvent` on `window`:
  ```
  detail: { storageType, operation, key, oldValue, newValue, timestamp, stack }
  ```
- `stack` captured via `new Error().stack`
- Stores originals on Symbols (`Symbol.for('lsi-original-setItem')`) for clean restoration
- Restores originals when recording stops

**Collision avoidance:** Wraps whatever is currently on `Storage.prototype` (preserving any prior patches by other extensions). Restores to the exact reference that was there before our patch.

#### 3b. Content Script Monitor (`src/content/monitor.ts`)

Persistent content script registered in `manifest.json` `content_scripts`.

- Listens for `CustomEvent` dispatches from the interceptor (via `window.addEventListener`)
- Maintains `chrome.runtime.connect` port to sidepanel
- Relays change events as structured messages
- Injects interceptor when `START_RECORDING` received, removes on `STOP_RECORDING`
- Handles connect/disconnect lifecycle

#### 3c. Message Protocol Extensions (`src/shared/types.ts`)

New message types:
- `STORAGE_CHANGE` — content script → sidepanel: `{ key, operation, oldValue, newValue, timestamp, storageType, source, stack }`
- `START_RECORDING` — sidepanel → content script
- `STOP_RECORDING` — sidepanel → content script

Source tags: `"page"` | `"extension"` | `"unknown"`

#### 3d. Change Log UI (`src/sidepanel/components/ChangeLog.tsx`)

```
┌──────────────────────────────────┐
│ ◉ Recording  │ 12 changes │ 🗑   │  toolbar
├──────────────────────────────────┤
│ myKey • setItem • 12:34:05 • page│  collapsed entry
│ ▼ config • setItem • 12:34:04    │  expanded entry
│   Old: {"theme":"light"}         │
│   New: {"theme":"dark"}          │
│ session.id • removeItem • 12:33  │
└──────────────────────────────────┘
```

- Toolbar: recording toggle (on by default), change count badge, clear button
- Entries: reverse chronological (newest at top)
- Each entry: key, operation (`setItem`/`removeItem`/`clear`), timestamp (HH:mm:ss.ms), source tag
- Click to expand: shows old/new values (JSON formatted if applicable)
- Auto-scroll: new entries appear at top

#### 3e. Extension-originated Change Tagging

When the editor saves/deletes/imports:
- Sidepanel sends a flag to content script before executing `chrome.scripting.executeScript`
- Content script sets a window-level flag the interceptor checks
- Interceptor tags the change as `source: "extension"`
- Flag cleared after the write completes

#### 3f. State & Lifecycle

- Change log state: React state in sidepanel, not persisted
- Clears on: user clicks Clear, page navigates (content script disconnects), or manual clear
- Recording toggle off: stops capturing new entries, existing log remains visible

### Files

- `src/content/storage-interceptor.ts` — new, MAIN world script
- `src/content/monitor.ts` — new, persistent content script
- `src/shared/types.ts` — new message types
- `src/sidepanel/components/ChangeLog.tsx` — new component
- `src/sidepanel/components/ChangeLog.module.css` — new styles
- `src/sidepanel/components/App.tsx` — integrate ChangeLog, manage recording state
- `manifest.json` — add content_scripts registration

### Tests

**Unit:**
- `tests/unit/change-log.test.ts` — entry formatting, timestamp display, source tag logic
- `tests/unit/storage-interceptor.test.ts` — monkey-patching captures correct operation details

**E2E:**
- Test page with buttons triggering `localStorage.setItem()`, `removeItem()`, `clear()`
- Verify log entries appear with correct operation, key, timestamp
- Verify source tags: "page" for page-triggered, "extension" for editor changes
- Verify recording toggle: off stops capture, on resumes
- Verify clear button empties log
- Verify expand/collapse shows old/new values
- Verify log clears on page navigation

---

## Implementation Order

1. **v0.2.0 — Syntax highlighting** (smallest, builds confidence)
2. **v0.3.0 — Sidepanel migration** (architectural foundation for change log layout)
3. **v0.4.0 — Change monitoring** (builds on sidepanel + new content script infrastructure)
4. **v1.0.0 — Tag** (after all features verified stable)

This order is intentional: the sidepanel provides the space needed for the change log, and the monitoring feature requires the persistent lifecycle that sidepanels provide (popups close when you click away, losing the log).

---

## Verification Plan

After all features are complete:

1. `bun run lint` — no errors
2. `bun run test` — all unit tests pass
3. `bun run build` — clean production build
4. `bun run test:e2e` — all E2E tests pass
5. Manual testing: open a page with active localStorage usage, verify change log captures mutations in real-time with correct source tags
6. Manual testing: edit a value in the sidepanel, verify it shows as "extension" source in the log
7. Manual testing: toggle recording off/on, clear log, verify behaviors
