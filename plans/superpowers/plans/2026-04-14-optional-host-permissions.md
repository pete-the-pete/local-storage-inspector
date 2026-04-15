# Optional Host Permissions + On-Demand Injection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the declarative `content_scripts` (matches `<all_urls>`) with on-demand injection via `chrome.scripting.executeScript`, gated by `activeTab`, plus a per-origin opt-in flow using `optional_host_permissions` and `chrome.scripting.registerContentScripts` for persistent monitoring on user-approved sites.

**Architecture:** Two plain-JS injectable scripts in `public/` (existing interceptor + a new monitor) serve as both ephemeral `executeScript({ files })` targets and persistent `registerContentScripts({ files })` targets, so a single set of source files powers both injection modes. The service worker handles per-click injection on `chrome.action.onClicked` and reconciles registered scripts against `chrome.permissions.getAll()` on startup. The sidepanel gets an `OriginIndicator` component with Allow/Revoke buttons that drive the permission escalation flow. Pure match-pattern helpers in `src/lib/host-permissions.ts` keep the chrome API glue thin and testable.

**Tech Stack:** TypeScript strict mode, React 19, Chrome MV3 (`chrome.scripting`, `chrome.permissions`, `chrome.sidePanel`, `chrome.action`), CSS Modules, Vitest, Playwright, Vite + @crxjs/vite-plugin, Bun.

**Spec:** `plans/superpowers/specs/2026-04-14-optional-host-permissions-design.md`

---

### File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `public/monitor.js` | Create | Plain-JS port of `src/content/monitor.ts` with idempotency guard. Injected as an ISOLATED-world script (both via `executeScript` and `registerContentScripts`). Listens for `window.postMessage` from the interceptor, batches events, forwards to sidepanel via `chrome.runtime.sendMessage`. |
| `src/content/monitor.ts` | Delete | Logic moves to `public/monitor.js`. |
| `src/content/` | Delete (dir) | Becomes empty. |
| `src/lib/inject.ts` | Create | `injectIntoTab(tabId)` — runs `executeScript` for interceptor (MAIN) and monitor (ISOLATED). Handles restricted URLs by returning a discriminated result rather than throwing. |
| `src/lib/host-permissions.ts` | Create | Pure helpers (`originToMatchPattern`, `matchPatternToOrigin`) + chrome wrappers (`hasOriginPermission`, `requestOriginPermission`, `removeOriginPermission`, `listGrantedOrigins`, `registerScriptsForOrigin`, `unregisterScriptsForOrigin`, `reconcileRegisteredScripts`). |
| `src/sidepanel/components/OriginIndicator.tsx` | Create | Header UI: origin indicator + Allow/Revoke button. Thin wiring over host-permissions helpers. |
| `src/sidepanel/components/OriginIndicator.module.css` | Create | Styles for OriginIndicator. |
| `src/background/service-worker.ts` | Modify | Action click → inject → open panel. `onInstalled` + `onStartup` → rehydrate. `permissions.onRemoved` → unregister. `permissions.onAdded` → register. |
| `src/sidepanel/components/App.tsx` | Modify | Re-inject in `loadEntries`. Track current tab origin and its permission state. Render OriginIndicator in header. Subscribe to `permissions.onAdded` / `onRemoved`. |
| `src/sidepanel/components/App.module.css` | Modify | Header layout accommodates OriginIndicator. |
| `manifest.json` | Modify | Remove `content_scripts`. Add `optional_host_permissions: ["<all_urls>"]`. Bump version to `1.5.0`. |
| `package.json` | Modify | Bump version to `1.5.0`. |
| `tests/unit/host-permissions.test.ts` | Create | Unit tests for `originToMatchPattern` / `matchPatternToOrigin`. |
| `tests/e2e/extension.spec.ts` | Modify | Trigger action click before testing interceptor behavior (no longer auto-injected). |

---

### Task 1: GitHub Setup

**Files:** none (GitHub-only)

- [ ] **Step 1: Create issue**

```bash
gh issue create \
  --title "feat: replace broad host permission with activeTab + optional per-origin grants" \
  --label "feature" \
  --body "$(cat <<'EOF'
## Summary
Remove the declarative `content_scripts` matches `<all_urls>` and replace with on-demand injection via `chrome.scripting.executeScript` (gated by `activeTab`), plus an opt-in per-origin escalation flow using `optional_host_permissions` and `chrome.scripting.registerContentScripts`. Eliminates the install-time broad-host warning and matches how the extension is actually used.

## Spec
See `plans/superpowers/specs/2026-04-14-optional-host-permissions-design.md`.

## Plan
See `plans/superpowers/plans/2026-04-14-optional-host-permissions.md`.

## Acceptance criteria
- [ ] Installing the extension shows no host-permission warning.
- [ ] Clicking the action on any http(s) page opens the side panel and shows the tab's storage.
- [ ] Storage edits from the panel write to the page correctly.
- [ ] Change log records mutations that happen after the panel is opened on the current tab.
- [ ] Clicking "Always allow on this site" triggers Chrome's native permission dialog; after granting, the change log continues recording across a full-page reload without re-clicking the action.
- [ ] Revoking in-panel (or via `chrome://extensions`) stops monitoring on that origin and unregisters the content script.
- [ ] Version bumped to 1.5.0 in `package.json` and `manifest.json`.
- [ ] Lint, unit tests, and E2E tests green.
- [ ] Store listing updated post-merge: new zip, refreshed justifications, `optional_host_permissions` justification added.
EOF
)"
```

Expected: prints the new issue URL. Note the issue number for later steps.

- [ ] **Step 2: Add issue to project board**

```bash
gh project item-add 3 --owner pete-the-pete --url <ISSUE_URL_FROM_STEP_1>
```

Expected: prints the added item ID.

- [ ] **Step 3: Create branch**

```bash
git checkout -b issue-<N>-optional-host-permissions main
```

Replace `<N>` with the issue number from Step 1.

---

### Task 2: Port monitor.ts to public/monitor.js

**Files:**
- Create: `public/monitor.js`
- Delete: `src/content/monitor.ts` (happens in Task 6, after the new file is wired up)

**Why plain JS in `public/`**: Vite copies `public/*` to `dist/*` untouched, giving us a stable file path (`monitor.js` at the extension root) that both `chrome.scripting.executeScript({ files: ["monitor.js"] })` and `chrome.scripting.registerContentScripts({ js: [{ files: ["monitor.js"] }] })` can reference. The existing `storage-interceptor.js` already lives in `public/` for the same reason, so this matches precedent.

- [ ] **Step 1: Create `public/monitor.js` with idempotency guard**

```javascript
// ISOLATED world content script — relays change events from the MAIN world
// interceptor to the sidepanel via chrome.runtime.sendMessage.
//
// Injected on demand from the service worker (chrome.scripting.executeScript)
// and from the sidepanel (loadEntries safety-net), and also as a registered
// content script for origins the user has granted persistent access to.

(function () {
  "use strict";

  // Guard against double-injection on the same document: the interceptor has
  // its own guard, but without this one we would double-register the message
  // listener and duplicate every change event.
  const INSTALLED = Symbol.for("lsi-monitor-installed");
  if (window[INSTALLED]) return;
  window[INSTALLED] = true;

  const BATCH_INTERVAL_MS = 50;

  let batchBuffer = [];
  let batchTimer = null;

  function isValidStorageChangeData(data) {
    if (typeof data !== "object" || data === null) return false;
    const validStorageTypes = ["localStorage", "sessionStorage"];
    const validOperations = ["setItem", "removeItem", "clear"];
    const validSources = ["page", "extension", "unknown"];
    return (
      typeof data.storageType === "string" &&
      validStorageTypes.includes(data.storageType) &&
      typeof data.operation === "string" &&
      validOperations.includes(data.operation) &&
      typeof data.source === "string" &&
      validSources.includes(data.source) &&
      typeof data.timestamp === "number" &&
      (typeof data.key === "string" || data.key === null) &&
      (typeof data.oldValue === "string" || data.oldValue === null) &&
      (typeof data.newValue === "string" || data.newValue === null)
    );
  }

  function flushBatch() {
    if (batchBuffer.length === 0) return;

    const message = {
      type: "STORAGE_CHANGE",
      changes: batchBuffer,
    };
    batchBuffer = [];
    batchTimer = null;

    chrome.runtime.sendMessage(message).catch(function () {
      // Sidepanel may not be open — silently drop.
    });
  }

  function queueChange(event) {
    batchBuffer.push(event);
    if (!batchTimer) {
      batchTimer = setTimeout(flushBatch, BATCH_INTERVAL_MS);
    }
  }

  window.addEventListener("message", function (event) {
    if (!event.data || event.data._lsi !== "interceptor") return;
    if (!isValidStorageChangeData(event.data)) return;

    queueChange({
      storageType: event.data.storageType,
      operation: event.data.operation,
      key: event.data.key,
      oldValue: event.data.oldValue,
      newValue: event.data.newValue,
      timestamp: event.data.timestamp,
      source: event.data.source,
    });
  });
})();
```

- [ ] **Step 2: Verify both public/ scripts land at stable dist/ root paths**

The plan depends on Vite stripping the `public/` prefix when it copies static assets, so `chrome.scripting.executeScript({ files: ["monitor.js"] })` and `registerContentScripts({ js: ["monitor.js"] })` both resolve. Verify NOW — if this is wrong, every later task silently breaks at runtime.

Background: in the current build, `storage-interceptor.js` is double-emitted. Vite copies it from `public/` to `dist/storage-interceptor.js` (root), and crxjs ALSO bundles it into `dist/assets/storage-interceptor.js-<HASH>.js` because the source manifest references it from `content_scripts`. The Chrome runtime uses the hashed version today. After Task 7 removes `content_scripts` entirely, crxjs stops hashing these files and only the Vite public-dir copy remains. That's the path the plan relies on.

```bash
bun run build
ls dist/monitor.js dist/storage-interceptor.js
```

Expected: BOTH files exist at the dist root. At this point in the sequence, `content_scripts` is still in the source manifest, so crxjs is still hashing `storage-interceptor.js` into `dist/assets/` — that's fine, it won't affect `monitor.js` which is new and unreferenced.

If `dist/monitor.js` is missing: Vite isn't copying `public/monitor.js`. Stop the task and investigate `vite.config.ts` / crxjs version before continuing — otherwise Task 5 and Task 6 will compile fine but fail at runtime with a cryptic "Could not load file" error that's hard to trace back to here.

Note: `dist/public/icons/` exists alongside `dist/icons/`. That's a pre-existing quirk — crxjs copies icon paths verbatim from the manifest (which references `public/icons/...`) while Vite also copies `public/*`. Harmless; do not touch it in this PR.

- [ ] **Step 3: Commit**

```bash
git add public/monitor.js
git commit -m "feat: add public/monitor.js for on-demand injection"
```

---

### Task 3: Pure match-pattern helpers + reconciliation (TDD)

**Files:**
- Create: `src/lib/host-permissions.ts` (pure fns only in this task)
- Create: `tests/unit/host-permissions.test.ts`

We're splitting host-permissions into two tasks: pure helpers first (fully testable), then chrome-API wrappers (thin glue, no unit tests because mocking chrome is more noise than signal). This task covers the pure half.

Critically, the reconciliation logic (compute which origins to register and which to unregister based on current grants vs current registrations) goes here as a pure function `computeReconciliation(granted, registered)`. The chrome-API wrapper `reconcileRegisteredScripts` in Task 4 becomes thin glue around it. This is the trickiest piece of logic in the whole plan and the set-diff MUST be unit-tested — leaving it embedded in an async chrome wrapper would mean it's only ever exercised via manual QA.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/host-permissions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { originToMatchPattern, matchPatternToOrigin } from "@/lib/host-permissions";

describe("originToMatchPattern", () => {
  it("converts an https URL to a scheme-agnostic host match pattern", () => {
    expect(originToMatchPattern("https://app.example.com/foo/bar?q=1")).toBe("*://app.example.com/*");
  });

  it("converts an http URL to the same scheme-agnostic pattern", () => {
    expect(originToMatchPattern("http://app.example.com/")).toBe("*://app.example.com/*");
  });

  it("preserves a non-default port", () => {
    expect(originToMatchPattern("http://localhost:3000/")).toBe("*://localhost:3000/*");
  });

  it("returns null for chrome:// URLs", () => {
    expect(originToMatchPattern("chrome://extensions")).toBeNull();
  });

  it("returns null for chrome-extension:// URLs", () => {
    expect(originToMatchPattern("chrome-extension://abc/popup.html")).toBeNull();
  });

  it("returns null for file:// URLs", () => {
    expect(originToMatchPattern("file:///Users/pete/foo.html")).toBeNull();
  });

  it("returns null for about:blank", () => {
    expect(originToMatchPattern("about:blank")).toBeNull();
  });

  it("returns null for data: URLs", () => {
    expect(originToMatchPattern("data:text/html,<p>hi</p>")).toBeNull();
  });

  it("returns null for malformed URLs", () => {
    expect(originToMatchPattern("not a url")).toBeNull();
  });

  it("returns null for undefined / empty", () => {
    expect(originToMatchPattern(undefined)).toBeNull();
    expect(originToMatchPattern("")).toBeNull();
  });
});

describe("matchPatternToOrigin", () => {
  it("extracts the host from a scheme-agnostic match pattern", () => {
    expect(matchPatternToOrigin("*://app.example.com/*")).toBe("app.example.com");
  });

  it("preserves the port when present", () => {
    expect(matchPatternToOrigin("*://localhost:3000/*")).toBe("localhost:3000");
  });

  it("returns null for unrecognized patterns", () => {
    expect(matchPatternToOrigin("<all_urls>")).toBeNull();
    expect(matchPatternToOrigin("https://example.com/*")).toBeNull();
    expect(matchPatternToOrigin("")).toBeNull();
  });
});

describe("originToMatchPattern + matchPatternToOrigin round-trip", () => {
  const urls = [
    "https://example.com/",
    "https://app.example.com/",
    "http://localhost:3000/",
    "http://127.0.0.1:8080/foo",
  ];

  it.each(urls)("round-trips %s", (url) => {
    const pattern = originToMatchPattern(url);
    expect(pattern).not.toBeNull();
    const origin = matchPatternToOrigin(pattern!);
    expect(origin).toBe(new URL(url).host);
  });
});

describe("computeReconciliation", () => {
  it("returns nothing to add or remove when the sets match", () => {
    expect(computeReconciliation(["a.com", "b.com"], ["a.com", "b.com"])).toEqual({
      toAdd: [],
      toRemove: [],
    });
  });

  it("detects origins to add (granted but not registered)", () => {
    expect(computeReconciliation(["a.com", "b.com"], ["a.com"])).toEqual({
      toAdd: ["b.com"],
      toRemove: [],
    });
  });

  it("detects origins to remove (registered but not granted)", () => {
    expect(computeReconciliation(["a.com"], ["a.com", "b.com"])).toEqual({
      toAdd: [],
      toRemove: ["b.com"],
    });
  });

  it("handles simultaneous adds and removes", () => {
    expect(computeReconciliation(["a.com", "c.com"], ["a.com", "b.com"])).toEqual({
      toAdd: ["c.com"],
      toRemove: ["b.com"],
    });
  });

  it("handles empty inputs", () => {
    expect(computeReconciliation([], [])).toEqual({ toAdd: [], toRemove: [] });
    expect(computeReconciliation(["a.com"], [])).toEqual({ toAdd: ["a.com"], toRemove: [] });
    expect(computeReconciliation([], ["a.com"])).toEqual({ toAdd: [], toRemove: ["a.com"] });
  });

  it("is order-insensitive for input lists", () => {
    expect(computeReconciliation(["b.com", "a.com"], ["a.com", "b.com"])).toEqual({
      toAdd: [],
      toRemove: [],
    });
  });
});
```

And update the import line at the top of the test file to include the new name:

```ts
import { originToMatchPattern, matchPatternToOrigin, computeReconciliation } from "@/lib/host-permissions";
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
bun run test tests/unit/host-permissions.test.ts
```

Expected: FAIL with "Cannot find module '@/lib/host-permissions'" or similar.

- [ ] **Step 3: Create `src/lib/host-permissions.ts` with the pure helpers**

```ts
// Pure helpers for converting between tab URLs and Chrome host match patterns,
// plus chrome-API wrappers for requesting, listing, and removing per-origin
// permissions and registering content scripts for granted origins.
//
// This file has two halves. The top half is pure and unit-tested. The bottom
// half wraps chrome.* APIs and is exercised via integration / manual testing.

export function originToMatchPattern(url: string | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  // parsed.host includes the port if present.
  return `*://${parsed.host}/*`;
}

export function matchPatternToOrigin(pattern: string): string | null {
  // We only recognize our own format: `*://<host>/*`. Anything else (including
  // scheme-specific patterns or <all_urls>) returns null — callers treat that
  // as "not a per-origin grant we manage".
  const match = pattern.match(/^\*:\/\/([^/]+)\/\*$/);
  return match ? match[1] : null;
}

export interface ReconciliationPlan {
  toAdd: string[];
  toRemove: string[];
}

/**
 * Given the set of origins the user has currently granted and the set of
 * origins we currently have content scripts registered for, compute the
 * minimal set of register/unregister operations needed to make them match.
 * Pure — no chrome API access. Order of the returned arrays follows the
 * input order of `granted` (for toAdd) and `registered` (for toRemove) so
 * that results are deterministic and easy to assert on.
 */
export function computeReconciliation(
  granted: string[],
  registered: string[],
): ReconciliationPlan {
  const grantedSet = new Set(granted);
  const registeredSet = new Set(registered);
  return {
    toAdd: granted.filter((origin) => !registeredSet.has(origin)),
    toRemove: registered.filter((origin) => !grantedSet.has(origin)),
  };
}
```

- [ ] **Step 4: Run the test and verify it passes**

```bash
bun run test tests/unit/host-permissions.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/host-permissions.ts tests/unit/host-permissions.test.ts
git commit -m "feat: add host-permission match-pattern helpers"
```

---

### Task 4: Chrome API wrappers in host-permissions.ts

**Files:**
- Modify: `src/lib/host-permissions.ts` (append chrome-wrapper half)

No unit tests for this half — mocking `chrome.permissions` / `chrome.scripting` per call is more code than the code under test, and the real validation is the E2E + manual tests later. The shapes are small enough to review by eye.

- [ ] **Step 1: Append chrome-wrapper helpers to `src/lib/host-permissions.ts`**

Append to the existing file (below `matchPatternToOrigin`):

```ts
// ---------- chrome.* wrappers ----------

export async function hasOriginPermission(origin: string): Promise<boolean> {
  return chrome.permissions.contains({ origins: [`*://${origin}/*`] });
}

/**
 * Request permission for an origin. MUST be called synchronously from a user
 * gesture (e.g. directly in an onClick handler) — do NOT await anything
 * between the user click and this call, or Chrome will reject the request.
 */
export async function requestOriginPermission(origin: string): Promise<boolean> {
  return chrome.permissions.request({ origins: [`*://${origin}/*`] });
}

export async function removeOriginPermission(origin: string): Promise<boolean> {
  return chrome.permissions.remove({ origins: [`*://${origin}/*`] });
}

export async function listGrantedOrigins(): Promise<string[]> {
  const permissions = await chrome.permissions.getAll();
  const origins = permissions.origins ?? [];
  return origins
    .map((pattern) => matchPatternToOrigin(pattern))
    .filter((origin): origin is string => origin !== null);
}

// ---------- content script registration ----------

function interceptorScriptId(origin: string): string {
  return `lsi-interceptor-${origin}`;
}

function monitorScriptId(origin: string): string {
  return `lsi-monitor-${origin}`;
}

export async function registerScriptsForOrigin(origin: string): Promise<void> {
  const matches = [`*://${origin}/*`];
  await chrome.scripting.registerContentScripts([
    {
      id: interceptorScriptId(origin),
      matches,
      js: ["storage-interceptor.js"],
      runAt: "document_start",
      world: "MAIN",
      allFrames: false,
      persistAcrossSessions: true,
    },
    {
      id: monitorScriptId(origin),
      matches,
      js: ["monitor.js"],
      runAt: "document_idle",
      world: "ISOLATED",
      allFrames: false,
      persistAcrossSessions: true,
    },
  ]);
}

export async function unregisterScriptsForOrigin(origin: string): Promise<void> {
  const ids = [interceptorScriptId(origin), monitorScriptId(origin)];
  try {
    await chrome.scripting.unregisterContentScripts({ ids });
  } catch {
    // Already unregistered — ignore. Unregister errors only on unknown IDs,
    // which is fine for our idempotent use.
  }
}

/**
 * Reconcile registered content scripts against currently-granted origins.
 * Called on service worker install/startup to repair any drift. The
 * set-diff logic lives in the pure `computeReconciliation` helper (unit
 * tested in Task 3); this wrapper is thin chrome glue.
 */
export async function reconcileRegisteredScripts(): Promise<void> {
  const granted = await listGrantedOrigins();
  const registered = await chrome.scripting.getRegisteredContentScripts();

  const registeredOrigins: string[] = [];
  for (const script of registered) {
    if (script.id.startsWith("lsi-interceptor-")) {
      registeredOrigins.push(script.id.slice("lsi-interceptor-".length));
    }
  }

  const { toAdd, toRemove } = computeReconciliation(granted, registeredOrigins);
  for (const origin of toAdd) {
    await registerScriptsForOrigin(origin);
  }
  for (const origin of toRemove) {
    await unregisterScriptsForOrigin(origin);
  }
}
```

- [ ] **Step 2: Type-check the file**

```bash
bun run build
```

Expected: build succeeds. (We're not importing the new helpers from anywhere yet, but tsc still checks the file for type errors as part of the project.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/host-permissions.ts
git commit -m "feat: add chrome.permissions + scripting wrappers for host-permissions"
```

---

### Task 5: Inject helper

**Files:**
- Create: `src/lib/inject.ts`

- [ ] **Step 1: Create `src/lib/inject.ts`**

```ts
// Injects the interceptor (MAIN world) and monitor (ISOLATED world) into a
// tab. Both files live in public/ and are copied to dist/ at stable root
// paths by Vite, so the file names here do NOT include a "public/" prefix —
// they are relative to the extension root at runtime.

export type InjectResult =
  | { status: "ok" }
  | { status: "unsupported"; reason: string }
  | { status: "error"; error: string };

const INTERCEPTOR_FILE = "storage-interceptor.js";
const MONITOR_FILE = "monitor.js";

export async function injectIntoTab(tabId: number): Promise<InjectResult> {
  try {
    // ORDER MATTERS: inject ISOLATED (monitor) first, then MAIN
    // (interceptor). The interceptor posts events via window.postMessage
    // the moment it installs; the monitor listens via
    // window.addEventListener("message", ...). If we injected MAIN first,
    // any page mutation happening in the brief window before ISOLATED
    // lands would fire postMessage with no listener attached and the
    // event would be lost. Inverting the order closes that gap.
    await chrome.scripting.executeScript({
      target: { tabId },
      world: "ISOLATED",
      files: [MONITOR_FILE],
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      files: [INTERCEPTOR_FILE],
    });
    return { status: "ok" };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // Chrome throws specific errors for restricted URLs. Treat these as
    // "unsupported" (soft failure — the panel will show a friendly state)
    // rather than "error" (which signals a real problem to the user).
    if (
      message.includes("Cannot access") ||
      message.includes("restricted") ||
      message.includes("chrome://") ||
      message.includes("chrome-extension://")
    ) {
      return { status: "unsupported", reason: message };
    }
    return { status: "error", error: message };
  }
}
```

- [ ] **Step 2: Type-check**

```bash
bun run build
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/lib/inject.ts
git commit -m "feat: add injectIntoTab helper for on-demand script injection"
```

---

### Task 6: Service worker rewrite

**Files:**
- Modify: `src/background/service-worker.ts`

The existing service worker is 5 lines. After this task it handles five events: action click (open panel only), install (reconcile), startup (reconcile), permission addition (register), and permission removal (unregister).

**Why `src/content/monitor.ts` is NOT deleted here.** The source manifest still declares it under `content_scripts` until Task 7 rewrites the manifest. Deleting the file in this task would break the Task 6 build: crxjs resolves `content_scripts` inputs at build time and fails hard on a missing file. Orphaning the file for exactly one task is fine — the new service worker does not import it, and crxjs happily keeps hashing the content_script entry until the manifest rewrite lands in Task 7. The delete moves to Task 7, paired with the manifest edit that makes it safe.

**Design note — why the action click does NOT inject.** An earlier draft had the service worker inject scripts in `action.onClicked` and the panel ALSO inject in `loadEntries`. That double-injects on every click (idempotent but wasteful) and spreads the "when to inject" decision across two files. In this version the service worker's only click-time job is `chrome.sidePanel.open`; the panel's `loadEntries` owns injection. There is exactly one injection per panel open, in exactly one place. Every storage operation the panel does (`readStorage`, `writeStorage`, etc.) already flows through the panel, so putting injection in the panel means it can't be forgotten.

- [ ] **Step 1: Replace `src/background/service-worker.ts` with the new implementation**

```ts
import {
  matchPatternToOrigin,
  reconcileRegisteredScripts,
  registerScriptsForOrigin,
  unregisterScriptsForOrigin,
} from "@/lib/host-permissions";

chrome.action.onClicked.addListener((tab) => {
  if (tab.id === undefined) return;
  // Injection happens in the sidepanel's loadEntries — the only job here
  // is to open the panel. See design note in the task header.
  chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onInstalled.addListener(() => {
  void reconcileRegisteredScripts();
});

chrome.runtime.onStartup.addListener(() => {
  void reconcileRegisteredScripts();
});

chrome.permissions.onAdded.addListener((permissions) => {
  const origins = permissions.origins ?? [];
  for (const pattern of origins) {
    const origin = matchPatternToOrigin(pattern);
    if (origin) {
      void registerScriptsForOrigin(origin);
    }
  }
});

chrome.permissions.onRemoved.addListener((permissions) => {
  const origins = permissions.origins ?? [];
  for (const pattern of origins) {
    const origin = matchPatternToOrigin(pattern);
    if (origin) {
      void unregisterScriptsForOrigin(origin);
    }
  }
});
```

- [ ] **Step 2: Type-check**

```bash
bun run build
```

Expected: build succeeds. At this point `src/content/monitor.ts` is an orphan relative to the new service worker, but the source manifest still references it via `content_scripts`, so crxjs still hashes it into `dist/assets/` — same behavior as before this task. That reference (and the file) both go away in Task 7.

- [ ] **Step 3: Commit**

```bash
git add src/background/service-worker.ts
git commit -m "feat: service worker handles action click injection + permission sync"
```

---

### Task 7: Manifest changes and content-script cleanup

**Files:**
- Modify: `manifest.json`
- Modify: `package.json`
- Delete: `src/content/monitor.ts`
- Delete: `src/content/` (directory — becomes empty)

This task removes the declarative `content_scripts` entry AND deletes the now-orphaned TypeScript source, in that order. They must be combined: deleting `src/content/monitor.ts` before removing the `content_scripts` entry breaks the build (dangling manifest reference), and removing the manifest entry without deleting the source leaves a stale orphan that future grep/lint/refactor work will trip over.

- [ ] **Step 1: Replace `manifest.json` with the new version**

```json
{
  "manifest_version": 3,
  "name": "Local Storage Inspector",
  "version": "1.5.0",
  "description": "View and edit localStorage and sessionStorage with a proper JSON editor",
  "permissions": ["activeTab", "scripting", "sidePanel"],
  "optional_host_permissions": ["<all_urls>"],
  "action": {
    "default_title": "Local Storage Inspector",
    "default_icon": {
      "16": "public/icons/icon-16.png",
      "32": "public/icons/icon-32.png",
      "48": "public/icons/icon-48.png"
    }
  },
  "side_panel": {
    "default_path": "src/sidepanel/sidepanel.html"
  },
  "icons": {
    "16": "public/icons/icon-16.png",
    "32": "public/icons/icon-32.png",
    "48": "public/icons/icon-48.png",
    "128": "public/icons/icon-128.png"
  },
  "background": {
    "service_worker": "src/background/service-worker.ts"
  }
}
```

Diff from before: removed the `content_scripts` array entirely, added `optional_host_permissions`, bumped `version`. Note that `web_accessible_resources` (which was an empty array) is also removed since it wasn't being used.

- [ ] **Step 2: Bump `package.json` version**

Change `"version": "1.4.0"` → `"version": "1.5.0"` in `package.json`.

- [ ] **Step 3: Delete the old content script and its directory**

Now safe: the manifest no longer references `src/content/monitor.ts`.

```bash
git rm src/content/monitor.ts
rmdir src/content
```

Expected: `src/content/` is gone. If `rmdir` complains the directory is not empty, stop — something unexpected is in there and needs investigation rather than `rm -rf`.

- [ ] **Step 4: Build and verify the dist manifest**

```bash
bun run build
cat dist/manifest.json
```

Expected output should contain:
- `"version": "1.5.0"`
- `"optional_host_permissions": ["<all_urls>"]`
- NO `content_scripts` key
- `"permissions": ["activeTab", "scripting", "sidePanel"]`

Also verify `dist/monitor.js` and `dist/storage-interceptor.js` both exist at the root (from `public/` copy):

```bash
ls dist/monitor.js dist/storage-interceptor.js
```

Expected: both files exist.

- [ ] **Step 5: Commit**

```bash
git add manifest.json package.json
git commit -m "chore: remove content_scripts, add optional_host_permissions, bump to v1.5.0"
```

The `git rm` from Step 3 is already staged, so this single commit captures the manifest edit, version bumps, and the source deletion together — which is the correct atomic unit (any one of them alone would fail to build).

---

### Task 8: OriginIndicator component

**Files:**
- Create: `src/sidepanel/components/OriginIndicator.tsx`
- Create: `src/sidepanel/components/OriginIndicator.module.css`

Thin presentational component. It receives origin + permission state as props and exposes `onAllow` / `onRevoke` callbacks. All chrome API calls happen in App.tsx — this component is pure React.

- [ ] **Step 1: Create `src/sidepanel/components/OriginIndicator.module.css`**

```css
.indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  font-size: 12px;
  color: #333;
  background: #f6f6f6;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
}

.icon {
  flex-shrink: 0;
}

.origin {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.granted {
  color: #0a7a0a;
  flex-shrink: 0;
}

.button {
  flex-shrink: 0;
  background: transparent;
  border: 1px solid #bbb;
  border-radius: 3px;
  padding: 2px 8px;
  font-size: 11px;
  cursor: pointer;
  color: #333;
}

.button:hover {
  background: #eaeaea;
  border-color: #999;
}

.unsupported {
  color: #888;
}
```

- [ ] **Step 2: Create `src/sidepanel/components/OriginIndicator.tsx`**

```tsx
import styles from "./OriginIndicator.module.css";

export type OriginState =
  | { kind: "loading" }
  | { kind: "unsupported" }
  | { kind: "session"; origin: string }
  | { kind: "persistent"; origin: string };

interface Props {
  state: OriginState;
  onAllow: () => void;
  onRevoke: () => void;
}

const GLOBE = "\u{1F310}";
const CHECK = "\u2713";

export function OriginIndicator({ state, onAllow, onRevoke }: Props) {
  if (state.kind === "loading") {
    return (
      <div className={styles.indicator}>
        <span className={styles.icon}>{GLOBE}</span>
        <span className={styles.origin}>…</span>
      </div>
    );
  }

  if (state.kind === "unsupported") {
    return (
      <div
        className={`${styles.indicator} ${styles.unsupported}`}
        title="Storage inspection not available on this page"
      >
        <span className={styles.icon}>{GLOBE}</span>
        <span className={styles.origin}>—</span>
      </div>
    );
  }

  if (state.kind === "session") {
    return (
      <div className={styles.indicator}>
        <span className={styles.icon}>{GLOBE}</span>
        <span className={styles.origin} title={state.origin}>{state.origin}</span>
        <button type="button" className={styles.button} onClick={onAllow}>
          Always allow
        </button>
      </div>
    );
  }

  // persistent
  return (
    <div className={styles.indicator}>
      <span className={styles.icon}>{GLOBE}</span>
      <span className={styles.origin} title={state.origin}>{state.origin}</span>
      <span className={styles.granted} aria-label="persistent access granted">{CHECK}</span>
      <button type="button" className={styles.button} onClick={onRevoke}>
        Revoke
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
bun run build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/sidepanel/components/OriginIndicator.tsx src/sidepanel/components/OriginIndicator.module.css
git commit -m "feat: add OriginIndicator component"
```

---

### Task 9: Wire injection and OriginIndicator into App.tsx

**Files:**
- Modify: `src/sidepanel/components/App.tsx`
- Modify: `src/sidepanel/components/App.module.css`

This is the biggest wiring task. It does six things:
1. Imports `injectIntoTab` and calls it inside `loadEntries` after `getActiveTabId()`.
2. Tracks the active tab's current URL (via `chrome.tabs.query`), derives origin + permission state, stores as `OriginState`.
3. Renders `OriginIndicator` in the header row.
4. Handles `onAllow` / `onRevoke`, respecting the user-gesture constraint for `permissions.request`.
5. Subscribes to `chrome.permissions.onAdded` / `onRemoved` to keep the indicator in sync when the user revokes via `chrome://extensions`.
6. No changes to `readStorage` / `writeStorage` / `removeFromStorage` / `importToStorage` — those already go through `chrome.scripting.executeScript` with `activeTab` and continue to work unchanged.

- [ ] **Step 1: Update imports at the top of `App.tsx`**

Find the existing imports block and replace it with:

```tsx
import { useState, useCallback, useRef, useEffect } from "react";
import type { StorageType, StorageEntry, StorageChangeEvent, StorageChangePortMessage } from "@/shared/types";

import { filterEntries } from "@/lib/filter";
import { getActiveTabId, readStorage, writeStorage, removeFromStorage, importToStorage } from "@/lib/storage";
import { injectIntoTab } from "@/lib/inject";
import {
  originToMatchPattern,
  matchPatternToOrigin,
  hasOriginPermission,
  requestOriginPermission,
  removeOriginPermission,
} from "@/lib/host-permissions";
import styles from "./App.module.css";
import { StorageToggle } from "./StorageToggle";
import { SearchBar } from "./SearchBar";
import { KeyList } from "./KeyList";
import { ValueEditor } from "./ValueEditor";
import { ImportExport } from "./ImportExport";
import { ChangeLog } from "./ChangeLog";
import { ResizeHandle } from "./ResizeHandle";
import { OriginIndicator, type OriginState } from "./OriginIndicator";
```

- [ ] **Step 2: Add origin state and its computation helper inside the `App` component**

Add the following block immediately after `const [truncatedCount, setTruncatedCount] = useState(0);` (existing line ~28):

```tsx
  const [originState, setOriginState] = useState<OriginState>({ kind: "loading" });

  const refreshOriginState = useCallback(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const pattern = originToMatchPattern(tab?.url);
    if (!pattern) {
      setOriginState({ kind: "unsupported" });
      return;
    }
    const origin = matchPatternToOrigin(pattern);
    if (!origin) {
      setOriginState({ kind: "unsupported" });
      return;
    }
    const granted = await hasOriginPermission(origin);
    setOriginState(granted ? { kind: "persistent", origin } : { kind: "session", origin });
  }, []);
```

- [ ] **Step 3: Update `loadEntries` to inject scripts on every load**

Find the existing `loadEntries` (around line 98) and replace with:

```tsx
  const loadEntries = useCallback(async (type: StorageType) => {
    setLoadState("loading");
    setSelectedKey(null);
    try {
      const tabId = await getActiveTabId();
      if (!tabId) {
        setErrorMessage("No active tab found");
        setLoadState("error");
        return;
      }

      // Re-inject on every load. Idempotent at the page level thanks to the
      // guards in the interceptor and monitor, and safely handles the case
      // where the user navigated the tab while the panel was open.
      const injectResult = await injectIntoTab(tabId);
      if (injectResult.status === "unsupported") {
        setErrorMessage("Storage inspection isn't available on this page.");
        setLoadState("error");
        void refreshOriginState();
        return;
      }

      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: readStorage,
        args: [type],
      });

      const tabEntries = results[0]?.result ?? [];
      setEntries(tabEntries);
      setLoadState("ready");
      void refreshOriginState();
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "Failed to load storage");
      setLoadState("error");
    }
  }, [refreshOriginState]);
```

- [ ] **Step 4: Add allow / revoke handlers**

Add these handlers after `handleImport` (around line 182):

```tsx
  const handleAllowOrigin = useCallback(() => {
    // IMPORTANT: do NOT await anything before requestOriginPermission —
    // Chrome requires this call to be inside the user-gesture handler, and
    // any await before it breaks the gesture association.
    //
    // We set originState optimistically on grant and trust the
    // permissions.onAdded subscription (Step 5) to refresh if anything
    // else changes. No setTimeout / reconcile dance: the UI only cares
    // about chrome.permissions.getAll, which already reflects the grant
    // by the time the .then callback runs. The service worker's parallel
    // registerScriptsForOrigin call is a side effect the UI does not
    // wait on.
    if (originState.kind !== "session") return;
    const origin = originState.origin;
    requestOriginPermission(origin).then((granted) => {
      if (granted) {
        setOriginState({ kind: "persistent", origin });
      }
    });
  }, [originState]);

  const handleRevokeOrigin = useCallback(async () => {
    // Existing change log entries stay visible after revoke; only new
    // events stop flowing. The service worker's permissions.onRemoved
    // handler unregisters the persistent content script, and any
    // ephemeral monitor injected via executeScript dies on the next
    // navigation since activeTab is also gone. This is intentional —
    // silently purging the user's existing history would be more
    // surprising than leaving it in place.
    if (originState.kind !== "persistent") return;
    const origin = originState.origin;
    const removed = await removeOriginPermission(origin);
    if (removed) {
      setOriginState({ kind: "session", origin });
    }
  }, [originState]);
```

- [ ] **Step 5: Subscribe to `chrome.permissions` and `chrome.tabs.onUpdated` events**

Two effects. Add them inside the `App` component, next to the existing `chrome.runtime.onMessage` effect.

The permissions effect keeps the `OriginIndicator` in sync when the user grants or revokes via either the in-panel button OR `chrome://extensions`:

```tsx
  useEffect(() => {
    const handleAdded = () => { void refreshOriginState(); };
    const handleRemoved = () => { void refreshOriginState(); };
    chrome.permissions.onAdded.addListener(handleAdded);
    chrome.permissions.onRemoved.addListener(handleRemoved);
    void refreshOriginState();
    return () => {
      chrome.permissions.onAdded.removeListener(handleAdded);
      chrome.permissions.onRemoved.removeListener(handleRemoved);
    };
  }, [refreshOriginState]);
```

The tab-update effect covers the case where the user navigates the currently-active tab while the panel stays open. Without this, the indicator would show a stale origin and `loadEntries` would never re-fire, leaving the panel pointing at whichever origin happened to be active when the panel opened:

```tsx
  useEffect(() => {
    const handleTabUpdated = (
      tabId: number,
      changeInfo: chrome.tabs.TabChangeInfo,
    ) => {
      // Only URL changes matter here. `onUpdated` also fires for title,
      // favicon, and loading-status changes — those don't affect the
      // origin or the storage contents, so filtering on changeInfo.url
      // avoids spamming reads.
      if (!changeInfo.url) return;
      void (async () => {
        const [activeTab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        // Ignore navigations in background tabs — the panel only renders
        // the active tab's storage.
        if (activeTab?.id !== tabId) return;
        await refreshOriginState();
        await loadEntries(storageType);
      })();
    };
    chrome.tabs.onUpdated.addListener(handleTabUpdated);
    return () => chrome.tabs.onUpdated.removeListener(handleTabUpdated);
  }, [refreshOriginState, loadEntries, storageType]);
```

**Out of scope for this PR:** tab *activation* (the user switching between already-open tabs via `Cmd+\`` or clicking another tab) is NOT handled. `chrome.tabs.onActivated` would cover that, but the panel already has this limitation today — it loads once and does not follow tab focus changes. Expanding scope to fix it is a separate concern and should get its own issue. Note this in the PR description so reviewers know it was considered and deferred rather than missed.

- [ ] **Step 6: Render OriginIndicator in the header**

Find the existing header JSX:

```tsx
      <div className={styles.header}>
        <StorageToggle storageType={storageType} onChange={handleStorageTypeChange} />
        <SearchBar query={searchQuery} onChange={setSearchQuery} />
      </div>
```

Replace with:

```tsx
      <div className={styles.header}>
        <StorageToggle storageType={storageType} onChange={handleStorageTypeChange} />
        <SearchBar query={searchQuery} onChange={setSearchQuery} />
      </div>
      <div className={styles.originRow}>
        <OriginIndicator
          state={originState}
          onAllow={handleAllowOrigin}
          onRevoke={handleRevokeOrigin}
        />
      </div>
```

- [ ] **Step 7: Add `originRow` style to `App.module.css`**

Append to `src/sidepanel/components/App.module.css`:

```css
.originRow {
  display: flex;
  padding: 4px 8px 0 8px;
  min-width: 0;
}
```

- [ ] **Step 8: Type-check and lint**

```bash
bun run build
bun run lint
```

Expected: both succeed.

- [ ] **Step 9: Run unit tests**

```bash
bun run test
```

Expected: all pass. No new unit tests in this task, but make sure nothing regressed.

- [ ] **Step 10: Commit**

```bash
git add src/sidepanel/components/App.tsx src/sidepanel/components/App.module.css
git commit -m "feat: wire OriginIndicator and on-demand injection into sidepanel"
```

---

### Task 10: Update E2E tests

**Files:**
- Modify: `tests/e2e/extension.spec.ts`
- Possibly modify: `tests/e2e/fixtures.ts`

**Context: the fixture already solves the activeTab-in-Playwright problem.** `tests/e2e/fixtures.ts` patches the built `dist/manifest.json` before loading the extension to add `host_permissions: ["<all_urls>"]`. This is what lets `chrome.scripting.executeScript` work in tests without a real user-gesture click on the action. The source manifest is NOT modified. That patch is still what we need after this PR — it just operates on a manifest that no longer has `content_scripts` (so no auto-injection at document_start) but does have all the host access `executeScript` needs.

**What this means for the test flow after the PR:**

1. Test opens a web page (e.g. `example.com`) in a Playwright tab.
2. Test calls `openSidePanel(page)` which navigates to the sidepanel URL.
3. Panel's `loadEntries` runs on mount and calls `injectIntoTab(tabId)` — same code path as production, just reached via the fixture's host_permissions patch instead of a real action click.
4. Panel reads storage, tests assert on the UI.

The production injection path (`injectIntoTab` → `chrome.scripting.executeScript` with the two public/ files) is now exercised end-to-end by every test that opens the panel. DO NOT use `page.addInitScript` to seed the interceptor — that would bypass the real code path and mask bugs like the MAIN/ISOLATED ordering issue fixed in Task 5.

**Key behavioral change to watch for:** any test that mutated storage on the page BEFORE opening the panel used to see those mutations show up in the change log (because `content_scripts` auto-injected at document_start). After this PR, pre-open mutations are invisible to the change log — the monitor only exists after `loadEntries` runs. This matches production behavior but may break existing assertions.

- [ ] **Step 1: Audit existing tests for pre-panel-open mutations**

Scan for storage operations that happen on `page` before `openSidePanel(page)` is called, and for any test that asserts a change log row for a mutation that occurred pre-open:

```bash
grep -nE "page\.evaluate.*\b(localStorage|sessionStorage)\b|openSidePanel" tests/e2e/extension.spec.ts
```

For each hit: if the storage op precedes `openSidePanel` in the same test and the test asserts on change log UI for that op, reorder so the op happens AFTER `openSidePanel` returns. `openSidePanel` already waits for `text=basic-test` before returning, which means `loadEntries` has completed and both scripts are injected — any subsequent `page.evaluate` mutation will be captured.

Tests that only assert on the *read* path (panel shows the current storage value) are unaffected by ordering.

- [ ] **Step 2: Add an explicit test for the injection path itself**

Even with every existing test passing, we want at least one test whose *purpose* is to verify the new `injectIntoTab` flow actually installs both worlds. The interceptor uses `Symbol.for("lsi-original-setItem")` as its idempotency marker (see `public/storage-interceptor.js`), which is accessible from the page context via the same symbol key. Add this test at the end of `extension.spec.ts`:

```ts
test("sidepanel injection installs interceptor (MAIN) + monitor (ISOLATED) on the active tab", async ({ page, openSidePanel }) => {
  await page.goto("https://example.com");

  // The shared fixture's `openSidePanel` waits for `text=basic-test` to
  // confirm loadEntries completed — seed that key in the page's localStorage
  // BEFORE opening the panel, otherwise the fixture times out. Setting it
  // pre-open is fine: the panel's read path (readStorage via executeScript)
  // picks up whatever is in storage at read time, regardless of whether the
  // monitor was installed when the value was written. Only the change log
  // cares about monitor-install timing, and this test does not assert on
  // that seeding row.
  await page.evaluate(() => {
    localStorage.setItem("basic-test", "seed");
  });

  const sidePanel = await openSidePanel(page);

  // MAIN world: the interceptor stashes the original setItem under a
  // well-known Symbol.for key when it patches Storage.prototype. Reading
  // that from the page proves the MAIN injection landed.
  const interceptorInstalled = await page.evaluate(() => {
    const key = Symbol.for("lsi-original-setItem");
    return typeof (window as unknown as Record<symbol, unknown>)[key] === "function";
  });
  expect(interceptorInstalled).toBe(true);

  // ISOLATED world: we can't read its state directly, but we can verify
  // its behavior. Mutate storage in the page; the interceptor posts a
  // window message, the monitor batches it and relays via
  // chrome.runtime.sendMessage, and the panel's change log should render
  // a row. If ordering regressed (MAIN before ISOLATED) this assertion
  // would still pass because the mutation happens AFTER both injects
  // completed — but it catches gross wiring failures end-to-end.
  await page.evaluate(() => {
    localStorage.setItem("injection-e2e-test", "ok");
  });
  await expect(sidePanel.getByText("injection-e2e-test")).toBeVisible({ timeout: 2000 });
});
```

Adjust the selector in the final assertion to match the actual change-log DOM — inspect an existing change-log test in the file for the right locator shape.

- [ ] **Step 3: Run the E2E tests**

```bash
bun run test:e2e
```

Expected: all pass. If a pre-existing test is intractable to fix without a real action click (it shouldn't be — the fixture's host_permissions patch covers every `executeScript` call the panel makes), mark it `.skip` with a comment pointing to the manual test plan in Task 11 and document the gap in the PR description. Do not leave a broken test.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/extension.spec.ts tests/e2e/fixtures.ts
git commit -m "test: E2E covers on-demand injection path via sidepanel loadEntries"
```

---

### Task 11: Final verification and PR

**Files:** none (process only)

- [ ] **Step 1: Full local verification**

```bash
bun run lint
bun run test
bun run build
bun run test:e2e
```

All four must pass before pushing. If anything fails, stop and fix it — do NOT push broken code.

- [ ] **Step 2: Manually smoke-test the built extension**

1. Open `chrome://extensions`, enable Developer mode.
2. Click "Load unpacked", select `dist/`.
3. Verify no host-permission warning appears on load.
4. Open a regular http(s) site (e.g. `https://example.com`).
5. Click the extension icon. Verify the side panel opens and shows `localStorage` / `sessionStorage` values.
6. In DevTools console, run `localStorage.setItem("foo", "bar")`. Verify the change log records the mutation.
7. Click "Always allow" in the side panel. Verify Chrome shows a native permission dialog naming the current origin. Grant.
8. Verify the indicator now shows the origin with a checkmark and a "Revoke" button.
9. Reload the page (F5). Verify that running `localStorage.setItem("baz", "qux")` still appears in the change log — this proves the registered content script survived the reload.
10. Click "Revoke". Verify the indicator reverts to the "Always allow" state.
11. Visit `chrome://extensions`. Click the extension action. Verify the panel opens and shows "Storage inspection isn't available on this page." (Or equivalent — the key is a graceful unsupported state, not a crash.)

- [ ] **Step 3: Push the branch**

```bash
git push -u origin issue-<N>-optional-host-permissions
```

- [ ] **Step 4: Open the PR**

```bash
gh pr create --title "feat: optional host permissions + on-demand injection" --body "$(cat <<'EOF'
## Summary
- Remove declarative `content_scripts` matches `<all_urls>`. Inject interceptor + monitor on demand via `chrome.scripting.executeScript` gated by `activeTab`.
- Add `optional_host_permissions: ["<all_urls>"]` with an in-panel "Always allow" button that calls `chrome.permissions.request` per-origin and persists monitoring via `chrome.scripting.registerContentScripts`.
- Add `OriginIndicator` component to the panel header.
- Panel now follows active-tab URL changes via `chrome.tabs.onUpdated` — navigating the tab while the panel is open refreshes both the origin indicator and the storage view.
- Bump version to 1.5.0.

## Out of scope (intentional)
- **Tab activation.** Switching to a different already-open tab while the panel is open does not refresh the panel. This is a pre-existing limitation; `chrome.tabs.onActivated` would fix it but belongs in a separate issue.
- **Multi-window `currentWindow` semantics.** `chrome.tabs.query({ active: true, currentWindow: true })` from a docked side panel can be ambiguous across multiple browser windows. This PR inherits the existing behavior unchanged.

Closes #<N>

## Test plan
- [x] `bun run lint`
- [x] `bun run test`
- [x] `bun run build`
- [x] `bun run test:e2e`
- [ ] Manual: install unpacked, verify no host warning
- [ ] Manual: click action on example.com, verify panel shows storage
- [ ] Manual: mutate storage from DevTools, verify change log records
- [ ] Manual: click "Always allow", grant, reload page, verify change log still records
- [ ] Manual: click "Revoke", verify indicator reverts
- [ ] Manual: click action on chrome://extensions, verify graceful unsupported state
EOF
)"
```

Expected: PR URL is printed. CI should start running the `lint-test-build` check.

- [ ] **Step 5: Wait for CI, address any failures**

Monitor with `gh pr checks` or `gh run watch`. If the `lint-test-build` job fails, fix on the branch and push again.

- [ ] **Step 6: After merge, follow the spec's "After merge" section**

See `plans/superpowers/specs/2026-04-14-optional-host-permissions-design.md` → "GitHub workflow" → "After merge":

- Build, zip `dist/` as `local-storage-inspector-v1.5.0.zip`
- Upload to the existing Chrome Web Store listing (Package → Upload new package)
- Update the justifications (`sidePanel`, `activeTab`, `scripting`, `optional_host_permissions`)
- Tag `v1.5.0` on `main`

---

## Self-review checklist

- **Spec coverage**: every section in the spec maps to a task — Injection sources (Tasks 2, 5, 6, 9), match-pattern helpers and reconciliation (Tasks 3, 4), registered content script shape (Task 4), rehydration (Tasks 4, 6), edge cases / unsupported URLs (Task 5 via `InjectResult`, Task 9 via `refreshOriginState` → `unsupported`), origin indicator UI (Tasks 8, 9), manifest changes (Task 7), permission model (Task 7), E2E updates (Task 10), GitHub workflow (Tasks 1, 11).
- **Ownership of injection**: exactly one place calls `injectIntoTab` — the sidepanel's `loadEntries` (Task 9). The service worker's `action.onClicked` handler (Task 6) only opens the panel. No double-injection, no split decision about "when to inject."
- **Injection ordering**: `injectIntoTab` installs ISOLATED (monitor) before MAIN (interceptor) so that the monitor's `message` listener is attached before the interceptor starts posting events (Task 5).
- **Build-path assumption verified early**: Task 2 Step 2 explicitly verifies that `dist/monitor.js` and `dist/storage-interceptor.js` land at stable root paths after build, before any other task depends on that assumption.
- **Reconciliation is unit-tested**: `computeReconciliation` is a pure function in `host-permissions.ts` with dedicated tests in Task 3. The chrome-API wrapper `reconcileRegisteredScripts` in Task 4 is thin glue around it.
- **E2E covers the real injection path**: Task 10 uses the existing fixture's `host_permissions` patch (which lets `executeScript` work without a real user gesture) and tests the sidepanel's `loadEntries` → `injectIntoTab` flow end-to-end. An explicit test verifies the interceptor's `Symbol.for("lsi-original-setItem")` marker is installed and that mutations round-trip through the monitor to the change log UI.
- **Placeholders**: none. Every code block has actual content. Task 10 Step 1 has a concrete audit command with specific acceptance criteria, not open-ended discovery.
- **Type consistency**: `OriginState` is defined in `OriginIndicator.tsx` and imported into `App.tsx`. `InjectResult` lives in `inject.ts` and is consumed in `App.tsx` via `injectResult.status === "unsupported"`. `originToMatchPattern` / `matchPatternToOrigin` / `computeReconciliation` / `ReconciliationPlan` have consistent signatures in Task 3 and usage in Tasks 4, 6, 9. Registered script IDs use the same `lsi-${role}-${origin}` format in `registerScriptsForOrigin`, `unregisterScriptsForOrigin`, and `reconcileRegisteredScripts`.
