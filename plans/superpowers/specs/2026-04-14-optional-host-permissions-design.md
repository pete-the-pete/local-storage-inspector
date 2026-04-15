# Optional Host Permissions + On-Demand Injection

## Overview

Replace the current declarative `content_scripts` with `matches: ["<all_urls>"]` pattern with a two-tier runtime injection model:

1. **Default**: `activeTab`-gated on-demand injection via `chrome.scripting.executeScript`. Clicking the extension action injects the interceptor and monitor into the current tab and opens the side panel. No install-time warning. Works on any origin the user explicitly opens it against.
2. **Opt-in**: `optional_host_permissions: ["<all_urls>"]` with per-origin `chrome.permissions.request` triggered from an "Always allow on this site" button in the side panel. Granted origins get the scripts registered as persistent content scripts via `chrome.scripting.registerContentScripts`, so monitoring survives full-page reloads and browser restarts.

## Motivation

The current manifest declares:

```json
"content_scripts": [
  { "matches": ["<all_urls>"], "js": ["src/content/monitor.ts"], "run_at": "document_idle" },
  { "matches": ["<all_urls>"], "js": ["public/storage-interceptor.js"], "run_at": "document_start", "world": "MAIN" }
]
```

This surfaces a broad-host install warning, invites heavier Chrome Web Store review, and over-grants for the actual usage pattern (users intentionally open the panel on specific tabs). The same functionality can ship with `activeTab` + an optional, per-origin escalation path.

## User-facing behavior

### Default flow (no host permission granted)

1. User installs extension. No host warning.
2. User visits `app.example.com`.
3. User clicks the extension action icon.
4. Service worker injects the interceptor (MAIN world) and monitor (ISOLATED world) into the current tab, then opens the side panel.
5. Panel shows current storage values and begins recording mutations that happen from this point forward.
6. If the user navigates the tab to a different origin (e.g. `other.com`), the patches are gone (new document). The next click on the extension action re-injects. The `loadEntries` refresh in the panel also re-injects as a safety net, so switching storage type or reopening the panel on the new origin works without a manual click.

### Opt-in flow (persistent per-origin)

1. With the panel open on `app.example.com`, the user sees an origin indicator in the header: `🌐 app.example.com` with an "Always allow" button.
2. Clicking the button calls `chrome.permissions.request({ origins: ["*://app.example.com/*"] })`. Chrome shows its native permission dialog.
3. On grant: the sidepanel calls a helper that (a) calls `chrome.scripting.registerContentScripts` to register the interceptor + monitor as persistent content scripts matching `*://app.example.com/*`, and (b) updates the indicator to `🌐 app.example.com ✓` with a "Revoke" button.
4. The user can now navigate the tab freely within `app.example.com` — full-page reloads, pushState, subroutes — and the change log keeps recording. Closing and reopening the panel, or the entire browser, preserves the grant and the registered scripts.
5. Clicking "Revoke" calls `chrome.permissions.remove({ origins: [...] })`. The `chrome.permissions.onRemoved` listener in the service worker unregisters the content scripts for that origin. Indicator reverts to the "Always allow" state.
6. The user can also revoke via `chrome://extensions → Local Storage Inspector → Site access`. The same `onRemoved` listener handles this path.

### Edge cases

- **Restricted URLs** (`chrome://`, `chrome-extension://`, `edge://`, view-source, the Chrome Web Store): `executeScript` fails with an error. The panel shows a friendly "Storage inspection isn't available on this page" state. The action click still opens the panel so the error is visible; we just skip injection.
- **`file://` URLs**: requires the separate "Allow access to file URLs" toggle per extension. Out of scope for this release — document as a limitation. Panel shows the same "not available" state.
- **Cross-origin navigation with persistent grant**: grant is per-origin. Navigating from `app.example.com` to `other.com` loses monitoring on the new origin unless that origin is also granted. Expected behavior, mirrors how Chrome site-access works.
- **Service worker restart**: MV3 service workers are ephemeral. Registered content scripts persist across service worker restarts because `registerContentScripts` defaults to `persistAcrossSessions: true`. Permission grants persist too. On service worker wake-up we do a reconciliation pass (see "Rehydration" below).

## Permission model

**Before:**

```json
"permissions": ["activeTab", "scripting", "sidePanel"],
"content_scripts": [ /* two entries matching <all_urls> */ ]
```

**After:**

```json
"permissions": ["activeTab", "scripting", "sidePanel"],
"optional_host_permissions": ["<all_urls>"]
```

`activeTab` continues to cover ephemeral reads/writes via `chrome.scripting.executeScript`. `scripting` covers both `executeScript` and `registerContentScripts`. `optional_host_permissions` is the escalation surface for the "Always allow" flow.

### Chrome Web Store justifications

- **`sidePanel`**: The extension's entire UI is rendered in Chrome's side panel so users can inspect and edit the current tab's storage alongside the page they're working on, without a popup closing when focus shifts.
- **`activeTab`**: Required to inject our storage interceptor and monitor into the user's current tab when they click the extension action, and to read/write storage on their behalf from the side panel.
- **`scripting`**: Required to call `chrome.scripting.executeScript` (per-click injection and storage read/write) and `chrome.scripting.registerContentScripts` (persistent monitoring for user-granted origins).
- **`optional_host_permissions: <all_urls>`**: Requested at runtime per-origin, only after the user explicitly clicks "Always allow" in the side panel for a specific site. No broad host access is granted at install. Each grant is scoped to a single origin and used exclusively to register persistent content scripts for storage monitoring on that origin.

## Architecture

### Injection sources

Two scripts, both kept as plain `.js` files in `public/` so Vite copies them unchanged to `dist/` at stable root paths:

- `public/storage-interceptor.js` (existing, unchanged) — MAIN world. Monkey-patches `Storage.prototype.{setItem,removeItem,clear}` to post change events via `window.postMessage`. Already has a `Symbol.for("lsi-original-setItem")` guard against double-patching.
- `public/monitor.js` (new, replaces `src/content/monitor.ts`) — ISOLATED world. Listens for the interceptor's `postMessage` events, batches them, and forwards them to the side panel via `chrome.runtime.sendMessage`. Adds a new `Symbol.for("lsi-monitor-installed")` guard to prevent double-registering the `window.addEventListener("message", ...)` listener on repeat injection.

Both are invoked via `chrome.scripting.executeScript({ files: [...] })` for ephemeral use, and via `chrome.scripting.registerContentScripts({ js: [{ files: [...] }] })` for persistent use. The file contents are byte-identical in both modes.

### New modules

| File | Responsibility |
|------|---------------|
| `public/monitor.js` | Plain JS port of `src/content/monitor.ts`, with idempotency guard. Relays interceptor postMessages to the sidepanel via `chrome.runtime.sendMessage`. |
| `src/lib/inject.ts` | `injectIntoTab(tabId)` — runs `executeScript` for both files, handles errors for restricted URLs, returns an `InjectResult` discriminated union. |
| `src/lib/host-permissions.ts` | Pure + chrome-wrapper helpers: `originToMatchPattern`, `matchPatternToOrigin`, `hasOriginPermission`, `requestOriginPermission`, `removeOriginPermission`, `listGrantedOrigins`. Also `registerScriptsForOrigin` / `unregisterScriptsForOrigin` wrapping `chrome.scripting.registerContentScripts`. |
| `src/sidepanel/components/OriginIndicator.tsx` | `🌐 {origin}` header indicator with Allow / Revoke button. Thin wiring over host-permissions helpers. |
| `src/sidepanel/components/OriginIndicator.module.css` | Styles for the indicator. |
| `tests/unit/host-permissions.test.ts` | Unit tests for the pure match-pattern helpers. |

### Modified files

| File | Change |
|------|--------|
| `manifest.json` | Remove `content_scripts`. Add `optional_host_permissions`. Bump `version` to `1.5.0`. |
| `package.json` | Bump `version` to `1.5.0`. |
| `src/background/service-worker.ts` | On `chrome.action.onClicked`: inject scripts, then open panel. On install/startup: rehydrate registered scripts from `chrome.permissions.getAll()`. Listen to `chrome.permissions.onRemoved` and unregister the matching registered scripts. |
| `src/sidepanel/components/App.tsx` | Inject scripts in `loadEntries` (safety net for navigation). Track current tab origin and its permission state. Render `OriginIndicator` in the header. Subscribe to `chrome.permissions.onAdded` / `onRemoved` to keep indicator state in sync. |
| `src/sidepanel/components/App.module.css` | Accommodate OriginIndicator in header row. |
| `tests/e2e/extension.spec.ts` | Trigger the action click before exercising the interceptor, since it's no longer auto-injected. Verify panel shows storage values on a test page and change log records a live mutation. The persistent-grant flow is not exercised in E2E because `chrome.permissions.request` shows a native dialog that Playwright cannot drive — covered by manual test instead. |

### Files removed

- `src/content/monitor.ts`
- `src/content/` directory (becomes empty after the above removal)

## Match pattern handling

Chrome permission and content-script match patterns are the core data format. The helpers in `src/lib/host-permissions.ts` handle the conversion and validation.

**Origin → match pattern**: Given a tab URL like `https://app.example.com/foo/bar?q=1`, `originToMatchPattern(url)` returns `*://app.example.com/*`. We use `*://` (both `http` and `https`) rather than just `https://` so that a grant covers a site regardless of scheme — it's a dev tool, and devs sometimes use `http://localhost` or `http://legacy.internal`.

**Match pattern → origin**: `matchPatternToOrigin("*://app.example.com/*")` returns `"app.example.com"` — the host portion, used for display in the indicator.

**Rejection of unsupported URLs**: `originToMatchPattern(url)` returns `null` for URLs whose scheme is not `http` or `https` (e.g. `chrome://`, `file://`, `about:`, `data:`). The indicator and inject helper treat a `null` result as "not inspectable — show unsupported state".

**Listing granted origins**: `listGrantedOrigins()` calls `chrome.permissions.getAll()`, reads the `origins` array, and converts each back to a display form via `matchPatternToOrigin`. Filters out any that are not `*://...` host patterns.

## Rehydration

On service worker startup (`chrome.runtime.onInstalled` + `chrome.runtime.onStartup`), reconcile what's registered against what's permitted:

1. `const granted = await chrome.permissions.getAll()` → the canonical source of truth.
2. `const registered = await chrome.scripting.getRegisteredContentScripts()` → current state.
3. For any granted origin with no matching registered script, call `registerScriptsForOrigin(origin)`.
4. For any registered script whose origin is no longer granted (shouldn't happen if `onRemoved` is wired correctly, but belt-and-braces), unregister it.

This guards against drift if the user revoked via `chrome://extensions` while the service worker was asleep and the `onRemoved` event was missed. Chrome *does* deliver queued events to a waking service worker, but explicit reconciliation is cheaper than debugging edge cases later.

## Registered content script shape

For a granted origin `app.example.com`, `registerScriptsForOrigin` registers **two** content scripts in a single call:

```ts
await chrome.scripting.registerContentScripts([
  {
    id: `lsi-interceptor-${origin}`,
    matches: [`*://${origin}/*`],
    js: ["storage-interceptor.js"],
    runAt: "document_start",
    world: "MAIN",
    allFrames: false,
    persistAcrossSessions: true,
  },
  {
    id: `lsi-monitor-${origin}`,
    matches: [`*://${origin}/*`],
    js: ["monitor.js"],
    runAt: "document_idle",
    world: "ISOLATED",
    allFrames: false,
    persistAcrossSessions: true,
  },
]);
```

The ID scheme `lsi-${role}-${origin}` makes unregistration trivial: we know the IDs for any origin without having to query.

## Origin indicator UI

Located in the sidepanel header next to the existing `StorageToggle` and `SearchBar`. Compact, non-intrusive.

**States:**

1. **No origin / unsupported** (`chrome://`, `file://`, error):
   - `🌐 —` (dim), no button. Tooltip: "Storage inspection not available on this page".
2. **Session grant only (activeTab)**:
   - `🌐 app.example.com`, button: **"Always allow"**.
   - Clicking the button triggers `requestOriginPermission(origin)`. Chrome's native dialog appears; on grant, state transitions to (3). On deny, stays in (2).
3. **Persistent grant**:
   - `🌐 app.example.com ✓`, button: **"Revoke"**.
   - Clicking triggers `removeOriginPermission(origin)`. On success, state transitions back to (2).

**Implementation constraint**: `chrome.permissions.request` must be called from a user gesture. A button click in the side panel qualifies, so this is fine. The helper must propagate the call synchronously from the click handler (no `await` before the `permissions.request` line or the gesture association is lost).

## Test plan

**Unit (Vitest):**
- `tests/unit/host-permissions.test.ts` — `originToMatchPattern` / `matchPatternToOrigin` round-trip tests, rejection of non-http(s) schemes, port-included hosts, IPv4 / IPv6 literals, edge cases like `http://localhost:3000`.

**E2E (Playwright):**
- Open the extension on a test page, click the action to open the side panel, verify storage values render.
- Mutate storage from the page and verify the change log records the mutation.
- Verify the origin indicator renders the test page's host.
- The persistent-grant flow (`chrome.permissions.request`) cannot be driven from Playwright — Chrome's permission dialog is OS-level UI. Covered by a manual test step in the PR description instead.

**Manual:**
1. Fresh install from a built `local-storage-inspector-v1.5.0.zip`. Verify no host-permission warning at install time.
2. Visit `https://example.com`, click extension action. Verify panel opens and shows storage.
3. Set a localStorage value from DevTools console. Verify change log records it.
4. Click "Always allow". Verify Chrome dialog appears. Grant.
5. Full-page reload the tab. Verify change log continues recording without re-clicking the action.
6. Click "Revoke". Verify grant is removed and next reload no longer auto-injects.
7. Open `chrome://extensions → Local Storage Inspector → Details → Site access`. Verify the grant appears and can be revoked there; verify in-panel state updates on next panel open.
8. Visit `chrome://extensions` itself. Click extension action. Verify the panel shows the unsupported-page state gracefully.

## GitHub workflow

- **Issue**: "feat: replace broad host permission with activeTab + optional per-origin grants" — labels: `feature`, `v1.5`. Add to project board "Local Storage Inspector v1" (project #3).
- **Branch**: `issue-{N}-optional-host-permissions` from `main`.
- **PR**: targets `main`, body includes `Closes #{N}` and the manual test checklist above.
- **After merge**:
  - `bun run build`
  - Zip `dist/` to `local-storage-inspector-v1.5.0.zip`
  - Upload to Chrome Web Store (update the existing listing, not a new item).
  - Update store justifications per the "Chrome Web Store justifications" section above.
  - Tag `v1.5.0` on `main`.
