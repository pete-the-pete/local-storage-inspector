# Change Log Diff UX & Interceptor Fix

## Overview

Two releases to improve the storage change monitoring feature:

1. **v1.1.0** — Change log diff UX: show which fields changed in collapsed view, highlight diffs in expanded view
2. **v1.2.0** — Fix interceptor blocked by ad blockers/CSP: switch from `<script>` tag injection to manifest-declared MAIN world content script

## Release 1: Change Log Diff UX (v1.1.0)

### Problem

The change log shows raw old/new values with no indication of what actually changed. Users must visually compare potentially large JSON blobs to find differences.

### Design

#### Pure diff function — `src/lib/diff.ts`

`jsonDiff(oldValue: string | null, newValue: string | null)` returns a list of changes:

```ts
interface FieldChange {
  path: string;        // e.g. "user.settings.age", "" for root
  type: "added" | "removed" | "modified";
}
```

Behavior:
- **Both values valid JSON objects**: Full recursive comparison. Arrays compared by index. Returns list of `FieldChange` entries with dot-notation paths.
- **One or both not JSON** (plain strings, numbers, arrays-at-root): Returns a single `{ path: "", type: "modified" }` entry if values differ.
- **oldValue null** (new key): Returns `{ path: "", type: "added" }`.
- **newValue null** (deleted key): Returns `{ path: "", type: "removed" }`.

#### Collapsed view — change summary line

Below the existing entry header (`key  operation  source  timestamp`), show a summary:

- **JSON with field changes**: `~ user.settings.age, + roles, - legacy` using `~` modified, `+` added, `-` removed prefixes
- **Plain string changed**: `value changed`
- **New key (setItem, no old value)**: `(new)`
- **Deleted key (removeItem)**: `(deleted)`
- **clear operation**: no summary needed (already shows "clear")

Truncate to 3 changes with `+N more` if many fields changed.

#### Expanded view — two diff modes with toggle

A small toggle button (inline/unified) in the expanded detail area:

**Inline mode (default)**:
- Old and New values stacked (current layout)
- Changed fields highlighted with background colors:
  - Removed: light pink `#fce4ec`
  - Added: light blue `#e3f2fd`
  - Modified: light yellow `#fff8e1`
- Unchanged fields rendered normally

**Unified mode**:
- Single view with `-` and `+` prefixed lines (git diff style)
- Same color scheme: pink for `-` lines, blue for `+` lines
- Unchanged context lines shown without prefix/color

For non-JSON values: inline shows old/new as-is (current behavior). Unified shows `-oldValue` / `+newValue`.

### Files to create/modify

| File | Action |
|------|--------|
| `src/lib/diff.ts` | **New** — `jsonDiff()` pure function |
| `src/sidepanel/components/ChangeLog.tsx` | Modify — add summary line, diff toggle, highlighted rendering |
| `src/sidepanel/components/ChangeLog.module.css` | Modify — diff highlight styles |
| `tests/unit/diff.test.ts` | **New** — unit tests for jsonDiff |
| `tests/e2e/extension.spec.ts` | Add — E2E tests for diff display |

### Test plan

**Unit tests (`tests/unit/diff.test.ts`)**:
- Two identical JSON objects → empty changes list
- Top-level field added/removed/modified → correct FieldChange entries
- Nested field changes → dot-notation paths (e.g. `user.settings.theme`)
- Array element changed → index-based path (e.g. `items.0.name`)
- Non-JSON string comparison → single "modified" entry
- Null old value → "added" entry
- Null new value → "removed" entry
- Mixed types (old is string, new is JSON) → "modified"

**E2E tests (`tests/e2e/extension.spec.ts`)**:
- JSON setItem with field changes → collapsed summary shows `~ field` notation
- Expand entry → inline diff highlights visible
- Toggle to unified → unified diff lines visible
- Plain string change → collapsed shows "value changed"
- New key → collapsed shows "(new)"

### GitHub workflow

- **Issue**: "feat: add change log diff highlighting" (label: `feature`)
- **Branch**: `issue-{N}-changelog-diff`
- **PR**: targets `main`, body includes `Closes #{N}`
- **After merge**: bump to v1.1.0, tag `v1.1.0`

---

## Release 2: Fix Interceptor Blocked by Ad Blockers (v1.2.0)

### Problem

The storage interceptor is injected via a dynamically created `<script src="chrome-extension://...">` tag. Ad blockers and strict CSP pages block this load, silently preventing all change monitoring. Confirmed: disabling the ad blocker makes the feature work.

Secondary: Extension-initiated changes (save/delete/import via sidepanel UI) use `chrome.scripting.executeScript` in the ISOLATED world, bypassing the monkey-patched `Storage.prototype`.

### Design

#### Manifest-declared MAIN world content script

Declare `storage-interceptor.js` as a content script with `"world": "MAIN"` in `manifest.json`. Chrome injects manifest content scripts directly, bypassing CSP and ad blockers.

```json
"content_scripts": [
  {
    "matches": ["<all_urls>"],
    "js": ["src/content/monitor.ts"],
    "run_at": "document_idle"
  },
  {
    "matches": ["<all_urls>"],
    "js": ["public/storage-interceptor.js"],
    "run_at": "document_start",
    "world": "MAIN"
  }
]
```

Remove `storage-interceptor.js` from `web_accessible_resources`.

#### Simplify monitor.ts

- Remove `scriptTag`, `injectInterceptor()`, `removeInterceptor()`
- Remove `chrome.runtime.onMessage.addListener` (no START/STOP/FLAG messages)
- Keep `window.addEventListener("message")` listener + batching + relay

The content script always relays events. The sidepanel filters based on `recordingRef.current`.

#### Simplify App.tsx

- Remove `sendRecordingMessage` and its mount `useEffect`
- Recording toggle only controls `recordingRef` + `recording` state (sidepanel-side filtering)

#### Fix extension-initiated changes

Add `world: "MAIN"` to `executeScript` calls for `writeStorage`, `removeFromStorage`, `importToStorage`. Set the extension flag symbol directly in each function:

```ts
(window as Record<symbol, unknown>)[Symbol.for("lsi-extension-flag")] = true;
```

`readStorage` stays in ISOLATED world (read-only).

#### Clean up types

Remove from `src/shared/types.ts`: `StartRecordingMessage`, `StopRecordingMessage`, `SetExtensionFlagMessage`, `SetExtensionFlagResponse`, `MonitorMessage`, `MonitorResponse`.

#### Clean up interceptor

Remove the `SET_EXTENSION_FLAG` listener from `storage-interceptor.js` (flag now set directly by injected functions).

### Files to modify

| File | Action |
|------|--------|
| `manifest.json` | Add interceptor as MAIN world content script; remove from web_accessible_resources |
| `src/content/monitor.ts` | Simplify — remove injection/removal, remove message handlers |
| `src/sidepanel/components/App.tsx` | Remove sendRecordingMessage; add `world: "MAIN"` + flag to write/delete/import |
| `src/shared/types.ts` | Remove unused monitor message types |
| `public/storage-interceptor.js` | Remove SET_EXTENSION_FLAG listener |
| `tests/e2e/extension.spec.ts` | Update recording toggle test; add extension-source tests |

### Test plan

**E2E tests (`tests/e2e/extension.spec.ts`)**:
- Existing page-originated change tests still pass (setItem, removeItem, clear from page)
- Recording toggle: pausing stops entries from appearing, resuming captures new changes
- Extension-initiated save → change entry with `source: "extension"`
- Extension-initiated delete → change entry with `source: "extension"`
- Extension-initiated import → change entries with `source: "extension"`

### GitHub workflow

- **Issue**: "fix: interceptor blocked by ad blockers and CSP" (label: `bug`)
- **Branch**: `issue-{N}-interceptor-csp-fix`
- **PR**: targets `main`, body includes `Closes #{N}`
- **After merge**: bump to v1.2.0, tag `v1.2.0`
