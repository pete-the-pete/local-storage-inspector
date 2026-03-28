import type { StorageEntry } from "@/shared/types";
import styles from "./KeyList.module.css";

interface KeyListProps {
  entries: StorageEntry[];
  selectedKey: string | null;
  onSelectKey: (key: string) => void;
  onAddNew: () => void;
}

export function KeyList({ entries, selectedKey, onSelectKey, onAddNew }: KeyListProps) {
  return (
    <div className={styles.list}>
      <button className={styles.addButton} onClick={onAddNew}>
        + Add new key
      </button>
      {entries.length === 0 && <div className={styles.empty}>No keys found</div>}
      {entries.map((entry) => (
        <div
          key={entry.key}
          className={`${styles.item} ${entry.key === selectedKey ? styles.selected : ""}`}
          onClick={() => onSelectKey(entry.key)}
          title={entry.key}
        >
          {entry.key}
        </div>
      ))}
    </div>
  );
}
