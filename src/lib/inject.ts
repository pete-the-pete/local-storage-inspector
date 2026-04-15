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
