import { useState, useCallback } from "react";
import type { StorageType, StorageEntry, GetAllResponse } from "@/shared/types";
import { createGetAllMessage, createSetValueMessage, createDeleteKeyMessage } from "@/shared/messages";
import { filterEntries } from "@/lib/filter";
import styles from "./App.module.css";
import { StorageToggle } from "./StorageToggle";
import { SearchBar } from "./SearchBar";
import { KeyList } from "./KeyList";
import { ValueEditor } from "./ValueEditor";

type LoadState = "idle" | "loading" | "ready" | "error";

export function App() {
  const [storageType, setStorageType] = useState<StorageType>("localStorage");
  const [entries, setEntries] = useState<StorageEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [addingNew, setAddingNew] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");

  const loadEntries = useCallback(async (type: StorageType) => {
    setLoadState("loading");
    setSelectedKey(null);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        setErrorMessage("No active tab found");
        setLoadState("error");
        return;
      }

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["src/content/content.ts"],
      });

      const response: GetAllResponse = await chrome.tabs.sendMessage(
        tab.id,
        createGetAllMessage(type),
      );
      setEntries(response.entries);
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
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;
      await chrome.tabs.sendMessage(tab.id, createSetValueMessage(storageType, key, value));
      setEntries((prev) =>
        prev.map((e) => (e.key === key ? { ...e, value } : e)),
      );
    },
    [storageType],
  );

  const handleDelete = useCallback(
    async (key: string) => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;
      await chrome.tabs.sendMessage(tab.id, createDeleteKeyMessage(storageType, key));
      setEntries((prev) => prev.filter((e) => e.key !== key));
      setSelectedKey(null);
    },
    [storageType],
  );

  const handleCopy = useCallback(async (value: string) => {
    await navigator.clipboard.writeText(value);
  }, []);

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
    </div>
  );
}
