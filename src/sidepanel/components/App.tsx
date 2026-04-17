import { useState, useCallback, useRef, useEffect } from "react";
import type { StorageType, StorageEntry, StorageChangeEvent, StorageChangePortMessage } from "@/shared/types";

import { filterEntries } from "@/lib/filter";
import { getActiveTabId, readStorage, writeStorage, removeFromStorage, importToStorage } from "@/lib/storage";
import { injectIntoTab } from "@/lib/inject";
import {
  originToMatchPattern,
  matchPatternToOrigin,
  hasOriginPermission,
  requestOriginPermission,
  removeOriginPermission,
} from "@/lib/host-permissions";
import styles from "./App.module.css";
import { StorageToggle } from "./StorageToggle";
import { SearchBar } from "./SearchBar";
import { KeyList } from "./KeyList";
import { ValueEditor } from "./ValueEditor";
import { ImportExport } from "./ImportExport";
import { ChangeLog } from "./ChangeLog";
import { ResizeHandle } from "./ResizeHandle";
import { OriginIndicator, type OriginState } from "./OriginIndicator";
import { StaleTabBanner } from "./StaleTabBanner";

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
  const [recording, setRecording] = useState(true);
  const [changes, setChanges] = useState<StorageChangeEvent[]>([]);
  const [truncatedCount, setTruncatedCount] = useState(0);
  const [originState, setOriginState] = useState<OriginState>({ kind: "loading" });
  const [loadedTabId, setLoadedTabId] = useState<number | null>(null);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [bannerDismissedForTabId, setBannerDismissedForTabId] = useState<number | null>(null);

  const refreshOriginState = useCallback(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const pattern = originToMatchPattern(tab?.url);
    if (!pattern) {
      setOriginState({ kind: "unsupported" });
      return;
    }
    const origin = matchPatternToOrigin(pattern);
    if (!origin) {
      setOriginState({ kind: "unsupported" });
      return;
    }
    const granted = await hasOriginPermission(origin);
    setOriginState(granted ? { kind: "persistent", origin } : { kind: "session", origin });
  }, []);

  const recordingRef = useRef(true);
  const [keysPanelWidth, setKeysPanelWidth] = useState(180);
  const [keysPanelCollapsed, setKeysPanelCollapsed] = useState(false);
  const savedKeysPanelWidth = useRef(180);

  const handleKeysResize = useCallback((delta: number) => {
    setKeysPanelWidth((prev) => Math.min(300, Math.max(80, prev + delta)));
  }, []);

  const handleKeysCollapseToggle = useCallback(() => {
    setKeysPanelCollapsed((prev) => {
      if (prev) {
        setKeysPanelWidth(savedKeysPanelWidth.current);
      } else {
        savedKeysPanelWidth.current = keysPanelWidth;
      }
      return !prev;
    });
  }, [keysPanelWidth]);

  const [changeLogHeight, setChangeLogHeight] = useState(200);

  const handleChangeLogResize = useCallback((delta: number) => {
    setChangeLogHeight((prev) =>
      Math.min(window.innerHeight * 0.6, Math.max(60, prev - delta)),
    );
  }, []);

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

  // Listen for change events from the content script via runtime messages
  useEffect(() => {
    const handleMessage = (
      message: StorageChangePortMessage,
      sender: chrome.runtime.MessageSender,
    ) => {
      if (sender.id !== chrome.runtime.id) return;
      if (message.type === "STORAGE_CHANGE" && recordingRef.current) {
        addChanges(message.changes);
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [addChanges]);

  const handleToggleRecording = useCallback(() => {
    const newRecording = !recordingRef.current;
    recordingRef.current = newRecording;
    setRecording(newRecording);
  }, []);

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

      // Re-inject on every load. Idempotent at the page level thanks to the
      // guards in the interceptor and monitor, and safely handles the case
      // where the user navigated the tab while the panel was open.
      const injectResult = await injectIntoTab(tabId);
      if (injectResult.status === "unsupported") {
        setErrorMessage("Storage inspection isn't available on this page.");
        setLoadState("error");
        void refreshOriginState();
        return;
      }
      if (injectResult.status === "error") {
        setErrorMessage(`Failed to inject: ${injectResult.error}`);
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
      setLoadedTabId(tabId);
      setBannerDismissedForTabId(null);
      void refreshOriginState();
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "Failed to load storage");
      setLoadState("error");
    }
  }, [refreshOriginState]);

  useEffect(() => {
    const handleAdded = () => { void refreshOriginState(); };
    const handleRemoved = () => { void refreshOriginState(); };
    chrome.permissions.onAdded.addListener(handleAdded);
    chrome.permissions.onRemoved.addListener(handleRemoved);
    void refreshOriginState();
    return () => {
      chrome.permissions.onAdded.removeListener(handleAdded);
      chrome.permissions.onRemoved.removeListener(handleRemoved);
    };
  }, [refreshOriginState]);

  useEffect(() => {
    const handleActivated = (info: chrome.tabs.OnActivatedInfo) => {
      setActiveTabId(info.tabId);
    };
    chrome.tabs.onActivated.addListener(handleActivated);
    void getActiveTabId().then((id) => { if (id != null) setActiveTabId(id); });
    return () => chrome.tabs.onActivated.removeListener(handleActivated);
  }, []);

  useEffect(() => {
    const handleTabUpdated = (
      tabId: number,
      changeInfo: chrome.tabs.OnUpdatedInfo,
    ) => {
      // onUpdated fires for title, favicon, and status changes too — only URL changes affect storage.
      if (!changeInfo.url) return;
      if (loadedTabId !== tabId) return;
      void (async () => {
        await refreshOriginState();
        await loadEntries(storageType);
      })();
    };
    chrome.tabs.onUpdated.addListener(handleTabUpdated);
    return () => chrome.tabs.onUpdated.removeListener(handleTabUpdated);
  }, [refreshOriginState, loadEntries, storageType, loadedTabId]);

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
        world: "MAIN",
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
        world: "MAIN",
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
        world: "MAIN",
        func: importToStorage,
        args: [storageType, importEntries, clearFirst],
      });
      loadEntries(storageType);
    },
    [storageType, loadEntries],
  );

  const handleAllowOrigin = useCallback(() => {
    // IMPORTANT: do NOT await anything before requestOriginPermission —
    // Chrome requires this call to be inside the user-gesture handler, and
    // any await before it breaks the gesture association.
    if (originState.kind !== "session") return;
    const origin = originState.origin;
    requestOriginPermission(origin)
      .then((granted) => {
        if (granted) {
          setOriginState({ kind: "persistent", origin });
        }
      })
      .catch((e) => {
        console.error("permission request failed", e);
      });
  }, [originState]);

  const handleRevokeOrigin = useCallback(async () => {
    // Existing change log entries stay visible after revoke; only new
    // events stop flowing. The service worker's permissions.onRemoved
    // handler unregisters the persistent content script, and any
    // ephemeral monitor injected via executeScript dies on the next
    // navigation since activeTab is also gone.
    if (originState.kind !== "persistent") return;
    const origin = originState.origin;
    const removed = await removeOriginPermission(origin);
    if (removed) {
      setOriginState({ kind: "session", origin });
    }
  }, [originState]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") {
      setSelectedKey(null);
      setAddingNew(false);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const filteredEntries = filterEntries(entries, searchQuery);

  const selectedEntry = selectedKey
    ? entries.find((e) => e.key === selectedKey) ?? null
    : null;

  const showStaleTabBanner =
    loadedTabId != null &&
    activeTabId != null &&
    activeTabId !== loadedTabId &&
    activeTabId !== bannerDismissedForTabId;

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
      {showStaleTabBanner && (
        <div className={styles.originRow}>
          <StaleTabBanner
            onInspect={() => loadEntries(storageType)}
            onDismiss={() => setBannerDismissedForTabId(activeTabId)}
          />
        </div>
      )}
      <div className={styles.originRow}>
        <OriginIndicator
          state={originState}
          onAllow={handleAllowOrigin}
          onRevoke={handleRevokeOrigin}
        />
      </div>
      <div className={styles.body}>
        {loadState === "loading" && <div className={styles.loading}>Loading...</div>}
        {loadState === "error" && <div className={styles.error}>{errorMessage}</div>}
        {loadState === "ready" && (
          <>
            <div
              className={`${styles.keyListWrapper} ${keysPanelCollapsed ? styles.keyListCollapsed : ""}`}
              style={keysPanelCollapsed ? undefined : { width: keysPanelWidth }}
            >
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
            </div>
            <ResizeHandle
              direction="horizontal"
              onResize={handleKeysResize}
              collapsed={keysPanelCollapsed}
              onToggleCollapse={handleKeysCollapseToggle}
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
              <div className={styles.newKeySection}>
                <div className={styles.newKeyLabel}>
                  <label className={styles.newKeyLabelText}>Key name:</label>
                  <input
                    className={styles.newKeyInput}
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
              <div className={styles.noSelection}>
                Select a key to edit
              </div>
            )}
          </>
        )}
      </div>
      {loadState === "ready" && (
        <ImportExport entries={entries} onImport={handleImport} />
      )}
      <ResizeHandle
        direction="vertical"
        onResize={handleChangeLogResize}
      />
      <div style={{ height: changeLogHeight, flexShrink: 0 }}>
        <ChangeLog
          changes={changes}
          recording={recording}
          truncatedCount={truncatedCount}
          onToggleRecording={handleToggleRecording}
          onClear={handleClearChanges}
        />
      </div>
    </div>
  );
}
