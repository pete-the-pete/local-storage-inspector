import { useState } from "react";
import type { StorageChangeEvent } from "@/shared/types";
import { jsonDiff, formatChangeSummary, diffLines } from "@/lib/diff";
import styles from "./ChangeLog.module.css";

const MAX_ENTRIES = 100;

interface ChangeLogProps {
  changes: StorageChangeEvent[];
  recording: boolean;
  truncatedCount: number;
  onToggleRecording: () => void;
  onClear: () => void;
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${h}:${m}:${s}.${ms}`;
}

function formatValue(value: string | null): string {
  if (value === null) return "(null)";
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function InlineDiff({
  oldValue,
  newValue,
}: {
  oldValue: string | null;
  newValue: string | null;
}) {
  const oldText = formatValue(oldValue);
  const newText = formatValue(newValue);
  const lines = diffLines(oldText, newText);

  return (
    <>
      {oldValue !== null && (
        <>
          <div className={styles.detailLabel}>Old</div>
          <pre className={styles.diffBlock}>
            {lines
              .filter((l) => l.type !== "added")
              .map((line, i) => (
                <div
                  key={i}
                  className={
                    line.type === "removed" ? styles.diffRemoved : undefined
                  }
                >
                  {line.text}
                </div>
              ))}
          </pre>
        </>
      )}
      <div className={styles.detailLabel}>New</div>
      <pre className={styles.diffBlock}>
        {lines
          .filter((l) => l.type !== "removed")
          .map((line, i) => (
            <div
              key={i}
              className={
                line.type === "added" ? styles.diffAdded : undefined
              }
            >
              {line.text}
            </div>
          ))}
      </pre>
    </>
  );
}

function UnifiedDiff({
  oldValue,
  newValue,
}: {
  oldValue: string | null;
  newValue: string | null;
}) {
  const oldText = formatValue(oldValue);
  const newText = formatValue(newValue);
  const lines = diffLines(oldText, newText);

  return (
    <pre className={styles.diffBlock}>
      {lines.map((line, i) => {
        const prefix =
          line.type === "added" ? "+" : line.type === "removed" ? "-" : " ";
        const className =
          line.type === "added"
            ? styles.diffAdded
            : line.type === "removed"
              ? styles.diffRemoved
              : undefined;
        return (
          <div key={i} className={className}>
            {prefix} {line.text}
          </div>
        );
      })}
    </pre>
  );
}

function ChangeEntry({ change }: { change: StorageChangeEvent }) {
  const [expanded, setExpanded] = useState(false);
  const [diffMode, setDiffMode] = useState<"inline" | "unified">("inline");

  const fieldChanges =
    change.operation !== "clear"
      ? jsonDiff(change.oldValue, change.newValue)
      : [];
  const summary =
    change.operation === "clear" ? "" : formatChangeSummary(fieldChanges);

  const sourceClass =
    change.source === "extension"
      ? `${styles.entrySource} ${styles.entrySourceExtension}`
      : styles.entrySource;

  return (
    <div
      className={styles.entry}
      onClick={() => setExpanded(!expanded)}
      data-testid="change-entry"
    >
      <div className={styles.entryHeader}>
        <span className={styles.entryKey} title={change.key ?? undefined}>
          {change.key ?? "(all)"}
        </span>
        <span className={styles.entryOperation} data-testid="change-operation">
          {change.operation}
        </span>
        <span className={sourceClass} data-testid="change-source">
          {change.source}
        </span>
        <span className={styles.entryTimestamp} data-testid="change-timestamp">
          {formatTimestamp(change.timestamp)}
        </span>
      </div>
      {summary && (
        <div className={styles.changeSummary} data-testid="change-summary">
          {summary}
        </div>
      )}
      {expanded && change.operation !== "clear" && (
        <div className={styles.entryDetail}>
          <div className={styles.diffToolbar}>
            <button
              className={
                diffMode === "inline"
                  ? styles.diffModeActive
                  : styles.diffModeButton
              }
              onClick={(e) => {
                e.stopPropagation();
                setDiffMode("inline");
              }}
              data-testid="diff-mode-inline"
            >
              Inline
            </button>
            <button
              className={
                diffMode === "unified"
                  ? styles.diffModeActive
                  : styles.diffModeButton
              }
              onClick={(e) => {
                e.stopPropagation();
                setDiffMode("unified");
              }}
              data-testid="diff-mode-unified"
            >
              Unified
            </button>
          </div>
          {diffMode === "inline" ? (
            <InlineDiff oldValue={change.oldValue} newValue={change.newValue} />
          ) : (
            <UnifiedDiff
              oldValue={change.oldValue}
              newValue={change.newValue}
            />
          )}
        </div>
      )}
    </div>
  );
}

export function ChangeLog({ changes, recording, truncatedCount, onToggleRecording, onClear }: ChangeLogProps) {
  const displayedChanges = changes.slice(0, MAX_ENTRIES);

  return (
    <div className={styles.container} data-testid="change-log">
      <div className={styles.toolbar}>
        <button
          className={styles.recordButton}
          onClick={onToggleRecording}
          data-testid="record-toggle"
        >
          <span className={`${styles.recordDot} ${recording ? styles.recordDotActive : ""}`} />
          {recording ? "Recording" : "Paused"}
        </button>
        <span className={styles.changeCount} data-testid="change-count">
          {changes.length} change{changes.length !== 1 ? "s" : ""}
        </span>
        <button
          className={styles.clearButton}
          onClick={onClear}
          data-testid="clear-changes"
        >
          Clear
        </button>
      </div>
      <div className={styles.entries}>
        {truncatedCount > 0 && (
          <div className={styles.truncatedNotice}>
            {truncatedCount} earlier change{truncatedCount !== 1 ? "s" : ""} truncated
          </div>
        )}
        {displayedChanges.map((change, i) => (
          <ChangeEntry key={`${change.timestamp}-${i}`} change={change} />
        ))}
      </div>
    </div>
  );
}
