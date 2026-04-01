# E2E Test Fixture Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor E2E tests from `beforeAll`/`afterAll` with module-level variables to Playwright's recommended custom fixture pattern, improving test isolation and reusability.

**Architecture:** Extract browser context setup, manifest patching, and extension ID resolution into a shared `fixtures.cts` file that exports a custom `test` object. Refactor all tests to use fixture-injected `context` and `extensionId` instead of module globals. The `.cts` extension is required because the E2E tsconfig uses CommonJS modules.

**Tech Stack:** Playwright 1.58, TypeScript (CommonJS for E2E tests)

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `tests/e2e/fixtures.cts` | Create | Custom Playwright fixtures: persistent context, manifest patch, extensionId, openPopup helper |
| `tests/e2e/extension.spec.cts` | Modify | Refactor to use fixtures, remove all module-level state |
| `playwright.config.cts` | Modify | Enable headless via `channel: 'chromium'` |

---

### Task 1: Create the fixtures file

**Files:**
- Create: `tests/e2e/fixtures.cts`

- [ ] **Step 1: Create `tests/e2e/fixtures.cts` with custom test fixtures**

```typescript
import { test as base, chromium, type BrowserContext, type Page } from "playwright/test";
import path from "path";
import fs from "fs";

const extensionPath = path.resolve(__dirname, "../../dist");

// Patch dist/manifest.json for testing: activeTab only grants permission on
// a real user click, which Playwright can't simulate. Adding host_permissions
// lets chrome.scripting.executeScript work when the popup is opened via URL.
// The source manifest.json is NOT modified — only the built output.
function patchManifestForTesting(): void {
  const manifestPath = path.join(extensionPath, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  if (!manifest.host_permissions) {
    manifest.host_permissions = ["<all_urls>"];
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  }
}

patchManifestForTesting();

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
  openPopup: (page: Page) => Promise<Page>;
}>({
  // biome-ignore lint: Playwright fixture API requires destructuring
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });
    await use(context);
    await context.close();
  },

  extensionId: async ({ context }, use) => {
    let [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker)
      serviceWorker = await context.waitForEvent("serviceworker");
    const extensionId = serviceWorker.url().split("/")[2];
    await use(extensionId);
  },

  openPopup: async ({ context, extensionId }, use) => {
    await use(async (page: Page) => {
      // Ensure the web page tab is the "active" tab before opening the popup,
      // so chrome.tabs.query({ active: true }) finds it.
      await page.bringToFront();

      const popupPage = await context.newPage();
      await popupPage.goto(
        `chrome-extension://${extensionId}/src/popup/popup.html`
      );
      await popupPage.waitForSelector("text=basic-test", { timeout: 5000 });

      return popupPage;
    });
  },
});

export const expect = test.expect;
```

- [ ] **Step 2: Verify the file compiles**

Run: `npx tsc --noEmit -p tests/e2e/tsconfig.json`
Expected: No errors (or only pre-existing ones)

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/fixtures.cts
git commit -m "test: add Playwright fixtures for Chrome extension testing"
```

---

### Task 2: Refactor extension.spec.cts to use fixtures

**Files:**
- Modify: `tests/e2e/extension.spec.cts`

- [ ] **Step 1: Rewrite `extension.spec.cts` to import from fixtures and use fixture-injected values**

Replace the entire file contents with:

```typescript
import { test, expect } from "./fixtures.cjs";

const COMPLEX_JSON = {
  user: {
    profile: {
      name: "Alice",
      settings: {
        theme: {
          colors: {
            primary: "#1976d2",
            secondary: "#dc004e",
          },
          mode: "dark",
        },
        notifications: {
          email: true,
          push: false,
        },
      },
    },
    metadata: {
      created: "2026-01-15",
      tags: ["admin", "beta-tester"],
    },
  },
};

// Each test gets its own page with seeded localStorage via beforeEach.
// The `context`, `extensionId`, and `openPopup` come from fixtures.cts.
test.beforeEach(async ({ page }) => {
  await page.goto("https://example.com");
  await page.waitForLoadState("domcontentloaded");

  await page.evaluate((complexJson) => {
    localStorage.clear();
    localStorage.setItem("basic-test", "hello world");
    localStorage.setItem("complex-json", JSON.stringify(complexJson));
  }, COMPLEX_JSON);
});

// ---------------------------------------------------------------------------
// Extension Installation
// ---------------------------------------------------------------------------

test.describe("Extension Installation", () => {
  test("installs and registers service worker", async ({ context }) => {
    const [serviceWorker] = context.serviceWorkers();
    expect(serviceWorker).toBeTruthy();
    expect(serviceWorker.url()).toContain("chrome-extension://");
  });

  test("popup can be opened via chrome.action.openPopup", async ({
    context,
    page,
  }) => {
    await page.bringToFront();

    const [serviceWorker] = context.serviceWorkers();
    const popupPromise = context.waitForEvent("page");
    await serviceWorker.evaluate(async () => {
      await (chrome as any).action.openPopup();
    });
    const realPopup = await popupPromise;
    await realPopup.waitForLoadState("domcontentloaded");

    const url = realPopup.url();
    expect(url).toContain("popup.html");

    if (!realPopup.isClosed()) await realPopup.close();
  });
});

// ---------------------------------------------------------------------------
// Popup UI
// ---------------------------------------------------------------------------

test.describe("Popup UI", () => {
  test("shows Local/Session toggle, search bar, and add button", async ({
    page,
    openPopup,
  }) => {
    const popupPage = await openPopup(page);

    await expect(popupPage.locator("button", { hasText: "Local" })).toBeVisible();
    await expect(popupPage.locator("button", { hasText: "Session" })).toBeVisible();
    await expect(popupPage.locator('input[placeholder="Filter keys..."]')).toBeVisible();
    await expect(popupPage.locator("button", { hasText: "+ Add new key" })).toBeVisible();

    await popupPage.close();
  });

  test("displays seeded storage keys in the key list", async ({
    page,
    openPopup,
  }) => {
    const popupPage = await openPopup(page);

    await expect(popupPage.locator("text=basic-test")).toBeVisible();
    await expect(popupPage.locator("text=complex-json")).toBeVisible();

    await popupPage.close();
  });
});

// ---------------------------------------------------------------------------
// Viewing Specific Fields
// ---------------------------------------------------------------------------

test.describe("Viewing Values", () => {
  test("basic-test: displays as a plain string (no JSON toggle)", async ({
    page,
    openPopup,
  }) => {
    const popupPage = await openPopup(page);

    await popupPage.locator("text=basic-test").click();

    await expect(popupPage.locator("span", { hasText: "basic-test" })).toBeVisible();

    const editorContent = await popupPage.locator(".cm-content").textContent();
    expect(editorContent).toContain("hello world");

    await expect(popupPage.locator('input[type="checkbox"]')).not.toBeChecked();

    await popupPage.close();
  });

  test("complex-json: displays pretty-printed with 5 nesting levels", async ({
    page,
    openPopup,
  }) => {
    const popupPage = await openPopup(page);

    await popupPage.locator("text=complex-json").click();

    await expect(popupPage.locator('input[type="checkbox"]')).toBeChecked();

    const editorContent = await popupPage.locator(".cm-content").textContent();

    expect(editorContent).toContain('"user"');
    expect(editorContent).toContain('"profile"');
    expect(editorContent).toContain('"metadata"');
    expect(editorContent).toContain('"settings"');
    expect(editorContent).toContain('"Alice"');
    expect(editorContent).toContain('"theme"');
    expect(editorContent).toContain('"notifications"');
    expect(editorContent).toContain('"colors"');
    expect(editorContent).toContain('"#1976d2"');
    expect(editorContent).toContain('"dark"');
    expect(editorContent).toContain('"beta-tester"');

    await popupPage.close();
  });
});

// ---------------------------------------------------------------------------
// Editing and Saving
// ---------------------------------------------------------------------------

test.describe("Editing and Saving", () => {
  test("edits a string value and persists to localStorage", async ({
    page,
    openPopup,
  }) => {
    const popupPage = await openPopup(page);

    await popupPage.locator("text=basic-test").click();
    await popupPage.waitForSelector(".cm-content");

    const editor = popupPage.locator(".cm-content");
    await editor.click();
    await popupPage.keyboard.press("Meta+a");
    await popupPage.keyboard.type("updated value");

    await popupPage.locator("button", { hasText: "Save" }).click();
    await expect(popupPage.locator("text=Saved")).toBeVisible();

    const storedValue = await page.evaluate(() => localStorage.getItem("basic-test"));
    expect(storedValue).toBe("updated value");

    await popupPage.close();
  });

  test("edits a JSON value and persists compacted JSON to localStorage", async ({
    page,
    openPopup,
  }) => {
    const popupPage = await openPopup(page);

    await popupPage.locator("text=complex-json").click();
    await popupPage.waitForSelector(".cm-content");

    const editor = popupPage.locator(".cm-content");
    await editor.click();
    await popupPage.keyboard.press("Meta+a");
    const newJson = JSON.stringify({ user: { name: "Bob", level: 42 } }, null, 2);
    await popupPage.keyboard.type(newJson);

    await popupPage.locator("button", { hasText: "Save" }).click();
    await expect(popupPage.locator("text=Saved")).toBeVisible();

    const storedValue = await page.evaluate(() => localStorage.getItem("complex-json"));
    const parsed = JSON.parse(storedValue as string);
    expect(parsed).toEqual({ user: { name: "Bob", level: 42 } });

    await popupPage.close();
  });

  test("disables save for invalid JSON", async ({ page, openPopup }) => {
    const popupPage = await openPopup(page);

    await popupPage.locator("text=complex-json").click();
    await popupPage.waitForSelector(".cm-content");

    const editor = popupPage.locator(".cm-content");
    await editor.click();
    await popupPage.keyboard.press("Meta+a");
    await popupPage.keyboard.type('{"broken": }');

    await expect(popupPage.locator("button", { hasText: "Save" })).toBeDisabled();

    await popupPage.close();
  });
});

// ---------------------------------------------------------------------------
// Search/Filter
// ---------------------------------------------------------------------------

test.describe("Search/Filter", () => {
  test("filters keys by search query", async ({ page, openPopup }) => {
    const popupPage = await openPopup(page);

    await expect(popupPage.locator("text=basic-test")).toBeVisible();
    await expect(popupPage.locator("text=complex-json")).toBeVisible();

    await popupPage.locator('input[placeholder="Filter keys..."]').fill("basic");
    await expect(popupPage.locator("text=basic-test")).toBeVisible();
    await expect(popupPage.locator("text=complex-json")).not.toBeVisible();

    await popupPage.locator('input[placeholder="Filter keys..."]').fill("");
    await expect(popupPage.locator("text=basic-test")).toBeVisible();
    await expect(popupPage.locator("text=complex-json")).toBeVisible();

    await popupPage.close();
  });
});
```

Key changes:
- Import `test`/`expect` from `./fixtures.cjs` (the compiled output of `fixtures.cts`)
- Remove all module-level `let` variables
- Remove `beforeAll`/`afterAll` (context lifecycle handled by fixture)
- `beforeEach` uses fixture-provided `page` (from the shared persistent context)
- `afterEach` is removed — each test closes its own popupPage, and page cleanup is handled by fixtures
- `openPopup` is now a fixture-injected function instead of a module-level helper
- The "installs service worker" test gets `context` from fixture and reads `serviceWorkers()` directly

- [ ] **Step 2: Run E2E tests to verify everything passes**

Run: `bun run test:e2e`
Expected: All 10 tests pass

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/extension.spec.cts
git commit -m "test: refactor E2E tests to use Playwright fixture pattern

Replaces module-level state and beforeAll/afterAll with custom fixtures
for context, extensionId, and openPopup. Follows Playwright's recommended
pattern for Chrome extension testing."
```

---

### Task 3: Enable headless mode in Playwright config

**Files:**
- Modify: `playwright.config.cts`

- [ ] **Step 1: Update `playwright.config.cts` to remove `headless: false`**

The `channel: "chromium"` in the fixture enables headless extension testing. Remove the explicit `headless: false` from the config so CI runs headless by default.

```typescript
import { defineConfig } from "playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30000,
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
      },
    },
  ],
});
```

- [ ] **Step 2: Run E2E tests headless to verify they pass**

Run: `bun run test:e2e`
Expected: All 10 tests pass (now running headless)

- [ ] **Step 3: Commit**

```bash
git add playwright.config.cts
git commit -m "test: enable headless mode for E2E tests

The channel: 'chromium' in fixtures enables headless Chrome extension
testing. Remove explicit headless: false from config."
```

---

## Notes

- The `.cts` → `.cjs` import pattern is required because the E2E tsconfig compiles to CommonJS. `fixtures.cts` compiles to `fixtures.cjs`, so the spec imports `./fixtures.cjs`.
- The fixture creates one persistent context per **test file** (Playwright's default scoping for custom fixtures with `{scope: 'test'}`). Since all fixtures default to test scope, each test gets its own context — but because `launchPersistentContext` is expensive, we may want to adjust to worker scope if tests are slow. Start with per-test and optimize if needed.
- `openPopup` is a fixture that provides a function rather than a page, since each test needs to control when the popup opens relative to its page setup.
