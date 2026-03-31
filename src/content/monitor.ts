// ISOLATED world content script — bridges the MAIN world interceptor and the sidepanel.
// Registered in manifest.json content_scripts.
// Injects/removes the interceptor, relays change events over a chrome.runtime.connect port.

import type { StorageChangeEvent, StorageChangePortMessage, MonitorMessage } from "@/shared/types";

const BATCH_INTERVAL_MS = 50;
const MAX_BUFFER_SIZE = 100;

let port: chrome.runtime.Port | null = null;
let disconnected = false;
let scriptTag: HTMLScriptElement | null = null;
let batchBuffer: StorageChangeEvent[] = [];
let batchTimer: ReturnType<typeof setTimeout> | null = null;
let eventBuffer: StorageChangeEvent[] = [];

function flushBatch(): void {
  if (batchBuffer.length === 0) return;

  const message: StorageChangePortMessage = {
    type: "STORAGE_CHANGE",
    changes: batchBuffer,
  };
  batchBuffer = [];
  batchTimer = null;

  if (port && !disconnected) {
    port.postMessage(message);
  } else {
    // Buffer events for reconnection
    eventBuffer.push(...message.changes);
    if (eventBuffer.length > MAX_BUFFER_SIZE) {
      eventBuffer = eventBuffer.slice(-MAX_BUFFER_SIZE);
    }
  }
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
  // Flush any pending batch
  if (batchTimer) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }
  flushBatch();
}

function connectPort(): void {
  port = chrome.runtime.connect({ name: "lsi-monitor" });
  disconnected = false;

  port.onDisconnect.addListener(() => {
    disconnected = true;
    port = null;
  });

  // Flush any buffered events on reconnect
  if (eventBuffer.length > 0) {
    const buffered: StorageChangePortMessage = {
      type: "STORAGE_CHANGE",
      changes: eventBuffer,
    };
    eventBuffer = [];
    port.postMessage(buffered);
  }
}

// Listen for change events from the MAIN world interceptor
window.addEventListener("message", (event) => {
  if (event.data?.source !== "lsi-interceptor") return;
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
        if (!port || disconnected) {
          connectPort();
        }
        break;
      case "STOP_RECORDING":
        removeInterceptor();
        break;
      case "SET_EXTENSION_FLAG": {
        // Forward to MAIN world interceptor via postMessage
        window.postMessage({ source: "lsi-monitor", type: "SET_EXTENSION_FLAG" }, "*");
        // Wait for confirmation from interceptor
        const handler = (event: MessageEvent) => {
          if (event.data?.source === "lsi-interceptor" && event.data?.type === "EXTENSION_FLAG_SET") {
            window.removeEventListener("message", handler);
            sendResponse({ type: "SET_EXTENSION_FLAG_RESPONSE", success: true });
          }
        };
        window.addEventListener("message", handler);
        // Timeout after 500ms
        setTimeout(() => {
          window.removeEventListener("message", handler);
          sendResponse({ type: "SET_EXTENSION_FLAG_RESPONSE", success: false });
        }, 500);
        return true; // async response
      }
    }
  },
);
