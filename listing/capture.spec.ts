/**
 * Chrome Web Store asset capture.
 *
 * Produces 1280x800 screenshots into listing/screenshots/ and a webm
 * recording into listing/video/. Run with:
 *
 *   bun run build
 *   bunx playwright test listing/capture.spec.ts --config=listing/playwright.capture.config.ts --headed
 */
import { chromium, test, type BrowserContext, type Page } from "@playwright/test";
import path from "path";
import fs from "fs";

const extensionPath = path.resolve(__dirname, "../dist");
const screenshotsDir = path.resolve(__dirname, "screenshots");
const videoDir = path.resolve(__dirname, "video");

const VIEWPORT = { width: 1280, height: 800 };

const COMPLEX_JSON = {
  user: {
    profile: {
      name: "Alice Chen",
      email: "alice@example.com",
      settings: {
        theme: {
          colors: { primary: "#1976d2", secondary: "#dc004e" },
          mode: "dark",
        },
        notifications: { email: true, push: false, sms: false },
      },
    },
    metadata: {
      created: "2026-01-15",
      lastLogin: "2026-04-17T09:32:11Z",
      tags: ["admin", "beta-tester", "early-access"],
    },
  },
};

function patchManifestForTesting(): void {
  const manifestPath = path.join(extensionPath, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  const hosts: string[] = manifest.host_permissions ?? [];
  if (!hosts.includes("<all_urls>")) {
    manifest.host_permissions = ["<all_urls>"];
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  }
}

async function launch(recordVideo: boolean): Promise<BrowserContext> {
  patchManifestForTesting();
  fs.mkdirSync(screenshotsDir, { recursive: true });
  fs.mkdirSync(videoDir, { recursive: true });

  return chromium.launchPersistentContext("", {
    headless: false,
    viewport: VIEWPORT,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
    ],
    recordVideo: recordVideo ? { dir: videoDir, size: VIEWPORT } : undefined,
  });
}

async function getExtensionId(context: BrowserContext): Promise<string> {
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent("serviceworker");
  return sw.url().split("/")[2];
}

async function seed(page: Page): Promise<void> {
  await page.goto("https://example.com");
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate((complex: typeof COMPLEX_JSON) => {
    localStorage.clear();
    localStorage.setItem("auth.token", "eyJhbGciOiJIUzI1NiJ9.demo");
    localStorage.setItem("user.profile", JSON.stringify(complex));
    localStorage.setItem("feature-flags", JSON.stringify({
      newDashboard: true,
      betaSearch: false,
      darkMode: true,
    }));
    localStorage.setItem("ui.theme", "dark");
    localStorage.setItem("cart.items", JSON.stringify([
      { sku: "A-100", qty: 2 },
      { sku: "B-220", qty: 1 },
    ]));
    sessionStorage.setItem("session.id", "s_7f3b2a");
  }, COMPLEX_JSON);
}

async function openPanel(context: BrowserContext, page: Page, extensionId: string): Promise<Page> {
  const panel = await context.newPage();
  await panel.setViewportSize(VIEWPORT);
  await panel.goto(
    `chrome-extension://${extensionId}/src/sidepanel/sidepanel.html`,
    { waitUntil: "commit" },
  );
  await page.bringToFront();
  await panel.waitForSelector("text=user.profile", { timeout: 10000 });
  return panel;
}

async function shot(panel: Page, name: string): Promise<void> {
  await panel.waitForTimeout(250);
  await panel.screenshot({
    path: path.join(screenshotsDir, name),
    fullPage: false,
  });
  // eslint-disable-next-line no-console
  console.log(`  captured ${name}`);
}

test("capture Chrome Web Store screenshots", async () => {
  test.setTimeout(120_000);

  const context = await launch(false);
  try {
    const extensionId = await getExtensionId(context);
    const page = await context.newPage();
    await seed(page);
    const panel = await openPanel(context, page, extensionId);

    // 1. Overview — key list with a pretty-printed JSON value selected
    await panel.locator("text=user.profile").click();
    await panel.waitForSelector(".cm-content");
    await shot(panel, "01-overview.png");

    // 2. JSON editor focused on nested structure
    await panel.locator(".cm-content").click();
    await shot(panel, "02-json-editor.png");

    // 3. Change log — generate a few mutations so the log is populated
    await page.evaluate(() => {
      localStorage.setItem("feature-flags", JSON.stringify({
        newDashboard: true,
        betaSearch: true,
        darkMode: true,
        experimentalAI: true,
      }));
    });
    await page.evaluate(() => {
      localStorage.setItem("ui.theme", "light");
    });
    await page.evaluate(() => {
      localStorage.setItem("cart.items", JSON.stringify([
        { sku: "A-100", qty: 3 },
        { sku: "B-220", qty: 1 },
        { sku: "C-900", qty: 1 },
      ]));
    });
    await panel.waitForSelector('[data-testid="change-entry"]');
    await panel.waitForTimeout(500);
    await shot(panel, "03-change-log.png");

    // 4. Inline diff — expand the most recent entry
    await panel.getByTestId("change-entry").first().click();
    await panel.waitForSelector('[data-testid="diff-mode-inline"]');
    await shot(panel, "04-inline-diff.png");

    // 5. Unified diff view
    await panel.getByTestId("diff-mode-unified").click();
    await panel.waitForTimeout(250);
    await shot(panel, "05-unified-diff.png");
  } finally {
    await context.close();
  }
});

test("record Chrome Web Store promo video", async () => {
  test.setTimeout(120_000);

  // Wipe any stray recordings from prior runs so demo.webm is the only file.
  if (fs.existsSync(videoDir)) {
    for (const f of fs.readdirSync(videoDir)) {
      if (f.endsWith(".webm")) fs.unlinkSync(path.join(videoDir, f));
    }
  }

  const context = await launch(true);
  try {
    const extensionId = await getExtensionId(context);
    const page = await context.newPage();
    await seed(page);
    const panel = await openPanel(context, page, extensionId);

    const pause = (ms: number) => panel.waitForTimeout(ms);

    // Slow, deliberate demo
    await pause(700);
    await panel.locator("text=user.profile").click();
    await pause(1500);

    // Filter keys
    await panel.locator('input[placeholder="Filter keys..."]').fill("feature");
    await pause(1000);
    await panel.locator('input[placeholder="Filter keys..."]').fill("");
    await pause(600);

    // Select feature-flags and edit
    await panel.locator("text=feature-flags").click();
    await pause(1200);

    // Trigger page-side changes to populate the log
    await page.evaluate(() => {
      localStorage.setItem("feature-flags", JSON.stringify({
        newDashboard: true,
        betaSearch: true,
        darkMode: true,
      }));
    });
    await pause(900);
    await page.evaluate(() => {
      localStorage.setItem("ui.theme", "light");
    });
    await pause(900);
    await page.evaluate(() => {
      localStorage.setItem("cart.items", JSON.stringify([
        { sku: "A-100", qty: 3 },
        { sku: "B-220", qty: 1 },
        { sku: "C-900", qty: 1 },
      ]));
    });
    await panel.waitForSelector('[data-testid="change-entry"]');
    await pause(1400);

    // Expand a diff
    await panel.getByTestId("change-entry").first().click();
    await pause(1600);

    // Toggle unified
    await panel.getByTestId("diff-mode-unified").click();
    await pause(1800);

    // Back to inline
    await panel.getByTestId("diff-mode-inline").click();
    await pause(1400);

    // Rename the recording to a stable filename on close
    const videoPath = await panel.video()?.path();
    await panel.close();
    await context.close();

    if (videoPath) {
      const target = path.join(videoDir, "demo.webm");
      try {
        if (fs.existsSync(target)) fs.unlinkSync(target);
        fs.renameSync(videoPath, target);
        // eslint-disable-next-line no-console
        console.log(`  recorded ${target}`);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("failed to rename video:", e);
      }
    }
  } finally {
    // context.close() already called in success path; guard double-close
    try {
      await context.close();
    } catch { /* ignore */ }
  }
});
