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
  test("installs and registers service worker", async ({ extensionContext }) => {
    const [serviceWorker] = extensionContext.serviceWorkers();
    expect(serviceWorker).toBeTruthy();
    expect(serviceWorker.url()).toContain("chrome-extension://");
  });

  // test("popup can be opened via chrome.action.openPopup", async ({
  //   context,
  //   page,
  // }) => {
  //   await page.bringToFront();

  //   const [serviceWorker] = extensionContext.serviceWorkers();
  //   const popupPromise = extensionContext.waitForEvent("page");
  //   await serviceWorker.evaluate(async () => {
  //     await (chrome as any).action.openPopup();
  //   });
  //   const realPopup = await popupPromise;
  //   await realPopup.waitForLoadState("domcontentloaded");

  //   const url = realPopup.url();
  //   expect(url).toContain("popup.html");

  //   if (!realPopup.isClosed()) await realPopup.close();
  // });
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
  /** Select all + replace content in the CodeMirror editor via keyboard. */
  async function replaceEditorContent(popupPage: import("@playwright/test").Page, text: string) {
    await popupPage.waitForSelector(".cm-content");
    const editor = popupPage.locator(".cm-content");
    await editor.click();
    // Triple-click to select entire line, then Mod-a for full doc selection.
    // Using both ensures reliable selection across CodeMirror versions.
    await popupPage.keyboard.press("Meta+a");
    await popupPage.keyboard.press("Backspace");
    await popupPage.keyboard.insertText(text);
  }

  test("edits a string value and persists to localStorage", async ({
    page,
    openPopup,
  }) => {
    const popupPage = await openPopup(page);

    await popupPage.locator("text=basic-test").click();
    await replaceEditorContent(popupPage, "updated value");

    await popupPage.locator("button", { hasText: "Save" }).click();
    await expect(popupPage.getByText("Saved", { exact: true })).toBeVisible();

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
    const newJson = JSON.stringify({ user: { name: "Bob", level: 42 } }, null, 2);
    await replaceEditorContent(popupPage, newJson);

    await popupPage.locator("button", { hasText: "Save" }).click();
    await expect(popupPage.getByText("Saved", { exact: true })).toBeVisible();

    const storedValue = await page.evaluate(() => localStorage.getItem("complex-json"));
    const parsed = JSON.parse(storedValue as string);
    expect(parsed).toEqual({ user: { name: "Bob", level: 42 } });

    await popupPage.close();
  });

  test("disables save for invalid JSON", async ({ page, openPopup }) => {
    const popupPage = await openPopup(page);

    await popupPage.locator("text=complex-json").click();
    await replaceEditorContent(popupPage, '{"broken": }');

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
