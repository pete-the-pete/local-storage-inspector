import { test, expect, chromium, type BrowserContext } from "playwright/test";
import path from "path";

const extensionPath = path.resolve(__dirname, "../../dist");

let context: BrowserContext;

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext("", {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });
});

test.afterAll(async () => {
  await context.close();
});

test("extension loads and shows popup", async () => {
  const page = await context.newPage();
  await page.goto("https://example.com");

  await page.evaluate(() => {
    localStorage.setItem("test_string", "hello");
    localStorage.setItem("test_json", '{"name":"alice","age":30}');
  });

  let extensionId = "";
  const serviceWorkers = context.serviceWorkers();
  if (serviceWorkers.length > 0) {
    const url = serviceWorkers[0].url();
    extensionId = url.split("/")[2];
  } else {
    const sw = await context.waitForEvent("serviceworker");
    extensionId = sw.url().split("/")[2];
  }

  const popupPage = await context.newPage();
  await popupPage.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);

  await expect(popupPage.locator("text=Local")).toBeVisible();
  await expect(popupPage.locator("text=Session")).toBeVisible();

  await page.close();
  await popupPage.close();
});
