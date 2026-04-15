// ISOLATED world content script — relays change events from the MAIN world
// interceptor to the sidepanel via chrome.runtime.sendMessage.
//
// Injected on demand from the service worker (chrome.scripting.executeScript)
// and from the sidepanel (loadEntries safety-net), and also as a registered
// content script for origins the user has granted persistent access to.

(function () {
  "use strict";

  // Guard against double-injection on the same document: the interceptor has
  // its own guard, but without this one we would double-register the message
  // listener and duplicate every change event.
  const INSTALLED = Symbol.for("lsi-monitor-installed");
  if (window[INSTALLED]) return;
  window[INSTALLED] = true;

  const BATCH_INTERVAL_MS = 50;

  let batchBuffer = [];
  let batchTimer = null;

  function isValidStorageChangeData(data) {
    if (typeof data !== "object" || data === null) return false;
    const validStorageTypes = ["localStorage", "sessionStorage"];
    const validOperations = ["setItem", "removeItem", "clear"];
    const validSources = ["page", "extension", "unknown"];
    return (
      typeof data.storageType === "string" &&
      validStorageTypes.includes(data.storageType) &&
      typeof data.operation === "string" &&
      validOperations.includes(data.operation) &&
      typeof data.source === "string" &&
      validSources.includes(data.source) &&
      typeof data.timestamp === "number" &&
      (typeof data.key === "string" || data.key === null) &&
      (typeof data.oldValue === "string" || data.oldValue === null) &&
      (typeof data.newValue === "string" || data.newValue === null)
    );
  }

  function flushBatch() {
    if (batchBuffer.length === 0) return;

    const message = {
      type: "STORAGE_CHANGE",
      changes: batchBuffer,
    };
    batchBuffer = [];
    batchTimer = null;

    chrome.runtime.sendMessage(message).catch(function () {
      // Sidepanel may not be open — silently drop.
    });
  }

  function queueChange(event) {
    batchBuffer.push(event);
    if (!batchTimer) {
      batchTimer = setTimeout(flushBatch, BATCH_INTERVAL_MS);
    }
  }

  window.addEventListener("message", function (event) {
    if (!event.data || event.data._lsi !== "interceptor") return;
    if (!isValidStorageChangeData(event.data)) return;

    queueChange({
      storageType: event.data.storageType,
      operation: event.data.operation,
      key: event.data.key,
      oldValue: event.data.oldValue,
      newValue: event.data.newValue,
      timestamp: event.data.timestamp,
      source: event.data.source,
    });
  });
})();
