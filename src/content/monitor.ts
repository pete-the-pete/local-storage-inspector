// ISOLATED world content script — relays change events from the MAIN world
// interceptor to the sidepanel via chrome.runtime.sendMessage.
// The interceptor is now declared in manifest.json (world: "MAIN"),
// so no dynamic injection is needed.

import type { StorageChangeEvent, StorageChangePortMessage } from "@/shared/types";

// Inlined here rather than imported from @/lib/validate because content scripts
// are classic scripts — Vite code-splits shared modules into separate chunks
// that content scripts can't load via ES module imports.
function isValidStorageChangeData(data: unknown): boolean {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  const validStorageTypes = ["localStorage", "sessionStorage"];
  const validOperations = ["setItem", "removeItem", "clear"];
  const validSources = ["page", "extension", "unknown"];
  return (
    typeof d.storageType === "string" &&
    validStorageTypes.includes(d.storageType) &&
    typeof d.operation === "string" &&
    validOperations.includes(d.operation) &&
    typeof d.source === "string" &&
    validSources.includes(d.source) &&
    typeof d.timestamp === "number" &&
    (typeof d.key === "string" || d.key === null) &&
    (typeof d.oldValue === "string" || d.oldValue === null) &&
    (typeof d.newValue === "string" || d.newValue === null)
  );
}

const BATCH_INTERVAL_MS = 50;

let batchBuffer: StorageChangeEvent[] = [];
let batchTimer: ReturnType<typeof setTimeout> | null = null;

function flushBatch(): void {
  if (batchBuffer.length === 0) return;

  const message: StorageChangePortMessage = {
    type: "STORAGE_CHANGE",
    changes: batchBuffer,
  };
  batchBuffer = [];
  batchTimer = null;

  chrome.runtime.sendMessage(message).catch(() => {
    // Sidepanel may not be open
  });
}

function queueChange(event: StorageChangeEvent): void {
  batchBuffer.push(event);
  if (!batchTimer) {
    batchTimer = setTimeout(flushBatch, BATCH_INTERVAL_MS);
  }
}

// Listen for change events from the MAIN world interceptor
window.addEventListener("message", (event) => {
  if (event.data?._lsi !== "interceptor") return;
  if (!isValidStorageChangeData(event.data)) return;

  const change: StorageChangeEvent = {
    storageType: event.data.storageType,
    operation: event.data.operation,
    key: event.data.key,
    oldValue: event.data.oldValue,
    newValue: event.data.newValue,
    timestamp: event.data.timestamp,
    source: event.data.source,
  };

  queueChange(change);
});
