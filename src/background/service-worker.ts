// Service worker is minimal — it only needs to exist for Manifest V3.
// The popup communicates with the content script via chrome.tabs.sendMessage,
// and the content script is injected on demand from the popup.
// No message relay needed since the popup injects and talks to the content script directly.

export {};
