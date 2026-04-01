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

// ---------------------------------------------------------------------------
// Change Monitoring
// ---------------------------------------------------------------------------

test.describe("Change Monitoring", () => {
  test("captures setItem from page and shows in change log", async ({
    page,
    openSidePanel,
  }) => {
    const sidePanelPage = await openSidePanel(page);

    // Verify change log is visible with recording active
    await expect(sidePanelPage.getByTestId("change-log")).toBeVisible();
    await expect(sidePanelPage.getByTestId("record-toggle")).toContainText("Recording");

    // Trigger a setItem from the page context
    await page.evaluate(() => {
      localStorage.setItem("monitor-test", "hello");
    });

    // Wait for the change to appear (batched with 50ms debounce)
    const entry = sidePanelPage.getByTestId("change-entry").first();
    await expect(entry).toBeVisible({ timeout: 3000 });
    await expect(entry.getByTestId("change-operation")).toContainText("setItem");
    await expect(entry.getByTestId("change-source")).toContainText("page");

    await sidePanelPage.close();
  });

  test("captures removeItem from page", async ({ page, openSidePanel }) => {
    const sidePanelPage = await openSidePanel(page);

    await page.evaluate(() => {
      localStorage.setItem("to-remove", "value");
      localStorage.removeItem("to-remove");
    });

    // Wait for changes to appear
    await expect(sidePanelPage.getByTestId("change-entry").first()).toBeVisible({ timeout: 3000 });

    // The most recent entry (first in reverse-chron) should be removeItem
    const firstEntry = sidePanelPage.getByTestId("change-entry").first();
    await expect(firstEntry.getByTestId("change-operation")).toContainText("removeItem");

    await sidePanelPage.close();
  });

  test("captures clear from page", async ({ page, openSidePanel }) => {
    const sidePanelPage = await openSidePanel(page);

    await page.evaluate(() => {
      localStorage.clear();
    });

    const entry = sidePanelPage.getByTestId("change-entry").first();
    await expect(entry).toBeVisible({ timeout: 3000 });
    await expect(entry.getByTestId("change-operation")).toContainText("clear");

    await sidePanelPage.close();
  });

  test("recording toggle stops and resumes capture", async ({
    page,
    openSidePanel,
  }) => {
    const sidePanelPage = await openSidePanel(page);

    // Pause recording
    await sidePanelPage.getByTestId("record-toggle").click();
    await expect(sidePanelPage.getByTestId("record-toggle")).toContainText("Paused");

    // Trigger change while paused — should NOT appear
    await page.evaluate(() => {
      localStorage.setItem("paused-change", "ignored");
    });
    // Brief wait to confirm nothing appears
    await sidePanelPage.waitForTimeout(200);
    const countText = await sidePanelPage.getByTestId("change-count").textContent();
    expect(countText).toBe("0 changes");

    // Resume recording
    await sidePanelPage.getByTestId("record-toggle").click();
    await expect(sidePanelPage.getByTestId("record-toggle")).toContainText("Recording");

    // Trigger another change — should appear
    await page.evaluate(() => {
      localStorage.setItem("resumed-change", "captured");
    });
    await expect(sidePanelPage.getByTestId("change-entry").first()).toBeVisible({ timeout: 3000 });

    await sidePanelPage.close();
  });

  test("clear button empties the log", async ({ page, openSidePanel }) => {
    const sidePanelPage = await openSidePanel(page);

    // Generate some changes
    await page.evaluate(() => {
      localStorage.setItem("clear-test", "value");
    });
    await expect(sidePanelPage.getByTestId("change-entry").first()).toBeVisible({ timeout: 3000 });

    // Clear the log
    await sidePanelPage.getByTestId("clear-changes").click();
    await expect(sidePanelPage.getByTestId("change-count")).toContainText("0 changes");

    await sidePanelPage.close();
  });

  test("shows timestamp on change entries", async ({ page, openSidePanel }) => {
    const sidePanelPage = await openSidePanel(page);

    await page.evaluate(() => {
      localStorage.setItem("timestamp-test", "value");
    });

    const entry = sidePanelPage.getByTestId("change-entry").first();
    await expect(entry).toBeVisible({ timeout: 3000 });

    // Timestamp should match HH:mm:ss.mmm format
    const timestamp = await entry.getByTestId("change-timestamp").textContent();
    expect(timestamp).toMatch(/\d{2}:\d{2}:\d{2}\.\d{3}/);

    await sidePanelPage.close();
  });

  test("expand/collapse shows old/new values", async ({ page, openSidePanel }) => {
    const sidePanelPage = await openSidePanel(page);

    // Set a value, then update it so we have old + new
    await page.evaluate(() => {
      localStorage.setItem("expand-test", "first-val");
    });
    await expect(sidePanelPage.getByTestId("change-entry").first()).toBeVisible({ timeout: 3000 });

    await page.evaluate(() => {
      localStorage.setItem("expand-test", "second-val");
    });

    // Wait for the second entry to arrive (count should be 2)
    await expect(sidePanelPage.getByTestId("change-count")).toContainText("2 changes", { timeout: 3000 });

    // Click to expand the first entry (most recent = the update)
    await sidePanelPage.getByTestId("change-entry").first().click();

    // Should show old and new values in the expanded detail
    await expect(sidePanelPage.locator("text=first-val")).toBeVisible();
    await expect(sidePanelPage.locator("text=second-val")).toBeVisible();

    await sidePanelPage.close();
  });

});

test.describe("Change Log Diff", () => {
  test("shows field-level summary for JSON changes in collapsed view", async ({
    page,
    openSidePanel,
  }) => {
    const sidePanelPage = await openSidePanel(page);

    // Set initial JSON value
    await page.evaluate(() => {
      localStorage.setItem("diff-test", JSON.stringify({ name: "Alice", age: 30 }));
    });
    await expect(sidePanelPage.getByTestId("change-entry").first()).toBeVisible({ timeout: 3000 });

    // Update with field change
    await page.evaluate(() => {
      localStorage.setItem(
        "diff-test",
        JSON.stringify({ name: "Alice", age: 31, role: "admin" }),
      );
    });
    await expect(sidePanelPage.getByTestId("change-count")).toContainText("2 changes", { timeout: 3000 });

    // Most recent entry should have a change summary
    const summary = sidePanelPage.getByTestId("change-summary").first();
    await expect(summary).toBeVisible();
    await expect(summary).toContainText("~");

    await sidePanelPage.close();
  });

  test("shows '(new)' summary for new keys", async ({ page, openSidePanel }) => {
    const sidePanelPage = await openSidePanel(page);

    await page.evaluate(() => {
      localStorage.setItem("brand-new-key", "some-value");
    });

    const summary = sidePanelPage.getByTestId("change-summary").first();
    await expect(summary).toBeVisible({ timeout: 3000 });
    await expect(summary).toContainText("(new)");

    await sidePanelPage.close();
  });

  test("shows 'value changed' summary for plain string changes", async ({
    page,
    openSidePanel,
  }) => {
    const sidePanelPage = await openSidePanel(page);

    await page.evaluate(() => {
      localStorage.setItem("str-test", "first");
    });
    await expect(sidePanelPage.getByTestId("change-entry").first()).toBeVisible({ timeout: 3000 });

    await page.evaluate(() => {
      localStorage.setItem("str-test", "second");
    });
    await expect(sidePanelPage.getByTestId("change-count")).toContainText("2 changes", { timeout: 3000 });

    const summary = sidePanelPage.getByTestId("change-summary").first();
    await expect(summary).toContainText("value changed");

    await sidePanelPage.close();
  });

  test("expanded inline diff highlights changed lines", async ({
    page,
    openSidePanel,
  }) => {
    const sidePanelPage = await openSidePanel(page);

    await page.evaluate(() => {
      localStorage.setItem("inline-test", JSON.stringify({ name: "Alice", age: 30 }));
    });
    await expect(sidePanelPage.getByTestId("change-entry").first()).toBeVisible({ timeout: 3000 });

    await page.evaluate(() => {
      localStorage.setItem("inline-test", JSON.stringify({ name: "Alice", age: 31 }));
    });
    await expect(sidePanelPage.getByTestId("change-count")).toContainText("2 changes", { timeout: 3000 });

    // Expand the most recent entry
    await sidePanelPage.getByTestId("change-entry").first().click();

    // Should show inline diff by default with diff mode buttons
    await expect(sidePanelPage.getByTestId("diff-mode-inline")).toBeVisible();
    await expect(sidePanelPage.getByTestId("diff-mode-unified")).toBeVisible();

    await sidePanelPage.close();
  });

  test("toggle to unified diff shows +/- prefixed lines", async ({
    page,
    openSidePanel,
  }) => {
    const sidePanelPage = await openSidePanel(page);

    await page.evaluate(() => {
      localStorage.setItem("unified-test", "old-value");
    });
    await expect(sidePanelPage.getByTestId("change-entry").first()).toBeVisible({ timeout: 3000 });

    await page.evaluate(() => {
      localStorage.setItem("unified-test", "new-value");
    });
    await expect(sidePanelPage.getByTestId("change-count")).toContainText("2 changes", { timeout: 3000 });

    // Expand and switch to unified
    await sidePanelPage.getByTestId("change-entry").first().click();
    await sidePanelPage.getByTestId("diff-mode-unified").click();

    // Unified view should show - and + prefixed lines
    await expect(sidePanelPage.locator("text=- old-value")).toBeVisible();
    await expect(sidePanelPage.locator("text=+ new-value")).toBeVisible();

    await sidePanelPage.close();
  });
});
