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
