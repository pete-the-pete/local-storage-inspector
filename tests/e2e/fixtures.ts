import { test as base, chromium, type BrowserContext, type Page } from "@playwright/test";
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
  const hosts: string[] = manifest.host_permissions ?? [];
  if (!hosts.includes("<all_urls>")) {
    manifest.host_permissions = ["<all_urls>"];
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  }
}

patchManifestForTesting();

export const test = base.extend<
  { page: Page; openPopup: (page: Page) => Promise<Page> },
  { extensionContext: BrowserContext; extensionId: string }
>({
  // Worker-scoped: one browser context shared across all tests in the file.
  // biome-ignore lint: Playwright fixture API requires destructuring
  extensionContext: [async ({}, use) => {
    const context = await chromium.launchPersistentContext("", {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });
    await use(context);
    await context.close();
  }, { scope: "worker" }],

  // Worker-scoped: extension ID extracted once from the service worker.
  extensionId: [async ({ extensionContext }, use) => {
    let [serviceWorker] = extensionContext.serviceWorkers();
    if (!serviceWorker)
      serviceWorker = await extensionContext.waitForEvent("serviceworker");
    const extensionId = serviceWorker.url().split("/")[2];
    await use(extensionId);
  }, { scope: "worker" }],

  // Test-scoped: each test gets a fresh page from the shared context.
  page: async ({ extensionContext }, use) => {
    const page = await extensionContext.newPage();
    await use(page);
    await page.close();
  },

  openPopup: async ({ extensionContext, extensionId }, use) => {
    await use(async (page: Page) => {
      const popupPage = await extensionContext.newPage();
      // Navigate to the popup URL but don't wait for full load — the popup's
      // React effects will call chrome.tabs.query({ active: true }) to find
      // the target tab.  We need the example.com tab to be active at that
      // point, so bring it to front before the effects fire.
      await popupPage.goto(
        `chrome-extension://${extensionId}/src/popup/popup.html`,
        { waitUntil: "commit" },
      );
      await page.bringToFront();

      await popupPage.waitForSelector("text=basic-test", { timeout: 5000 });

      return popupPage;
    });
  },
});

export const expect = test.expect;
