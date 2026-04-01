// ISOLATED world content script — relays change events from the MAIN world
// interceptor to the sidepanel via chrome.runtime.sendMessage.
// The interceptor is now declared in manifest.json (world: "MAIN"),
// so no dynamic injection is needed.

import type { StorageChangeEvent, StorageChangePortMessage } from "@/shared/types";

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
