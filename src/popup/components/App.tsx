import { useState, useCallback } from "react";
import type { StorageType, StorageEntry, GetAllResponse } from "@/shared/types";
import { createGetAllMessage } from "@/shared/messages";
import { filterEntries } from "@/lib/filter";
import styles from "./App.module.css";
import { StorageToggle } from "./StorageToggle";
import { SearchBar } from "./SearchBar";
import { KeyList } from "./KeyList";

type LoadState = "idle" | "loading" | "ready" | "error";

export function App() {
  const [storageType, setStorageType] = useState<StorageType>("localStorage");
  const [entries, setEntries] = useState<StorageEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [errorMessage, setErrorMessage] = useState("");

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
              onSelectKey={setSelectedKey}
              onAddNew={() => setSelectedKey(null)}
            />
            <div style={{ flex: 1, padding: 12 }}>
              {selectedEntry
                ? <span>Editor for: {selectedEntry.key}</span>
                : <span style={{ color: "#999" }}>Select a key to edit</span>
              }
            </div>
          </>
        )}
      </div>
    </div>
  );
}
