import { useState, useRef, useCallback } from "react";
import { EditorView, keymap } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { basicSetup } from "@codemirror/basic-setup";
import { json } from "@codemirror/lang-json";
import { parseStorageValue } from "@/lib/parse";
import { validateJson } from "@/lib/validate";
import styles from "./ValueEditor.module.css";

interface ValueEditorProps {
  storageKey: string;
  value: string;
  onSave: (key: string, value: string) => void;
  onDelete: (key: string) => void;
  onCopy: (value: string) => void;
}

export function ValueEditor({ storageKey, value, onSave, onDelete, onCopy }: ValueEditorProps) {
  const parsed = parseStorageValue(value);
  const [jsonMode, setJsonMode] = useState(parsed.isJson);
  const [draft, setDraft] = useState(jsonMode ? parsed.formatted : value);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const viewRef = useRef<EditorView | null>(null);

  const initEditor = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return;
      if (viewRef.current) {
        viewRef.current.destroy();
      }

      const extensions = [
        basicSetup,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const newValue = update.state.doc.toString();
            setDraft(newValue);
            if (jsonMode) {
              const result = validateJson(newValue);
              setValidationError(result.valid ? null : result.error);
            } else {
              setValidationError(null);
            }
          }
        }),
        keymap.of([
          {
            key: "Mod-s",
            run: () => {
              handleSave();
              return true;
            },
          },
        ]),
      ];

      if (jsonMode) {
        extensions.push(json());
      }

      const state = EditorState.create({
        doc: draft,
        extensions,
      });

      viewRef.current = new EditorView({ state, parent: node });
    },
    [jsonMode],
  );

  const handleSave = () => {
    let valueToSave = draft;

    if (jsonMode) {
      const result = validateJson(draft);
      if (!result.valid) return;
      valueToSave = JSON.stringify(JSON.parse(draft));
    }

    onSave(storageKey, valueToSave);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 1500);
  };

  const handleToggleJson = () => {
    const newMode = !jsonMode;
    if (newMode) {
      const result = parseStorageValue(draft);
      if (result.isJson) {
        setDraft(result.formatted);
        setValidationError(null);
      } else {
        setValidationError("Value is not valid JSON");
      }
    } else {
      setValidationError(null);
    }
    setJsonMode(newMode);
  };

  const handleDelete = () => {
    if (confirmDelete) {
      onDelete(storageKey);
      setConfirmDelete(false);
    } else {
      setConfirmDelete(true);
    }
  };

  const canSave = !jsonMode || validationError === null;

  return (
    <div className={styles.editor}>
      <div className={styles.toolbar}>
        <span className={styles.keyName} title={storageKey}>
          {storageKey}
        </span>
        <label className={styles.toggleLabel}>
          <input type="checkbox" checked={jsonMode} onChange={handleToggleJson} />
          JSON
        </label>
        <button className={styles.toolbarButton} onClick={() => onCopy(draft)}>
          Copy
        </button>
        <button
          className={`${styles.toolbarButton} ${styles.saveButton}`}
          onClick={handleSave}
          disabled={!canSave}
        >
          Save
        </button>
        <button
          className={`${styles.toolbarButton} ${styles.deleteButton}`}
          onClick={handleDelete}
        >
          {confirmDelete ? "Confirm?" : "Delete"}
        </button>
      </div>
      <div className={styles.codemirror} ref={initEditor} />
      {validationError && <div className={styles.validationError}>{validationError}</div>}
      {showSuccess && <div className={styles.successFlash}>Saved</div>}
    </div>
  );
}
