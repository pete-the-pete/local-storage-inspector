import { useState, useCallback, useRef, useEffect } from "react";
import type { StorageType, StorageEntry, StorageChangeEvent, StorageChangePortMessage } from "@/shared/types";

import { filterEntries } from "@/lib/filter";
import styles from "./App.module.css";
import { StorageToggle } from "./StorageToggle";
import { SearchBar } from "./SearchBar";
import { KeyList } from "./KeyList";
import { ValueEditor } from "./ValueEditor";
import { ImportExport } from "./ImportExport";
import { ChangeLog } from "./ChangeLog";

type LoadState = "idle" | "loading" | "ready" | "error";

async function getActiveTabId(): Promise<number | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

function readStorage(storageType: string): Array<{ key: string; value: string }> {
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

function writeStorage(storageType: string, key: string, value: string): void {
  const storage = storageType === "localStorage" ? localStorage : sessionStorage;
  storage.setItem(key, value);
}

function removeFromStorage(storageType: string, key: string): void {
  const storage = storageType === "localStorage" ? localStorage : sessionStorage;
  storage.removeItem(key);
}

function importToStorage(storageType: string, entries: Record<string, string>, clearFirst: boolean): void {
  const storage = storageType === "localStorage" ? localStorage : sessionStorage;
  if (clearFirst) storage.clear();
  for (const [key, value] of Object.entries(entries)) {
    storage.setItem(key, value);
  }
}

export function App() {
  const [storageType, setStorageType] = useState<StorageType>("localStorage");
  const [entries, setEntries] = useState<StorageEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [addingNew, setAddingNew] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [recording, setRecording] = useState(true);
  const [changes, setChanges] = useState<StorageChangeEvent[]>([]);
  const [truncatedCount, setTruncatedCount] = useState(0);
  const recordingRef = useRef(true);

  const MAX_CHANGES = 100;

  const addChanges = useCallback((newChanges: StorageChangeEvent[]) => {
    setChanges((prev) => {
      const combined = [...newChanges.reverse(), ...prev];
      if (combined.length > MAX_CHANGES) {
        const overflow = combined.length - MAX_CHANGES;
        setTruncatedCount((t) => t + overflow);
        return combined.slice(0, MAX_CHANGES);
      }
      return combined;
    });
  }, []);

  // Start/stop recording by messaging the content script
  const sendRecordingMessage = useCallback(async (start: boolean) => {
    const tabId = await getActiveTabId();
    if (!tabId) return;
    try {
      await chrome.tabs.sendMessage(tabId, { type: start ? "START_RECORDING" : "STOP_RECORDING" });
    } catch {
      // Content script may not be ready yet
    }
  }, []);

  // Listen for change events from the content script via runtime messages
  useEffect(() => {
    const handleMessage = (message: StorageChangePortMessage) => {
      if (message.type === "STORAGE_CHANGE" && recordingRef.current) {
        addChanges(message.changes);
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [addChanges]);

  // Start recording on initial load
  useEffect(() => {
    sendRecordingMessage(true);
  }, [sendRecordingMessage]);

  const handleToggleRecording = useCallback(() => {
    const newRecording = !recordingRef.current;
    recordingRef.current = newRecording;
    setRecording(newRecording);
    sendRecordingMessage(newRecording);
  }, [sendRecordingMessage]);

  const handleClearChanges = useCallback(() => {
    setChanges([]);
    setTruncatedCount(0);
  }, []);

  const loadEntries = useCallback(async (type: StorageType) => {
    setLoadState("loading");
    setSelectedKey(null);
    try {
      const tabId = await getActiveTabId();
      if (!tabId) {
        setErrorMessage("No active tab found");
        setLoadState("error");
        return;
      }

      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: readStorage,
        args: [type],
      });

      const tabEntries = results[0]?.result ?? [];
      setEntries(tabEntries);
      setLoadState("ready");
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "Failed to load storage");
      setLoadState("error");
    }
  }, []);

  const handleStorageTypeChange = useCallback(
    (type: StorageType) => {
      setStorageType(type);
      loadEntries(type);
    },
    [loadEntries],
  );

  const handleSave = useCallback(
    async (key: string, value: string) => {
      const tabId = await getActiveTabId();
      if (!tabId) return;
      await chrome.scripting.executeScript({
        target: { tabId },
        func: writeStorage,
        args: [storageType, key, value],
      });
      setEntries((prev) =>
        prev.map((e) => (e.key === key ? { ...e, value } : e)),
      );
    },
    [storageType],
  );

  const handleDelete = useCallback(
    async (key: string) => {
      const tabId = await getActiveTabId();
      if (!tabId) return;
      await chrome.scripting.executeScript({
        target: { tabId },
        func: removeFromStorage,
        args: [storageType, key],
      });
      setEntries((prev) => prev.filter((e) => e.key !== key));
      setSelectedKey(null);
    },
    [storageType],
  );

  const handleCopy = useCallback(async (value: string) => {
    await navigator.clipboard.writeText(value);
  }, []);

  const handleImport = useCallback(
    async (importEntries: Record<string, string>, clearFirst: boolean) => {
      const tabId = await getActiveTabId();
      if (!tabId) return;
      await chrome.scripting.executeScript({
        target: { tabId },
        func: importToStorage,
        args: [storageType, importEntries, clearFirst],
      });
      loadEntries(storageType);
    },
    [storageType, loadEntries],
  );

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") {
      setSelectedKey(null);
      setAddingNew(false);
    }
  }, []);

  if (typeof window !== "undefined") {
    window.addEventListener("keydown", handleKeyDown);
  }

  const filteredEntries = filterEntries(entries, searchQuery);

  const selectedEntry = selectedKey
    ? entries.find((e) => e.key === selectedKey) ?? null
    : null;

  // Load on first render
  if (loadState === "idle") {
    loadEntries(storageType);
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <StorageToggle storageType={storageType} onChange={handleStorageTypeChange} />
        <SearchBar query={searchQuery} onChange={setSearchQuery} />
      </div>
      <div className={styles.body}>
        {loadState === "loading" && <div className={styles.loading}>Loading...</div>}
        {loadState === "error" && <div className={styles.error}>{errorMessage}</div>}
        {loadState === "ready" && (
          <>
            <KeyList
              entries={filteredEntries}
              selectedKey={selectedKey}
              onSelectKey={(key) => { setSelectedKey(key); setAddingNew(false); }}
              onAddNew={() => {
                setSelectedKey(null);
                setAddingNew(true);
                setNewKeyName("");
              }}
            />
            {selectedEntry ? (
              <ValueEditor
                key={selectedEntry.key}
                storageKey={selectedEntry.key}
                value={selectedEntry.value}
                onSave={handleSave}
                onDelete={handleDelete}
                onCopy={handleCopy}
              />
            ) : addingNew ? (
              <div style={{ flex: 1, padding: 12 }}>
                <div style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 12, fontWeight: 600 }}>Key name:</label>
                  <input
                    style={{ width: "100%", padding: "4px 8px", marginTop: 4, boxSizing: "border-box", border: "1px solid #ccc", borderRadius: 4, fontSize: 12 }}
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    placeholder="Enter key name"
                    autoFocus
                  />
                </div>
                {newKeyName && (
                  <ValueEditor
                    key={`new-${newKeyName}`}
                    storageKey={newKeyName}
                    value=""
                    onSave={(key, value) => {
                      handleSave(key, value);
                      setAddingNew(false);
                      setSelectedKey(key);
                      loadEntries(storageType);
                    }}
                    onDelete={() => setAddingNew(false)}
                    onCopy={handleCopy}
                  />
                )}
              </div>
            ) : (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#999" }}>
                Select a key to edit
              </div>
            )}
          </>
        )}
      </div>
      {loadState === "ready" && (
        <ImportExport entries={entries} onImport={handleImport} />
      )}
      <ChangeLog
        changes={changes}
        recording={recording}
        truncatedCount={truncatedCount}
        onToggleRecording={handleToggleRecording}
        onClear={handleClearChanges}
      />
    </div>
  );
}
