import { test, expect } from "./fixtures";

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
// The `context`, `extensionId`, and `openSidePanel` come from fixtures.ts.
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
  test("installs and registers service worker", async ({ extensionContext }) => {
    const [serviceWorker] = extensionContext.serviceWorkers();
    expect(serviceWorker).toBeTruthy();
    expect(serviceWorker.url()).toContain("chrome-extension://");
  });

});

// ---------------------------------------------------------------------------
// Side Panel UI
// ---------------------------------------------------------------------------

test.describe("Side Panel UI", () => {
  test("shows Local/Session toggle, search bar, and add button", async ({
    page,
    openSidePanel,
  }) => {
    const sidePanelPage = await openSidePanel(page);

    await expect(sidePanelPage.locator("button", { hasText: "Local" })).toBeVisible();
    await expect(sidePanelPage.locator("button", { hasText: "Session" })).toBeVisible();
    await expect(sidePanelPage.locator('input[placeholder="Filter keys..."]')).toBeVisible();
    await expect(sidePanelPage.locator("button", { hasText: "+ Add new key" })).toBeVisible();

    await sidePanelPage.close();
  });

  test("displays seeded storage keys in the key list", async ({
    page,
    openSidePanel,
  }) => {
    const sidePanelPage = await openSidePanel(page);

    await expect(sidePanelPage.locator("text=basic-test")).toBeVisible();
    await expect(sidePanelPage.locator("text=complex-json")).toBeVisible();

    await sidePanelPage.close();
  });
});

// ---------------------------------------------------------------------------
// Viewing Specific Fields
// ---------------------------------------------------------------------------

test.describe("Viewing Values", () => {
  test("basic-test: displays as a plain string (no JSON toggle)", async ({
    page,
    openSidePanel,
  }) => {
    const sidePanelPage = await openSidePanel(page);

    await sidePanelPage.locator("text=basic-test").click();

    await expect(sidePanelPage.locator("span", { hasText: "basic-test" })).toBeVisible();

    const editorContent = await sidePanelPage.locator(".cm-content").textContent();
    expect(editorContent).toContain("hello world");

    await expect(sidePanelPage.locator('input[type="checkbox"]')).not.toBeChecked();

    await sidePanelPage.close();
  });

  test("complex-json: displays pretty-printed with 5 nesting levels", async ({
    page,
    openSidePanel,
  }) => {
    const sidePanelPage = await openSidePanel(page);

    await sidePanelPage.locator("text=complex-json").click();

    await expect(sidePanelPage.locator('input[type="checkbox"]')).toBeChecked();

    const editorContent = await sidePanelPage.locator(".cm-content").textContent();

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

    await sidePanelPage.close();
  });
});

// ---------------------------------------------------------------------------
// Editing and Saving
// ---------------------------------------------------------------------------

test.describe("Editing and Saving", () => {
  /** Select all + replace content in the CodeMirror editor via keyboard. */
  async function replaceEditorContent(sidePanelPage: import("@playwright/test").Page, text: string) {
    await sidePanelPage.waitForSelector(".cm-content");
    const editor = sidePanelPage.locator(".cm-content");
    await editor.click();
    // Triple-click to select entire line, then Mod-a for full doc selection.
    // Using both ensures reliable selection across CodeMirror versions.
    await sidePanelPage.keyboard.press("Meta+a");
    await sidePanelPage.keyboard.press("Backspace");
    await sidePanelPage.keyboard.insertText(text);
  }

  test("edits a string value and persists to localStorage", async ({
    page,
    openSidePanel,
  }) => {
    const sidePanelPage = await openSidePanel(page);

    await sidePanelPage.locator("text=basic-test").click();
    await replaceEditorContent(sidePanelPage, "updated value");

    await sidePanelPage.locator("button", { hasText: "Save" }).click();
    await expect(sidePanelPage.getByText("Saved", { exact: true })).toBeVisible();

    const storedValue = await page.evaluate(() => localStorage.getItem("basic-test"));
    expect(storedValue).toBe("updated value");

    await sidePanelPage.close();
  });

  test("edits a JSON value and persists compacted JSON to localStorage", async ({
    page,
    openSidePanel,
  }) => {
    const sidePanelPage = await openSidePanel(page);

    await sidePanelPage.locator("text=complex-json").click();
    const newJson = JSON.stringify({ user: { name: "Bob", level: 42 } }, null, 2);
    await replaceEditorContent(sidePanelPage, newJson);

    await sidePanelPage.locator("button", { hasText: "Save" }).click();
    await expect(sidePanelPage.getByText("Saved", { exact: true })).toBeVisible();

    const storedValue = await page.evaluate(() => localStorage.getItem("complex-json"));
    const parsed = JSON.parse(storedValue as string);
    expect(parsed).toEqual({ user: { name: "Bob", level: 42 } });

    await sidePanelPage.close();
  });

  test("disables save for invalid JSON", async ({ page, openSidePanel }) => {
    const sidePanelPage = await openSidePanel(page);

    await sidePanelPage.locator("text=complex-json").click();
    await replaceEditorContent(sidePanelPage, '{"broken": }');

    await expect(sidePanelPage.locator("button", { hasText: "Save" })).toBeDisabled();

    await sidePanelPage.close();
  });
});

// ---------------------------------------------------------------------------
// Syntax Highlighting
// ---------------------------------------------------------------------------

test.describe("Syntax Highlighting", () => {
  test("JSON values render with One Dark theme", async ({ page, openSidePanel }) => {
    const sidePanelPage = await openSidePanel(page);

    await sidePanelPage.locator("text=complex-json").click();
    await sidePanelPage.waitForSelector(".cm-editor");

    const hasDarkTheme = await sidePanelPage.locator(".cm-editor").evaluate((el) =>
      getComputedStyle(el).backgroundColor === "rgb(40, 44, 52)",
    );
    expect(hasDarkTheme).toBe(true);

    await sidePanelPage.close();
  });

  test("plain text values render without theme", async ({ page, openSidePanel }) => {
    const sidePanelPage = await openSidePanel(page);

    await sidePanelPage.locator("text=basic-test").click();
    await sidePanelPage.waitForSelector(".cm-editor");

    const hasDarkTheme = await sidePanelPage.locator(".cm-editor").evaluate((el) =>
      getComputedStyle(el).backgroundColor === "rgb(40, 44, 52)",
    );
    expect(hasDarkTheme).toBe(false);

    await sidePanelPage.close();
  });
});

// ---------------------------------------------------------------------------
// Search/Filter
// ---------------------------------------------------------------------------

test.describe("Search/Filter", () => {
  test("filters keys by search query", async ({ page, openSidePanel }) => {
    const sidePanelPage = await openSidePanel(page);

    await expect(sidePanelPage.locator("text=basic-test")).toBeVisible();
    await expect(sidePanelPage.locator("text=complex-json")).toBeVisible();

    await sidePanelPage.locator('input[placeholder="Filter keys..."]').fill("basic");
    await expect(sidePanelPage.locator("text=basic-test")).toBeVisible();
    await expect(sidePanelPage.locator("text=complex-json")).not.toBeVisible();

    await sidePanelPage.locator('input[placeholder="Filter keys..."]').fill("");
    await expect(sidePanelPage.locator("text=basic-test")).toBeVisible();
    await expect(sidePanelPage.locator("text=complex-json")).toBeVisible();

    await sidePanelPage.close();
  });
});
