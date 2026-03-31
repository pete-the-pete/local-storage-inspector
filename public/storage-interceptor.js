// MAIN world script — monkey-patches Storage.prototype to capture mutations.
// Injected via <script> tag by the monitor content script.
// Communicates with the ISOLATED world monitor via window.postMessage.

(function () {
  "use strict";

  const ORIGINAL_SET_ITEM = Symbol.for("lsi-original-setItem");
  const ORIGINAL_REMOVE_ITEM = Symbol.for("lsi-original-removeItem");
  const ORIGINAL_CLEAR = Symbol.for("lsi-original-clear");
  const EXTENSION_FLAG = Symbol.for("lsi-extension-flag");

  function getStorageType(storage) {
    return storage === localStorage ? "localStorage" : "sessionStorage";
  }

  function getSource() {
    if (window[EXTENSION_FLAG]) {
      window[EXTENSION_FLAG] = false;
      return "extension";
    }
    return "page";
  }

  function postChange(detail) {
    window.postMessage({
      _lsi: "interceptor",
      ...detail,
    }, "*");
  }

  // Only patch once — guard against re-injection
  if (window[ORIGINAL_SET_ITEM]) return;

  // Store originals (preserving any prior patches by other extensions)
  window[ORIGINAL_SET_ITEM] = Storage.prototype.setItem;
  window[ORIGINAL_REMOVE_ITEM] = Storage.prototype.removeItem;
  window[ORIGINAL_CLEAR] = Storage.prototype.clear;

  Storage.prototype.setItem = function (key, value) {
    var oldValue = this.getItem(key);
    var storageType = getStorageType(this);
    var source = getSource();
    try {
      window[ORIGINAL_SET_ITEM].call(this, key, value);
    } finally {
      postChange({
        storageType: storageType,
        operation: "setItem",
        key: key,
        oldValue: oldValue,
        newValue: value,
        timestamp: Date.now(),
        source: source,
      });
    }
  };

  Storage.prototype.removeItem = function (key) {
    var oldValue = this.getItem(key);
    var storageType = getStorageType(this);
    var source = getSource();
    try {
      window[ORIGINAL_REMOVE_ITEM].call(this, key);
    } finally {
      postChange({
        storageType: storageType,
        operation: "removeItem",
        key: key,
        oldValue: oldValue,
        newValue: null,
        timestamp: Date.now(),
        source: source,
      });
    }
  };

  Storage.prototype.clear = function () {
    var storageType = getStorageType(this);
    var source = getSource();
    try {
      window[ORIGINAL_CLEAR].call(this);
    } finally {
      postChange({
        storageType: storageType,
        operation: "clear",
        key: null,
        oldValue: null,
        newValue: null,
        timestamp: Date.now(),
        source: source,
      });
    }
  };

  // Listen for extension flag setting from monitor (via postMessage from ISOLATED world)
  window.addEventListener("message", function (event) {
    if (event.data && event.data._lsi === "monitor" && event.data.type === "SET_EXTENSION_FLAG") {
      window[EXTENSION_FLAG] = true;
      window.postMessage({ _lsi: "interceptor", type: "EXTENSION_FLAG_SET" }, "*");
    }
  });
})();
