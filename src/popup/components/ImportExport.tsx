import { useState, useRef } from "react";
import type { StorageEntry } from "@/shared/types";
import { serializeExport, deserializeImport } from "@/lib/serialization";
import styles from "./ImportExport.module.css";

interface ImportExportProps {
  entries: StorageEntry[];
  onImport: (entries: Record<string, string>, clearFirst: boolean) => void;
}

export function ImportExport({ entries, onImport }: ImportExportProps) {
  const [importPreview, setImportPreview] = useState<Record<string, string> | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const existingKeys = new Set(entries.map((e) => e.key));

  const handleExport = () => {
    const content = serializeExport(entries);
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "storage-export.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const content = await file.text();
    const result = deserializeImport(content);

    if (!result.success) {
      setImportError(result.error);
      setImportPreview(null);
    } else {
      setImportPreview(result.entries);
      setImportError(null);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleConfirmImport = () => {
    if (!importPreview) return;
    onImport(importPreview, false);
    setImportPreview(null);
  };

  const handleCancelImport = () => {
    setImportPreview(null);
    setImportError(null);
  };

  return (
    <>
      <div className={styles.bar}>
        <button className={styles.button} onClick={handleExport}>
          Export
        </button>
        <button className={styles.button} onClick={() => fileInputRef.current?.click()}>
          Import
        </button>
        <input
          ref={fileInputRef}
          className={styles.fileInput}
          type="file"
          accept=".json"
          onChange={handleFileSelect}
        />
      </div>
      {importError && <div className={styles.error}>{importError}</div>}
      {importPreview && (
        <div className={styles.preview}>
          <div className={styles.previewTitle}>
            Import {Object.keys(importPreview).length} key(s):
          </div>
          <div className={styles.previewKeys}>
            {Object.keys(importPreview).map((key) => (
              <div
                key={key}
                className={`${styles.previewKey} ${existingKeys.has(key) ? styles.overwrite : ""}`}
              >
                {key}
                {existingKeys.has(key) && " (overwrite)"}
              </div>
            ))}
          </div>
          <div className={styles.previewActions}>
            <button className={styles.confirmButton} onClick={handleConfirmImport}>
              Confirm Import
            </button>
            <button className={styles.cancelButton} onClick={handleCancelImport}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
