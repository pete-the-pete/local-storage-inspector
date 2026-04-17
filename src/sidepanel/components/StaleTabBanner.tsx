import styles from "./StaleTabBanner.module.css";

interface Props {
  onInspect: () => void;
  onDismiss: () => void;
}

const WARNING = "\u26A0";

export function StaleTabBanner({ onInspect, onDismiss }: Props) {
  return (
    <div className={styles.banner}>
      <span className={styles.icon}>{WARNING}</span>
      <span className={styles.message}>You've switched tabs</span>
      <button type="button" className={styles.inspectButton} onClick={onInspect}>
        Inspect this tab
      </button>
      <button type="button" className={styles.closeButton} onClick={onDismiss} aria-label="Dismiss">
        &times;
      </button>
    </div>
  );
}
