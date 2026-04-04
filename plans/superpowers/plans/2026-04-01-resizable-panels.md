# Resizable & Collapsible Panels — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add draggable resize handles between the keys list / value editor and between the content area / ChangeLog, plus a collapse toggle for the keys panel.

**Architecture:** A reusable `ResizeHandle` component handles mouse drag logic. App.tsx manages panel sizes as state and passes them as inline widths/heights. CSS transitions for collapse animation.

**Tech Stack:** TypeScript, React 19, CSS Modules

**Spec:** `docs/superpowers/specs/2026-04-01-resizable-panels-design.md`

---

### File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/sidepanel/components/ResizeHandle.tsx` | Create | Reusable drag handle with grip dots + optional collapse toggle |
| `src/sidepanel/components/ResizeHandle.module.css` | Create | Handle and collapse button styles |
| `src/sidepanel/components/App.tsx` | Modify | Add resize state, wire up handlers, apply dynamic sizing |
| `src/sidepanel/components/App.module.css` | Modify | Remove hardcoded KeyList width reference, add collapsed styles |
| `src/sidepanel/components/KeyList.module.css` | Modify | Remove hardcoded `width: 180px` (now controlled by parent) |
| `src/sidepanel/components/ChangeLog.module.css` | Modify | Remove `max-height: 40vh` (now controlled by parent) |
| `tests/e2e/extension.spec.ts` | Modify | Add E2E tests for resize and collapse |

---

### Task 1: GitHub Setup

- [ ] **Step 1: Create issue**

```bash
gh issue create \
  --title "feat: resizable and collapsible panels" \
  --label "feature" \
  --body "$(cat <<'EOF'
## Summary
Add draggable resize handles and a collapsible keys panel to the sidepanel UI.

## Spec
See docs/superpowers/specs/2026-04-01-resizable-panels-design.md
EOF
)"
```

- [ ] **Step 2: Add to project, create branch**

```bash
gh project item-add 3 --owner pete-the-pete --url <ISSUE_URL>
git checkout -b issue-<N>-resizable-panels main
```

---

### Task 2: ResizeHandle Component

**Files:**
- Create: `src/sidepanel/components/ResizeHandle.tsx`
- Create: `src/sidepanel/components/ResizeHandle.module.css`

- [ ] **Step 1: Create ResizeHandle.module.css**

```css
.handle {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f0f0f0;
  border: none;
  position: relative;
  flex-shrink: 0;
  user-select: none;
}

.handle:hover {
  background: #e0e0e0;
}

.horizontal {
  width: 6px;
  cursor: col-resize;
  flex-direction: column;
}

.vertical {
  height: 6px;
  cursor: row-resize;
  flex-direction: row;
}

.grip {
  color: #999;
  font-size: 10px;
  pointer-events: none;
  line-height: 1;
}

.handle:hover .grip {
  color: #666;
}

.collapseButton {
  position: absolute;
  top: 4px;
  left: 50%;
  transform: translateX(-50%);
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1px solid #ccc;
  background: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 8px;
  color: #666;
  padding: 0;
  z-index: 1;
}

.collapseButton:hover {
  background: #f0f0f0;
  border-color: #999;
}

.collapsedHandle {
  width: 20px;
  cursor: pointer;
  background: #f8f8f8;
}

.collapsedHandle:hover {
  background: #e8e8e8;
}
```

- [ ] **Step 2: Create ResizeHandle.tsx**

```tsx
import { useCallback, useRef } from "react";
import styles from "./ResizeHandle.module.css";

interface ResizeHandleProps {
  direction: "horizontal" | "vertical";
  onResize: (delta: number) => void;
  onResizeEnd?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function ResizeHandle({
  direction,
  onResize,
  onResizeEnd,
  collapsed,
  onToggleCollapse,
}: ResizeHandleProps) {
  const startPos = useRef(0);
  const dragging = useRef(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (collapsed) return;
      e.preventDefault();
      dragging.current = true;
      startPos.current = direction === "horizontal" ? e.clientX : e.clientY;

      const cursorStyle = direction === "horizontal" ? "col-resize" : "row-resize";
      document.body.style.cursor = cursorStyle;
      document.body.style.userSelect = "none";

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!dragging.current) return;
        const currentPos =
          direction === "horizontal" ? moveEvent.clientX : moveEvent.clientY;
        const delta = currentPos - startPos.current;
        startPos.current = currentPos;
        onResize(delta);
      };

      const handleMouseUp = () => {
        dragging.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        onResizeEnd?.();
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [direction, onResize, onResizeEnd, collapsed],
  );

  if (collapsed) {
    return (
      <div
        className={`${styles.handle} ${styles.horizontal} ${styles.collapsedHandle}`}
        onClick={onToggleCollapse}
        data-testid="resize-handle-collapsed"
      >
        <span className={styles.grip}>&#9654;</span>
      </div>
    );
  }

  return (
    <div
      className={`${styles.handle} ${styles[direction]}`}
      onMouseDown={handleMouseDown}
      data-testid={`resize-handle-${direction}`}
    >
      {onToggleCollapse && (
        <button
          className={styles.collapseButton}
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse();
          }}
          data-testid="collapse-toggle"
          title="Toggle keys panel"
        >
          &#9664;
        </button>
      )}
      <span className={styles.grip}>
        {direction === "horizontal" ? "\u22EE" : "\u22EF"}
      </span>
    </div>
  );
}
```

- [ ] **Step 3: Verify lint and build**

```bash
bun run lint && bun run build
```

- [ ] **Step 4: Commit**

```bash
git add src/sidepanel/components/ResizeHandle.tsx src/sidepanel/components/ResizeHandle.module.css
git commit -m "feat: add ResizeHandle component with drag and collapse support"
```

---

### Task 3: Wire Up Horizontal Resize (Keys Panel)

**Files:**
- Modify: `src/sidepanel/components/App.tsx`
- Modify: `src/sidepanel/components/App.module.css`
- Modify: `src/sidepanel/components/KeyList.module.css`

- [ ] **Step 1: Remove hardcoded width from KeyList.module.css**

In `src/sidepanel/components/KeyList.module.css`, change line 2:

From: `width: 180px;`
To: `min-width: 0;`

The width will now be controlled by the parent via inline style.

- [ ] **Step 2: Add collapsed key panel style to App.module.css**

Append to `src/sidepanel/components/App.module.css`:

```css
.keyListWrapper {
  overflow: hidden;
  flex-shrink: 0;
  transition: width 0.15s ease;
}

.keyListCollapsed {
  width: 0 !important;
  overflow: hidden;
}
```

- [ ] **Step 3: Add resize state and handlers to App.tsx**

In `src/sidepanel/components/App.tsx`, add the import:

```typescript
import { ResizeHandle } from "./ResizeHandle";
```

After the `recordingRef` declaration (line 28), add:

```typescript
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
```

- [ ] **Step 4: Update the body JSX to use resize handle**

In the `{loadState === "ready" && (...)}` block, wrap the `KeyList` in a div with dynamic width and add `ResizeHandle` between it and the value editor section. Replace the current structure:

```tsx
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
```

The rest of the JSX (ValueEditor, newKey section, noSelection) stays unchanged.

- [ ] **Step 5: Verify**

```bash
bun run lint && bun run test && bun run build
```

- [ ] **Step 6: Commit**

```bash
git add src/sidepanel/components/App.tsx src/sidepanel/components/App.module.css src/sidepanel/components/KeyList.module.css
git commit -m "feat: add horizontal resize handle for keys panel with collapse"
```

---

### Task 4: Wire Up Vertical Resize (ChangeLog)

**Files:**
- Modify: `src/sidepanel/components/App.tsx`
- Modify: `src/sidepanel/components/ChangeLog.module.css`

- [ ] **Step 1: Remove max-height from ChangeLog.module.css**

In `src/sidepanel/components/ChangeLog.module.css`, change the `.container` class:

From:
```css
.container {
  border-top: 1px solid #e0e0e0;
  display: flex;
  flex-direction: column;
  max-height: 40vh;
  overflow: hidden;
}
```

To:
```css
.container {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
```

Remove `border-top` (the ResizeHandle provides the visual separator) and `max-height` (now controlled by parent).

- [ ] **Step 2: Add ChangeLog resize state and handler to App.tsx**

After the `handleKeysCollapseToggle` callback, add:

```typescript
  const [changeLogHeight, setChangeLogHeight] = useState(200);

  const handleChangeLogResize = useCallback((delta: number) => {
    setChangeLogHeight((prev) =>
      Math.min(window.innerHeight * 0.6, Math.max(60, prev - delta)),
    );
  }, []);
```

Note: `prev - delta` because dragging up (negative delta) should increase height.

- [ ] **Step 3: Add vertical ResizeHandle and height control in JSX**

In the return JSX of App.tsx, between the `ImportExport` and `ChangeLog`, add the vertical resize handle, and wrap ChangeLog with a height-controlled div:

```tsx
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
```

Add `overflow: auto` to the ChangeLog container wrapper or ensure it's handled by the existing CSS.

- [ ] **Step 4: Verify**

```bash
bun run lint && bun run test && bun run build
```

- [ ] **Step 5: Commit**

```bash
git add src/sidepanel/components/App.tsx src/sidepanel/components/ChangeLog.module.css
git commit -m "feat: add vertical resize handle for ChangeLog section"
```

---

### Task 5: E2E Tests

**Files:**
- Modify: `tests/e2e/extension.spec.ts`

- [ ] **Step 1: Add E2E tests for resize and collapse**

Add a new describe block at the end of the file:

```typescript
test.describe("Resizable Panels", () => {
  test("keys panel collapse toggle hides and shows the key list", async ({
    page,
    openSidePanel,
  }) => {
    const sidePanelPage = await openSidePanel(page);

    // Keys should be visible initially
    await expect(sidePanelPage.locator("text=basic-test")).toBeVisible();

    // Click collapse toggle
    await sidePanelPage.getByTestId("collapse-toggle").click();

    // Keys list should be hidden
    await expect(sidePanelPage.getByTestId("resize-handle-collapsed")).toBeVisible();

    // Click to expand
    await sidePanelPage.getByTestId("resize-handle-collapsed").click();

    // Keys should be visible again
    await expect(sidePanelPage.locator("text=basic-test")).toBeVisible();

    await sidePanelPage.close();
  });

  test("horizontal resize handle is visible", async ({ page, openSidePanel }) => {
    const sidePanelPage = await openSidePanel(page);

    await expect(sidePanelPage.getByTestId("resize-handle-horizontal")).toBeVisible();

    await sidePanelPage.close();
  });

  test("vertical resize handle is visible", async ({ page, openSidePanel }) => {
    const sidePanelPage = await openSidePanel(page);

    await expect(sidePanelPage.getByTestId("resize-handle-vertical")).toBeVisible();

    await sidePanelPage.close();
  });
});
```

- [ ] **Step 2: Run all E2E tests**

```bash
bun run test:e2e
```

Expected: All existing + 3 new tests pass

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/extension.spec.ts
git commit -m "test: add E2E tests for resizable panels and collapse toggle"
```

---

### Task 6: Preflight, Version Bump & PR

- [ ] **Step 1: Full preflight**

```bash
bun run lint && bun run test && bun run build && bun run test:e2e
```

- [ ] **Step 2: Bump version**

Update `package.json` version from `"1.3.1"` to `"1.4.0"`.
Update `manifest.json` version from `"1.3.1"` to `"1.4.0"`.

- [ ] **Step 3: Commit and push**

```bash
git add package.json manifest.json
git commit -m "chore: bump version to v1.4.0"
git push -u origin issue-<N>-resizable-panels
```

- [ ] **Step 4: Create PR**

```bash
gh pr create --title "feat: resizable and collapsible panels" --body "$(cat <<'EOF'
## Summary
- Horizontal resize handle between keys list and value editor (drag to resize 80-300px)
- Vertical resize handle between content and ChangeLog (drag to resize 60px-60vh)
- Keys panel collapse toggle (thin bar with expand arrow when collapsed)
- Reusable ResizeHandle component with grip dots

Closes #<N>

## Test plan
- [x] E2E tests for collapse toggle, resize handles visible
- [x] All existing tests pass
- [x] Lint, type-check, build pass

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: After merge — tag release**

```bash
git checkout main && git pull
git tag v1.4.0
git push origin v1.4.0
gh release create v1.4.0 --title "v1.4.0 — Resizable & Collapsible Panels" --notes "$(cat <<'EOF'
## What's New
- **Resizable keys panel** — drag the vertical grip handle to adjust width (80-300px)
- **Collapsible keys panel** — click the arrow button to collapse/expand
- **Resizable history section** — drag the horizontal grip handle to adjust height
EOF
)"
```
