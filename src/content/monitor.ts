// ISOLATED world content script — bridges the MAIN world interceptor and the sidepanel.
// Registered in manifest.json content_scripts.
// Injects/removes the interceptor, relays change events via chrome.runtime.sendMessage.

import type { StorageChangeEvent, StorageChangePortMessage, MonitorMessage } from "@/shared/types";

const BATCH_INTERVAL_MS = 50;

let scriptTag: HTMLScriptElement | null = null;
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

function injectInterceptor(): void {
  if (scriptTag) return;
  scriptTag = document.createElement("script");
  scriptTag.src = chrome.runtime.getURL("storage-interceptor.js");
  (document.head || document.documentElement).appendChild(scriptTag);
}

function removeInterceptor(): void {
  if (scriptTag) {
    scriptTag.remove();
    scriptTag = null;
  }
  if (batchTimer) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }
  flushBatch();
}

// Listen for change events from the MAIN world interceptor
window.addEventListener("message", (event) => {
  if (event.data?._lsi !== "interceptor") return;
  if (event.data.type === "EXTENSION_FLAG_SET") return;

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

// Listen for messages from the sidepanel
chrome.runtime.onMessage.addListener(
  (message: MonitorMessage, _sender, sendResponse) => {
    switch (message.type) {
      case "START_RECORDING":
        injectInterceptor();
        break;
      case "STOP_RECORDING":
        removeInterceptor();
        break;
      case "SET_EXTENSION_FLAG": {
        window.postMessage({ _lsi: "monitor", type: "SET_EXTENSION_FLAG" }, "*");
        const handler = (event: MessageEvent) => {
          if (event.data?._lsi === "interceptor" && event.data?.type === "EXTENSION_FLAG_SET") {
            window.removeEventListener("message", handler);
            sendResponse({ type: "SET_EXTENSION_FLAG_RESPONSE", success: true });
          }
        };
        window.addEventListener("message", handler);
        setTimeout(() => {
          window.removeEventListener("message", handler);
          sendResponse({ type: "SET_EXTENSION_FLAG_RESPONSE", success: false });
        }, 500);
        return true;
      }
    }
  },
);
