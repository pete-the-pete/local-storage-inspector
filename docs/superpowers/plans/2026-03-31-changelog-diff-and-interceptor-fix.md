# Change Log Diff UX & Interceptor Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two sequential releases — v1.1.0 adds field-level diff highlighting to the change log; v1.2.0 fixes the interceptor being blocked by ad blockers/CSP.

**Architecture:** Pure diff functions in `src/lib/diff.ts` (field-level + line-level); ChangeLog component uses them for collapsed summary and expanded highlighting. Interceptor fix moves from `<script>` tag injection to manifest-declared MAIN world content script.

**Tech Stack:** TypeScript, React 19, Vitest, Playwright, CSS Modules

**Spec:** `docs/superpowers/specs/2026-03-31-changelog-diff-and-interceptor-fix-design.md`

---

## Release 1: Change Log Diff UX (v1.1.0)

### File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/diff.ts` | Create | `jsonDiff()`, `formatChangeSummary()`, `diffLines()` pure functions |
| `tests/unit/diff.test.ts` | Create | Unit tests for all diff functions |
| `src/sidepanel/components/ChangeLog.tsx` | Modify | Add collapsed summary, diff toggle, InlineDiff/UnifiedDiff renderers |
| `src/sidepanel/components/ChangeLog.module.css` | Modify | Diff highlight styles |
| `tests/e2e/extension.spec.ts` | Modify | E2E tests for diff display |

---

### Task 1: GitHub Setup for v1.1.0

- [ ] **Step 1: Create GitHub issue**

```bash
gh issue create \
  --title "feat: add change log diff highlighting" \
  --label "feature" \
  --body "$(cat <<'EOF'
## Summary
Add field-level diff highlighting to the storage change log:
- Collapsed view: show which fields changed (e.g. `~ age, + roles, - legacy`)
- Expanded view: toggle between inline and unified diff with color highlighting

## Spec
See `docs/superpowers/specs/2026-03-31-changelog-diff-and-interceptor-fix-design.md` — Release 1
EOF
)"
```

- [ ] **Step 2: Add issue to project board**

```bash
gh project item-add 3 --owner pete-the-pete --url <ISSUE_URL>
```

- [ ] **Step 3: Create feature branch**

```bash
git checkout -b issue-<N>-changelog-diff main
```

---

### Task 2: jsonDiff Pure Function (TDD)

**Files:**
- Create: `src/lib/diff.ts`
- Create: `tests/unit/diff.test.ts`

- [ ] **Step 1: Write failing tests for jsonDiff**

Create `tests/unit/diff.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { jsonDiff } from "@/lib/diff";
import type { FieldChange } from "@/lib/diff";

describe("jsonDiff", () => {
  it("returns empty array for identical JSON objects", () => {
    const json = JSON.stringify({ name: "Alice", age: 30 });
    expect(jsonDiff(json, json)).toEqual([]);
  });

  it("returns empty array for identical strings", () => {
    expect(jsonDiff("hello", "hello")).toEqual([]);
  });

  it("returns added when oldValue is null", () => {
    expect(jsonDiff(null, "value")).toEqual([{ path: "", type: "added" }]);
  });

  it("returns removed when newValue is null", () => {
    expect(jsonDiff("value", null)).toEqual([{ path: "", type: "removed" }]);
  });

  it("returns empty array when both are null", () => {
    expect(jsonDiff(null, null)).toEqual([]);
  });

  it("detects top-level field added", () => {
    const oldVal = JSON.stringify({ name: "Alice" });
    const newVal = JSON.stringify({ name: "Alice", age: 30 });
    expect(jsonDiff(oldVal, newVal)).toEqual([{ path: "age", type: "added" }]);
  });

  it("detects top-level field removed", () => {
    const oldVal = JSON.stringify({ name: "Alice", age: 30 });
    const newVal = JSON.stringify({ name: "Alice" });
    expect(jsonDiff(oldVal, newVal)).toEqual([{ path: "age", type: "removed" }]);
  });

  it("detects top-level field modified", () => {
    const oldVal = JSON.stringify({ name: "Alice", age: 30 });
    const newVal = JSON.stringify({ name: "Alice", age: 31 });
    expect(jsonDiff(oldVal, newVal)).toEqual([{ path: "age", type: "modified" }]);
  });

  it("detects nested field changes with dot-notation paths", () => {
    const oldVal = JSON.stringify({ user: { settings: { theme: "light" } } });
    const newVal = JSON.stringify({ user: { settings: { theme: "dark" } } });
    expect(jsonDiff(oldVal, newVal)).toEqual([
      { path: "user.settings.theme", type: "modified" },
    ]);
  });

  it("detects multiple nested changes", () => {
    const oldVal = JSON.stringify({ user: { name: "Alice", age: 30 } });
    const newVal = JSON.stringify({ user: { name: "Bob", age: 30, role: "admin" } });
    const changes = jsonDiff(oldVal, newVal);
    expect(changes).toContainEqual({ path: "user.name", type: "modified" });
    expect(changes).toContainEqual({ path: "user.role", type: "added" });
    expect(changes).toHaveLength(2);
  });

  it("detects array element changes by index", () => {
    const oldVal = JSON.stringify({ items: ["a", "b", "c"] });
    const newVal = JSON.stringify({ items: ["a", "x", "c"] });
    expect(jsonDiff(oldVal, newVal)).toEqual([
      { path: "items.1", type: "modified" },
    ]);
  });

  it("detects array element added", () => {
    const oldVal = JSON.stringify({ items: ["a"] });
    const newVal = JSON.stringify({ items: ["a", "b"] });
    expect(jsonDiff(oldVal, newVal)).toEqual([
      { path: "items.1", type: "added" },
    ]);
  });

  it("detects array element removed", () => {
    const oldVal = JSON.stringify({ items: ["a", "b"] });
    const newVal = JSON.stringify({ items: ["a"] });
    expect(jsonDiff(oldVal, newVal)).toEqual([
      { path: "items.1", type: "removed" },
    ]);
  });

  it("returns single modified entry for non-JSON strings", () => {
    expect(jsonDiff("hello", "world")).toEqual([{ path: "", type: "modified" }]);
  });

  it("returns single modified entry when types differ (string vs JSON)", () => {
    expect(jsonDiff("plain", JSON.stringify({ a: 1 }))).toEqual([
      { path: "", type: "modified" },
    ]);
  });

  it("returns single modified entry for root-level arrays", () => {
    expect(jsonDiff("[1,2]", "[1,3]")).toEqual([{ path: "", type: "modified" }]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun run test -- tests/unit/diff.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/diff'`

- [ ] **Step 3: Implement jsonDiff**

Create `src/lib/diff.ts`:

```typescript
export interface FieldChange {
  path: string;
  type: "added" | "removed" | "modified";
}

export function jsonDiff(
  oldValue: string | null,
  newValue: string | null,
): FieldChange[] {
  if (oldValue === null && newValue !== null)
    return [{ path: "", type: "added" }];
  if (oldValue !== null && newValue === null)
    return [{ path: "", type: "removed" }];
  if (oldValue === null || newValue === null) return [];
  if (oldValue === newValue) return [];

  const oldParsed = tryParseObject(oldValue);
  const newParsed = tryParseObject(newValue);

  if (oldParsed !== null && newParsed !== null) {
    return compareValues(oldParsed, newParsed, "");
  }

  return [{ path: "", type: "modified" }];
}

function tryParseObject(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // not valid JSON
  }
  return null;
}

function compareValues(
  oldVal: unknown,
  newVal: unknown,
  prefix: string,
): FieldChange[] {
  if (isPlainObject(oldVal) && isPlainObject(newVal)) {
    return compareObjects(
      oldVal as Record<string, unknown>,
      newVal as Record<string, unknown>,
      prefix,
    );
  }

  if (Array.isArray(oldVal) && Array.isArray(newVal)) {
    return compareArrays(oldVal, newVal, prefix);
  }

  if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
    return [{ path: prefix, type: "modified" }];
  }

  return [];
}

function compareObjects(
  oldObj: Record<string, unknown>,
  newObj: Record<string, unknown>,
  prefix: string,
): FieldChange[] {
  const changes: FieldChange[] = [];
  const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

  for (const key of allKeys) {
    const path = prefix ? `${prefix}.${key}` : key;
    const hasOld = key in oldObj;
    const hasNew = key in newObj;

    if (!hasOld) {
      changes.push({ path, type: "added" });
    } else if (!hasNew) {
      changes.push({ path, type: "removed" });
    } else {
      changes.push(...compareValues(oldObj[key], newObj[key], path));
    }
  }

  return changes;
}

function compareArrays(
  oldArr: unknown[],
  newArr: unknown[],
  prefix: string,
): FieldChange[] {
  const changes: FieldChange[] = [];
  const maxLen = Math.max(oldArr.length, newArr.length);

  for (let i = 0; i < maxLen; i++) {
    const path = prefix ? `${prefix}.${i}` : `${i}`;
    if (i >= oldArr.length) {
      changes.push({ path, type: "added" });
    } else if (i >= newArr.length) {
      changes.push({ path, type: "removed" });
    } else {
      changes.push(...compareValues(oldArr[i], newArr[i], path));
    }
  }

  return changes;
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun run test -- tests/unit/diff.test.ts
```

Expected: All 16 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/diff.ts tests/unit/diff.test.ts
git commit -m "feat: add jsonDiff pure function with unit tests"
```

---

### Task 3: formatChangeSummary + diffLines (TDD)

**Files:**
- Modify: `src/lib/diff.ts`
- Modify: `tests/unit/diff.test.ts`

- [ ] **Step 1: Write failing tests for formatChangeSummary and diffLines**

Append to `tests/unit/diff.test.ts`:

```typescript
import { jsonDiff, formatChangeSummary, diffLines } from "@/lib/diff";
import type { FieldChange, DiffLine } from "@/lib/diff";

describe("formatChangeSummary", () => {
  it("returns empty string for no changes", () => {
    expect(formatChangeSummary([])).toBe("");
  });

  it("returns '(new)' for root-level add", () => {
    expect(formatChangeSummary([{ path: "", type: "added" }])).toBe("(new)");
  });

  it("returns '(deleted)' for root-level remove", () => {
    expect(formatChangeSummary([{ path: "", type: "removed" }])).toBe("(deleted)");
  });

  it("returns 'value changed' for root-level modify", () => {
    expect(formatChangeSummary([{ path: "", type: "modified" }])).toBe("value changed");
  });

  it("formats field changes with prefixes", () => {
    const changes: FieldChange[] = [
      { path: "age", type: "modified" },
      { path: "roles", type: "added" },
      { path: "legacy", type: "removed" },
    ];
    expect(formatChangeSummary(changes)).toBe("~ age, + roles, - legacy");
  });

  it("truncates to 3 changes with +N more", () => {
    const changes: FieldChange[] = [
      { path: "a", type: "modified" },
      { path: "b", type: "added" },
      { path: "c", type: "removed" },
      { path: "d", type: "modified" },
      { path: "e", type: "added" },
    ];
    expect(formatChangeSummary(changes)).toBe("~ a, + b, - c, +2 more");
  });
});

describe("diffLines", () => {
  it("returns all unchanged for identical text", () => {
    const result = diffLines("line1\nline2", "line1\nline2");
    expect(result).toEqual([
      { text: "line1", type: "unchanged" },
      { text: "line2", type: "unchanged" },
    ]);
  });

  it("detects added lines", () => {
    const result = diffLines("a", "a\nb");
    expect(result).toEqual([
      { text: "a", type: "unchanged" },
      { text: "b", type: "added" },
    ]);
  });

  it("detects removed lines", () => {
    const result = diffLines("a\nb", "a");
    expect(result).toEqual([
      { text: "a", type: "unchanged" },
      { text: "b", type: "removed" },
    ]);
  });

  it("detects modified lines as remove + add", () => {
    const result = diffLines("old-line", "new-line");
    expect(result).toEqual([
      { text: "old-line", type: "removed" },
      { text: "new-line", type: "added" },
    ]);
  });

  it("handles multi-line JSON diff", () => {
    const oldText = '{\n  "name": "Alice",\n  "age": 30\n}';
    const newText = '{\n  "name": "Alice",\n  "age": 31\n}';
    const result = diffLines(oldText, newText);

    const removed = result.filter((l) => l.type === "removed");
    const added = result.filter((l) => l.type === "added");
    expect(removed).toHaveLength(1);
    expect(removed[0].text).toContain("30");
    expect(added).toHaveLength(1);
    expect(added[0].text).toContain("31");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun run test -- tests/unit/diff.test.ts
```

Expected: FAIL — `formatChangeSummary` and `diffLines` not exported

- [ ] **Step 3: Implement formatChangeSummary and diffLines**

Add to `src/lib/diff.ts`:

```typescript
export interface DiffLine {
  text: string;
  type: "added" | "removed" | "unchanged";
}

const MAX_SUMMARY_ITEMS = 3;

const SUMMARY_PREFIX: Record<FieldChange["type"], string> = {
  added: "+",
  removed: "-",
  modified: "~",
};

export function formatChangeSummary(changes: FieldChange[]): string {
  if (changes.length === 0) return "";

  if (changes.length === 1 && changes[0].path === "") {
    switch (changes[0].type) {
      case "added":
        return "(new)";
      case "removed":
        return "(deleted)";
      case "modified":
        return "value changed";
    }
  }

  const shown = changes.slice(0, MAX_SUMMARY_ITEMS);
  const parts = shown.map((c) => `${SUMMARY_PREFIX[c.type]} ${c.path}`);
  const remaining = changes.length - MAX_SUMMARY_ITEMS;
  if (remaining > 0) {
    parts.push(`+${remaining} more`);
  }
  return parts.join(", ");
}

export function diffLines(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");

  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const result: DiffLine[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({ text: oldLines[i - 1], type: "unchanged" });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ text: newLines[j - 1], type: "added" });
      j--;
    } else {
      result.unshift({ text: oldLines[i - 1], type: "removed" });
      i--;
    }
  }

  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun run test -- tests/unit/diff.test.ts
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/diff.ts tests/unit/diff.test.ts
git commit -m "feat: add formatChangeSummary and diffLines functions"
```

---

### Task 4: ChangeLog Collapsed Summary

**Files:**
- Modify: `src/sidepanel/components/ChangeLog.tsx`
- Modify: `src/sidepanel/components/ChangeLog.module.css`

- [ ] **Step 1: Add CSS for the change summary line**

Add to end of `src/sidepanel/components/ChangeLog.module.css`:

```css
.changeSummary {
  font-size: 11px;
  color: #888;
  margin-top: 2px;
  font-family: monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

- [ ] **Step 2: Add summary line to ChangeEntry component**

In `src/sidepanel/components/ChangeLog.tsx`, add the import at the top:

```typescript
import { jsonDiff, formatChangeSummary } from "@/lib/diff";
```

Replace the `ChangeEntry` function (lines 33-69) with:

```typescript
function ChangeEntry({ change }: { change: StorageChangeEvent }) {
  const [expanded, setExpanded] = useState(false);

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
          {change.oldValue !== null && (
            <>
              <div className={styles.detailLabel}>Old</div>
              <div>{formatValue(change.oldValue)}</div>
            </>
          )}
          <div className={styles.detailLabel}>New</div>
          <div>{formatValue(change.newValue)}</div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify lint and existing tests pass**

```bash
bun run lint && bun run test && bun run build
```

Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add src/sidepanel/components/ChangeLog.tsx src/sidepanel/components/ChangeLog.module.css
git commit -m "feat: add collapsed change summary to ChangeLog entries"
```

---

### Task 5: ChangeLog Expanded Diff with Inline/Unified Toggle

**Files:**
- Modify: `src/sidepanel/components/ChangeLog.tsx`
- Modify: `src/sidepanel/components/ChangeLog.module.css`

- [ ] **Step 1: Add diff highlight CSS styles**

Add to end of `src/sidepanel/components/ChangeLog.module.css`:

```css
.diffToolbar {
  display: flex;
  gap: 4px;
  margin-bottom: 6px;
}

.diffModeButton,
.diffModeActive {
  padding: 1px 6px;
  border: 1px solid #ccc;
  border-radius: 3px;
  background: #fff;
  cursor: pointer;
  font-size: 10px;
}

.diffModeActive {
  background: #e0e0e0;
  font-weight: 600;
}

.diffBlock {
  font-family: monospace;
  font-size: 11px;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
}

.diffRemoved {
  background: #fce4ec;
}

.diffAdded {
  background: #e3f2fd;
}

.diffModified {
  background: #fff8e1;
}
```

- [ ] **Step 2: Add diffLines import and replace expanded view rendering**

In `src/sidepanel/components/ChangeLog.tsx`, update the import:

```typescript
import { jsonDiff, formatChangeSummary, diffLines } from "@/lib/diff";
```

Add these two helper components before `ChangeEntry`:

```typescript
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
```

- [ ] **Step 3: Update ChangeEntry to use diff toggle**

Replace the expanded section in `ChangeEntry` (the `{expanded && change.operation !== "clear" && (...)}` block) with:

```typescript
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
```

- [ ] **Step 4: Verify lint and existing tests pass**

```bash
bun run lint && bun run test && bun run build
```

Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add src/sidepanel/components/ChangeLog.tsx src/sidepanel/components/ChangeLog.module.css
git commit -m "feat: add inline/unified diff toggle to expanded ChangeLog entries"
```

---

### Task 6: E2E Tests for Diff Display

**Files:**
- Modify: `tests/e2e/extension.spec.ts`

- [ ] **Step 1: Add E2E tests for diff features**

Add a new describe block after the existing "Change Monitoring" block at the end of `tests/e2e/extension.spec.ts`:

```typescript
test.describe("Change Log Diff", () => {
  test("shows field-level summary for JSON changes in collapsed view", async ({
    page,
    openSidePanel,
  }) => {
    const sidePanelPage = await openSidePanel(page);

    // Set initial JSON value
    await page.evaluate(() => {
      localStorage.setItem("diff-test", JSON.stringify({ name: "Alice", age: 30 }));
    });
    await expect(sidePanelPage.getByTestId("change-entry").first()).toBeVisible({ timeout: 3000 });

    // Update with field change
    await page.evaluate(() => {
      localStorage.setItem(
        "diff-test",
        JSON.stringify({ name: "Alice", age: 31, role: "admin" }),
      );
    });
    await expect(sidePanelPage.getByTestId("change-count")).toContainText("2 changes", { timeout: 3000 });

    // Most recent entry should have a change summary
    const summary = sidePanelPage.getByTestId("change-summary").first();
    await expect(summary).toBeVisible();
    await expect(summary).toContainText("~");

    await sidePanelPage.close();
  });

  test("shows '(new)' summary for new keys", async ({ page, openSidePanel }) => {
    const sidePanelPage = await openSidePanel(page);

    await page.evaluate(() => {
      localStorage.setItem("brand-new-key", "some-value");
    });

    const summary = sidePanelPage.getByTestId("change-summary").first();
    await expect(summary).toBeVisible({ timeout: 3000 });
    await expect(summary).toContainText("(new)");

    await sidePanelPage.close();
  });

  test("shows 'value changed' summary for plain string changes", async ({
    page,
    openSidePanel,
  }) => {
    const sidePanelPage = await openSidePanel(page);

    await page.evaluate(() => {
      localStorage.setItem("str-test", "first");
    });
    await expect(sidePanelPage.getByTestId("change-entry").first()).toBeVisible({ timeout: 3000 });

    await page.evaluate(() => {
      localStorage.setItem("str-test", "second");
    });
    await expect(sidePanelPage.getByTestId("change-count")).toContainText("2 changes", { timeout: 3000 });

    const summary = sidePanelPage.getByTestId("change-summary").first();
    await expect(summary).toContainText("value changed");

    await sidePanelPage.close();
  });

  test("expanded inline diff highlights changed lines", async ({
    page,
    openSidePanel,
  }) => {
    const sidePanelPage = await openSidePanel(page);

    await page.evaluate(() => {
      localStorage.setItem("inline-test", JSON.stringify({ name: "Alice", age: 30 }));
    });
    await expect(sidePanelPage.getByTestId("change-entry").first()).toBeVisible({ timeout: 3000 });

    await page.evaluate(() => {
      localStorage.setItem("inline-test", JSON.stringify({ name: "Alice", age: 31 }));
    });
    await expect(sidePanelPage.getByTestId("change-count")).toContainText("2 changes", { timeout: 3000 });

    // Expand the most recent entry
    await sidePanelPage.getByTestId("change-entry").first().click();

    // Should show inline diff by default with diff mode buttons
    await expect(sidePanelPage.getByTestId("diff-mode-inline")).toBeVisible();
    await expect(sidePanelPage.getByTestId("diff-mode-unified")).toBeVisible();

    await sidePanelPage.close();
  });

  test("toggle to unified diff shows +/- prefixed lines", async ({
    page,
    openSidePanel,
  }) => {
    const sidePanelPage = await openSidePanel(page);

    await page.evaluate(() => {
      localStorage.setItem("unified-test", "old-value");
    });
    await expect(sidePanelPage.getByTestId("change-entry").first()).toBeVisible({ timeout: 3000 });

    await page.evaluate(() => {
      localStorage.setItem("unified-test", "new-value");
    });
    await expect(sidePanelPage.getByTestId("change-count")).toContainText("2 changes", { timeout: 3000 });

    // Expand and switch to unified
    await sidePanelPage.getByTestId("change-entry").first().click();
    await sidePanelPage.getByTestId("diff-mode-unified").click();

    // Unified view should show - and + prefixed lines
    await expect(sidePanelPage.locator("text=- old-value")).toBeVisible();
    await expect(sidePanelPage.locator("text=+ new-value")).toBeVisible();

    await sidePanelPage.close();
  });
});
```

- [ ] **Step 2: Run E2E tests**

```bash
bun run test:e2e
```

Expected: All existing + new tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/extension.spec.ts
git commit -m "test: add E2E tests for change log diff display"
```

---

### Task 7: Preflight Checks, Version Bump & PR for v1.1.0

- [ ] **Step 1: Run full preflight checks**

```bash
bun run lint && bun run test && bun run build && bun run test:e2e
```

Expected: All pass

- [ ] **Step 2: Bump version to 1.1.0**

Update version in `package.json` (line 3) from `"1.0.0"` to `"1.1.0"`.
Update version in `manifest.json` (line 4) from `"1.0.0"` to `"1.1.0"`.

- [ ] **Step 3: Commit version bump**

```bash
git add package.json manifest.json
git commit -m "chore: bump version to v1.1.0"
```

- [ ] **Step 4: Push branch and create PR**

```bash
git push -u origin issue-<N>-changelog-diff
```

```bash
gh pr create --title "feat: add change log diff highlighting" --body "$(cat <<'EOF'
## Summary
- Add field-level JSON diff to collapsed change log entries (`~ age, + roles, - legacy`)
- Add inline/unified diff toggle in expanded view with color highlighting
- Pure diff functions in `src/lib/diff.ts` with full unit test coverage

Closes #<N>

## Test plan
- [x] Unit tests for `jsonDiff`, `formatChangeSummary`, `diffLines`
- [x] E2E tests for collapsed summary, inline diff, unified diff toggle
- [x] Lint, type-check, build all pass

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: After PR merges — tag release**

```bash
git checkout main && git pull
git tag v1.1.0
git push origin v1.1.0
gh release create v1.1.0 --title "v1.1.0 — Change Log Diff" --notes "$(cat <<'EOF'
## What's New
- **Field-level diff summary** in collapsed change log entries
- **Inline/Unified diff toggle** in expanded view with color highlighting
- Pure diff functions with full recursive JSON comparison
EOF
)"
```

---

## Release 2: Fix Interceptor Blocked by Ad Blockers (v1.2.0)

### File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `manifest.json` | Modify | Add interceptor as MAIN world content script; remove from web_accessible_resources |
| `src/content/monitor.ts` | Modify | Remove injection/removal logic, remove message handlers |
| `src/sidepanel/components/App.tsx` | Modify | Remove sendRecordingMessage; add `world: "MAIN"` + flag to write/delete/import |
| `src/shared/types.ts` | Modify | Remove unused monitor message types |
| `public/storage-interceptor.js` | Modify | Remove SET_EXTENSION_FLAG listener |
| `tests/unit/types-monitoring.test.ts` | Modify | Remove tests for deleted types |
| `tests/e2e/extension.spec.ts` | Modify | Update recording toggle test; add extension-source tests |

---

### Task 8: GitHub Setup for v1.2.0

- [ ] **Step 1: Create GitHub issue**

```bash
gh issue create \
  --title "fix: interceptor blocked by ad blockers and CSP" \
  --label "bug" \
  --body "$(cat <<'EOF'
## Problem
The storage interceptor is injected via a `<script src="chrome-extension://...">` tag. Ad blockers and strict CSP pages block this load, silently preventing all change monitoring.

## Fix
Declare `storage-interceptor.js` as a manifest MAIN world content script. Also fix extension-initiated changes not appearing in the log.

## Spec
See `docs/superpowers/specs/2026-03-31-changelog-diff-and-interceptor-fix-design.md` — Release 2
EOF
)"
```

- [ ] **Step 2: Add issue to project board**

```bash
gh project item-add 3 --owner pete-the-pete --url <ISSUE_URL>
```

- [ ] **Step 3: Create feature branch from latest main**

```bash
git checkout main && git pull
git checkout -b issue-<N>-interceptor-csp-fix
```

---

### Task 9: Move Interceptor to Manifest Content Script

**Files:**
- Modify: `manifest.json`
- Modify: `src/content/monitor.ts`
- Modify: `public/storage-interceptor.js`

- [ ] **Step 1: Update manifest.json**

Replace the `content_scripts` array (lines 24-29) with:

```json
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["src/content/monitor.ts"],
      "run_at": "document_idle"
    },
    {
      "matches": ["<all_urls>"],
      "js": ["public/storage-interceptor.js"],
      "run_at": "document_start",
      "world": "MAIN"
    }
  ],
```

Remove `storage-interceptor.js` from `web_accessible_resources` (lines 31-36). Replace with:

```json
  "web_accessible_resources": [],
```

- [ ] **Step 2: Simplify monitor.ts**

Replace the entire content of `src/content/monitor.ts` with:

```typescript
// ISOLATED world content script — relays change events from the MAIN world
// interceptor to the sidepanel via chrome.runtime.sendMessage.
// The interceptor is now declared in manifest.json (world: "MAIN"),
// so no dynamic injection is needed.

import type { StorageChangeEvent, StorageChangePortMessage } from "@/shared/types";

const BATCH_INTERVAL_MS = 50;

let batchBuffer: StorageChangeEvent[] = [];
let batchTimer: ReturnType<typeof setTimeout> | null = null;

function flushBatch(): void {
  if (batchBuffer.length === 0) return;

  const message: StorageChangePortMessage = {
    type: "STORAGE_CHANGE",
    changes: batchBuffer,
  };
  batchBuffer = [];
  batchTimer = null;

  chrome.runtime.sendMessage(message).catch(() => {
    // Sidepanel may not be open
  });
}

function queueChange(event: StorageChangeEvent): void {
  batchBuffer.push(event);
  if (!batchTimer) {
    batchTimer = setTimeout(flushBatch, BATCH_INTERVAL_MS);
  }
}

// Listen for change events from the MAIN world interceptor
window.addEventListener("message", (event) => {
  if (event.data?._lsi !== "interceptor") return;
  if (event.data.type === "EXTENSION_FLAG_SET") return;

  const change: StorageChangeEvent = {
    storageType: event.data.storageType,
    operation: event.data.operation,
    key: event.data.key,
    oldValue: event.data.oldValue,
    newValue: event.data.newValue,
    timestamp: event.data.timestamp,
    source: event.data.source,
  };

  queueChange(change);
});
```

- [ ] **Step 3: Remove SET_EXTENSION_FLAG listener from interceptor**

In `public/storage-interceptor.js`, remove lines 96-102 (the `window.addEventListener("message", ...)` block at the end of the IIFE):

```javascript
  // Listen for extension flag setting from monitor (via postMessage from ISOLATED world)
  window.addEventListener("message", function (event) {
    if (event.data && event.data._lsi === "monitor" && event.data.type === "SET_EXTENSION_FLAG") {
      window[EXTENSION_FLAG] = true;
      window.postMessage({ _lsi: "interceptor", type: "EXTENSION_FLAG_SET" }, "*");
    }
  });
```

- [ ] **Step 4: Verify build succeeds**

```bash
bun run build
```

Expected: Build succeeds. Check `dist/manifest.json` has the new content script entry.

- [ ] **Step 5: Commit**

```bash
git add manifest.json src/content/monitor.ts public/storage-interceptor.js
git commit -m "fix: declare interceptor as MAIN world content script to bypass ad blockers"
```

---

### Task 10: Simplify App.tsx + Fix Extension-Initiated Changes

**Files:**
- Modify: `src/sidepanel/components/App.tsx`

- [ ] **Step 1: Remove sendRecordingMessage and its effects**

In `src/sidepanel/components/App.tsx`:

Remove `sendRecordingMessage` callback (lines 79-87):

```typescript
  // Start/stop recording by messaging the content script
  const sendRecordingMessage = useCallback(async (start: boolean) => {
    const tabId = await getActiveTabId();
    if (!tabId) return;
    try {
      await chrome.tabs.sendMessage(tabId, { type: start ? "START_RECORDING" : "STOP_RECORDING" });
    } catch {
      // Content script may not be ready yet
    }
  }, []);
```

Remove the initial recording effect (lines 101-104):

```typescript
  // Start recording on initial load
  useEffect(() => {
    sendRecordingMessage(true);
  }, [sendRecordingMessage]);
```

Replace `handleToggleRecording` (lines 106-111) with:

```typescript
  const handleToggleRecording = useCallback(() => {
    const newRecording = !recordingRef.current;
    recordingRef.current = newRecording;
    setRecording(newRecording);
  }, []);
```

- [ ] **Step 2: Add world: "MAIN" and extension flag to write/delete/import functions**

Replace `writeStorage` (lines 32-35):

```typescript
function writeStorage(storageType: string, key: string, value: string): void {
  const storage = storageType === "localStorage" ? localStorage : sessionStorage;
  (window as Record<symbol, unknown>)[Symbol.for("lsi-extension-flag")] = true;
  storage.setItem(key, value);
}
```

Replace `removeFromStorage` (lines 37-40):

```typescript
function removeFromStorage(storageType: string, key: string): void {
  const storage = storageType === "localStorage" ? localStorage : sessionStorage;
  (window as Record<symbol, unknown>)[Symbol.for("lsi-extension-flag")] = true;
  storage.removeItem(key);
}
```

Replace `importToStorage` (lines 42-48):

```typescript
function importToStorage(storageType: string, entries: Record<string, string>, clearFirst: boolean): void {
  const storage = storageType === "localStorage" ? localStorage : sessionStorage;
  const FLAG = Symbol.for("lsi-extension-flag");
  if (clearFirst) {
    (window as Record<symbol, unknown>)[FLAG] = true;
    storage.clear();
  }
  for (const [key, value] of Object.entries(entries)) {
    (window as Record<symbol, unknown>)[FLAG] = true;
    storage.setItem(key, value);
  }
}
```

- [ ] **Step 3: Add world: "MAIN" to executeScript calls**

In `handleSave` (around line 156), change the `executeScript` call:

```typescript
      await chrome.scripting.executeScript({
        target: { tabId },
        world: "MAIN",
        func: writeStorage,
        args: [storageType, key, value],
      });
```

In `handleDelete` (around line 171), change the `executeScript` call:

```typescript
      await chrome.scripting.executeScript({
        target: { tabId },
        world: "MAIN",
        func: removeFromStorage,
        args: [storageType, key],
      });
```

In `handleImport` (around line 191), change the `executeScript` call:

```typescript
      await chrome.scripting.executeScript({
        target: { tabId },
        world: "MAIN",
        func: importToStorage,
        args: [storageType, importEntries, clearFirst],
      });
```

- [ ] **Step 4: Remove unused useEffect import if no longer needed**

Check if `useEffect` is still imported. After removing the recording effects, the only remaining `useEffect` is the `onMessage` listener (line 90). Keep the import if so.

- [ ] **Step 5: Verify lint and build pass**

```bash
bun run lint && bun run build
```

Expected: Pass

- [ ] **Step 6: Commit**

```bash
git add src/sidepanel/components/App.tsx
git commit -m "fix: run extension storage ops in MAIN world with extension flag"
```

---

### Task 11: Clean Up Types and Tests

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `tests/unit/types-monitoring.test.ts`

- [ ] **Step 1: Remove unused monitor message types from types.ts**

In `src/shared/types.ts`, remove lines 73-96:

```typescript
export interface StartRecordingMessage {
  type: "START_RECORDING";
}

export interface StopRecordingMessage {
  type: "STOP_RECORDING";
}

export interface SetExtensionFlagMessage {
  type: "SET_EXTENSION_FLAG";
}

export interface SetExtensionFlagResponse {
  type: "SET_EXTENSION_FLAG_RESPONSE";
  success: boolean;
}
```

And remove the type aliases at lines 95-96:

```typescript
export type MonitorMessage = StartRecordingMessage | StopRecordingMessage | SetExtensionFlagMessage;
export type MonitorResponse = SetExtensionFlagResponse;
```

- [ ] **Step 2: Update types-monitoring.test.ts**

Remove the `MonitorMessage` import and the entire `"MonitorMessage types"` describe block (lines 93-108) from `tests/unit/types-monitoring.test.ts`. Also remove `MonitorMessage` from the import statement.

- [ ] **Step 3: Verify tests pass**

```bash
bun run lint && bun run test
```

Expected: Pass

- [ ] **Step 4: Commit**

```bash
git add src/shared/types.ts tests/unit/types-monitoring.test.ts
git commit -m "chore: remove unused monitor message types"
```

---

### Task 12: E2E Tests for Interceptor Fix

**Files:**
- Modify: `tests/e2e/extension.spec.ts`

- [ ] **Step 1: Update recording toggle test**

The existing "recording toggle stops and resumes capture" test (line 322) sends START/STOP messages via content script. Since recording is now sidepanel-only, the test should still pass — pausing still prevents entries from appearing (sidepanel filters). Verify:

```bash
bun run test:e2e -- --grep "recording toggle"
```

Expected: PASS

- [ ] **Step 2: Add E2E tests for extension-source changes**

Add to the "Change Monitoring" describe block in `tests/e2e/extension.spec.ts`, before the closing `});`:

```typescript
  test("captures extension-initiated save with source extension", async ({
    page,
    openSidePanel,
  }) => {
    const sidePanelPage = await openSidePanel(page);

    // Click a key to select it
    await sidePanelPage.locator("text=basic-test").click();

    // Edit the value in the CodeMirror editor
    const editor = sidePanelPage.locator(".cm-content");
    await editor.click();
    await sidePanelPage.keyboard.press("Meta+a");
    await sidePanelPage.keyboard.type("updated-value");

    // Save
    await sidePanelPage.locator("button", { hasText: "Save" }).click();

    // A change entry should appear with source "extension"
    const entry = sidePanelPage.getByTestId("change-entry").first();
    await expect(entry).toBeVisible({ timeout: 3000 });
    await expect(entry.getByTestId("change-source")).toContainText("extension");

    await sidePanelPage.close();
  });

  test("captures extension-initiated delete with source extension", async ({
    page,
    openSidePanel,
  }) => {
    const sidePanelPage = await openSidePanel(page);

    // Click a key to select it
    await sidePanelPage.locator("text=basic-test").click();

    // Delete it
    await sidePanelPage.locator("button", { hasText: "Delete" }).click();

    // A change entry should appear with source "extension"
    const entry = sidePanelPage.getByTestId("change-entry").first();
    await expect(entry).toBeVisible({ timeout: 3000 });
    await expect(entry.getByTestId("change-operation")).toContainText("removeItem");
    await expect(entry.getByTestId("change-source")).toContainText("extension");

    await sidePanelPage.close();
  });
```

- [ ] **Step 3: Run all E2E tests**

```bash
bun run test:e2e
```

Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/extension.spec.ts
git commit -m "test: add E2E tests for extension-source change attribution"
```

---

### Task 13: Preflight Checks, Version Bump & PR for v1.2.0

- [ ] **Step 1: Run full preflight checks**

```bash
bun run lint && bun run test && bun run build && bun run test:e2e
```

Expected: All pass

- [ ] **Step 2: Bump version to 1.2.0**

Update version in `package.json` from `"1.1.0"` to `"1.2.0"`.
Update version in `manifest.json` from `"1.1.0"` to `"1.2.0"`.

- [ ] **Step 3: Commit version bump**

```bash
git add package.json manifest.json
git commit -m "chore: bump version to v1.2.0"
```

- [ ] **Step 4: Push branch and create PR**

```bash
git push -u origin issue-<N>-interceptor-csp-fix
```

```bash
gh pr create --title "fix: interceptor blocked by ad blockers and CSP" --body "$(cat <<'EOF'
## Summary
- Declare `storage-interceptor.js` as a manifest MAIN world content script (bypasses CSP + ad blockers)
- Simplify monitor.ts — remove dynamic injection/removal
- Fix extension-initiated changes: run in MAIN world with extension flag
- Clean up unused monitor message types

Closes #<N>

## Test plan
- [x] All existing E2E tests pass (page-originated changes)
- [x] New E2E tests for extension-source attribution
- [x] Recording toggle still works (sidepanel-side filtering)
- [x] Lint, type-check, build all pass

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: After PR merges — tag release**

```bash
git checkout main && git pull
git tag v1.2.0
git push origin v1.2.0
gh release create v1.2.0 --title "v1.2.0 — Fix Interceptor Blocked by Ad Blockers" --notes "$(cat <<'EOF'
## What's Fixed
- **Storage monitoring now works on all pages** — interceptor declared as manifest content script, bypassing ad blockers and CSP restrictions
- **Extension-initiated changes appear in the log** — save, delete, and import operations now show with "extension" source badge
- Simplified content script architecture (removed dynamic injection)
EOF
)"
```
