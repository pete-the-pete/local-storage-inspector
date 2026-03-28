/// <reference types="chrome" />
import type { StorageMessage, StorageResponse, StorageEntry } from "@/shared/types";

function getStorage(storageType: "localStorage" | "sessionStorage"): Storage {
  return storageType === "localStorage" ? window.localStorage : window.sessionStorage;
}

function handleGetAll(storageType: "localStorage" | "sessionStorage"): StorageResponse {
  const storage = getStorage(storageType);
  const entries: StorageEntry[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key !== null) {
      entries.push({ key, value: storage.getItem(key) ?? "" });
    }
  }
  return { type: "GET_ALL_RESPONSE", entries };
}

function handleSetValue(
  storageType: "localStorage" | "sessionStorage",
  key: string,
  value: string,
): StorageResponse {
  try {
    const storage = getStorage(storageType);
    storage.setItem(key, value);
    return { type: "SET_VALUE_RESPONSE", success: true };
  } catch {
    return { type: "SET_VALUE_RESPONSE", success: false };
  }
}

function handleDeleteKey(
  storageType: "localStorage" | "sessionStorage",
  key: string,
): StorageResponse {
  try {
    const storage = getStorage(storageType);
    storage.removeItem(key);
    return { type: "DELETE_KEY_RESPONSE", success: true };
  } catch {
    return { type: "DELETE_KEY_RESPONSE", success: false };
  }
}

function handleImport(
  storageType: "localStorage" | "sessionStorage",
  entries: Record<string, string>,
  clearFirst: boolean,
): StorageResponse {
  try {
    const storage = getStorage(storageType);
    if (clearFirst) {
      storage.clear();
    }
    let count = 0;
    for (const [key, value] of Object.entries(entries)) {
      storage.setItem(key, value);
      count++;
    }
    return { type: "IMPORT_RESPONSE", success: true, count };
  } catch {
    return { type: "IMPORT_RESPONSE", success: false, count: 0 };
  }
}

chrome.runtime.onMessage.addListener(
  (message: StorageMessage, _sender, sendResponse: (response: StorageResponse) => void) => {
    switch (message.type) {
      case "GET_ALL":
        sendResponse(handleGetAll(message.storageType));
        break;
      case "SET_VALUE":
        sendResponse(handleSetValue(message.storageType, message.key, message.value));
        break;
      case "DELETE_KEY":
        sendResponse(handleDeleteKey(message.storageType, message.key));
        break;
      case "IMPORT":
        sendResponse(handleImport(message.storageType, message.entries, message.clearFirst));
        break;
    }
    return true;
  },
);
