export async function getActiveTabId(): Promise<number | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

// These functions are passed to chrome.scripting.executeScript and run in the
// page's MAIN world context. They CANNOT import modules — they must be
// self-contained. They live here for organization, not for module reuse.

export function readStorage(storageType: string): Array<{ key: string; value: string }> {
  const storage = storageType === "localStorage" ? localStorage : sessionStorage;
  const entries: Array<{ key: string; value: string }> = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key !== null) {
      entries.push({ key, value: storage.getItem(key) ?? "" });
    }
  }
  return entries;
}

export function writeStorage(storageType: string, key: string, value: string): void {
  const storage = storageType === "localStorage" ? localStorage : sessionStorage;
  (window as unknown as Record<symbol, unknown>)[Symbol.for("lsi-extension-flag")] = true;
  storage.setItem(key, value);
}

export function removeFromStorage(storageType: string, key: string): void {
  const storage = storageType === "localStorage" ? localStorage : sessionStorage;
  (window as unknown as Record<symbol, unknown>)[Symbol.for("lsi-extension-flag")] = true;
  storage.removeItem(key);
}

export function importToStorage(storageType: string, entries: Record<string, string>, clearFirst: boolean): void {
  const storage = storageType === "localStorage" ? localStorage : sessionStorage;
  const FLAG = Symbol.for("lsi-extension-flag");
  if (clearFirst) {
    (window as unknown as Record<symbol, unknown>)[FLAG] = true;
    storage.clear();
  }
  for (const [key, value] of Object.entries(entries)) {
    (window as unknown as Record<symbol, unknown>)[FLAG] = true;
    storage.setItem(key, value);
  }
}
