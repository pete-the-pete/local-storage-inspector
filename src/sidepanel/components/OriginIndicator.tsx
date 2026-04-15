import styles from "./OriginIndicator.module.css";

export type OriginState =
  | { kind: "loading" }
  | { kind: "unsupported" }
  | { kind: "session"; origin: string }
  | { kind: "persistent"; origin: string };

interface Props {
  state: OriginState;
  onAllow: () => void;
  onRevoke: () => void;
}

const GLOBE = "\u{1F310}";
const CHECK = "\u2713";

export function OriginIndicator({ state, onAllow, onRevoke }: Props) {
  if (state.kind === "loading") {
    return (
      <div className={styles.indicator}>
        <span className={styles.icon}>{GLOBE}</span>
        <span className={styles.origin}>…</span>
      </div>
    );
  }

  if (state.kind === "unsupported") {
    return (
      <div
        className={`${styles.indicator} ${styles.unsupported}`}
        title="Storage inspection not available on this page"
      >
        <span className={styles.icon}>{GLOBE}</span>
        <span className={styles.origin}>—</span>
      </div>
    );
  }

  if (state.kind === "session") {
    return (
      <div className={styles.indicator}>
        <span className={styles.icon}>{GLOBE}</span>
        <span className={styles.origin} title={state.origin}>{state.origin}</span>
        <button type="button" className={styles.button} onClick={onAllow}>
          Always allow
        </button>
      </div>
    );
  }

  // persistent
  return (
    <div className={styles.indicator}>
      <span className={styles.icon}>{GLOBE}</span>
      <span className={styles.origin} title={state.origin}>{state.origin}</span>
      <span className={styles.granted} aria-label="persistent access granted">{CHECK}</span>
      <button type="button" className={styles.button} onClick={onRevoke}>
        Revoke
      </button>
    </div>
  );
}
