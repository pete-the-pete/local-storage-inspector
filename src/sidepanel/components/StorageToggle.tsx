import type { StorageType } from "@/shared/types";
import styles from "./StorageToggle.module.css";

interface StorageToggleProps {
  storageType: StorageType;
  onChange: (type: StorageType) => void;
}

export function StorageToggle({ storageType, onChange }: StorageToggleProps) {
  return (
    <div className={styles.toggle}>
      <button
        className={`${styles.button} ${storageType === "localStorage" ? styles.active : ""}`}
        onClick={() => onChange("localStorage")}
      >
        Local
      </button>
      <button
        className={`${styles.button} ${storageType === "sessionStorage" ? styles.active : ""}`}
        onClick={() => onChange("sessionStorage")}
      >
        Session
      </button>
    </div>
  );
}
