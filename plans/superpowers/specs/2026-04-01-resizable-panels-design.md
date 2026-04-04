# Resizable & Collapsible Panels

## Overview

Add resizable dividers and a collapsible keys panel to the sidepanel UI, giving users control over how much space each section gets.

## Layout Changes

The current layout is:
```
┌──────────────────────────────┐
│ Header (toggle + search)     │
├────────────┬─────────────────┤
│ Keys list  │ Value editor    │
│            │                 │
├────────────┴─────────────────┤
│ Import/Export                │
├──────────────────────────────┤
│ ChangeLog (history)          │
└──────────────────────────────┘
```

After this change:
```
┌──────────────────────────────┐
│ Header (toggle + search)     │
├────────────⋮─────────────────┤
│ Keys list  ⋮ Value editor    │
│            ⋮                 │
├────────────⋮─────────────────┤
│ Import/Export                │
├─────────────⋯───────────────┤
│ ChangeLog (history)          │
└──────────────────────────────┘
         ↕ drag vertically
    ↔ drag horizontally
```

## Horizontal Resize (Keys ↔ Value Editor)

A vertical divider between the keys list and value editor.

- **Handle**: 6px wide hit area. Shows vertical grip dots (`⋮`) centered vertically.
- **Behavior**: `mousedown` → track `mousemove` → update keys panel width → `mouseup` cleanup.
- **Constraints**: Min 80px, max 300px.
- **Default**: Current width (~180px from existing CSS).

### Keys Panel Collapse

- A small `◀`/`▶` toggle button positioned at the top of the vertical divider.
- **Collapsed state**: Keys panel shrinks to ~20px thin vertical bar showing only the `▶` expand icon. The value editor takes the full width.
- **Expand**: Click `▶` to restore to previous width (remembered in state).
- **Interaction**: Collapse button is always visible. Clicking it toggles collapsed/expanded. Dragging the resize handle while collapsed auto-expands.

## Vertical Resize (Content ↔ ChangeLog)

A horizontal divider between the Import/Export bar and the ChangeLog section.

- **Handle**: 6px tall hit area. Shows horizontal grip dots (`⋯`) centered horizontally.
- **Behavior**: `mousedown` → track `mousemove` → update ChangeLog height → `mouseup` cleanup.
- **Constraints**: Min 60px, max 60vh.
- **Default**: Current height (content-sized, roughly toolbar + a few entries).

## ResizeHandle Component

Reusable component for both dividers.

**Props:**
- `direction: "horizontal" | "vertical"` — which axis the handle resizes
- `onResize: (delta: number) => void` — called during drag with pixel delta
- `onResizeEnd?: () => void` — called on mouseup
- `collapsed?: boolean` — if true, show expand icon
- `onToggleCollapse?: () => void` — collapse/expand callback

**Rendering:**
- `horizontal` direction: renders a vertical bar (between left/right panels)
- `vertical` direction: renders a horizontal bar (between top/bottom sections)
- Grip dots centered in the handle
- Collapse toggle button only shown when `onToggleCollapse` is provided

**CSS:**
- Default: subtle `#e0e0e0` background
- Hover: `#ccc` background, grip dots become more visible
- Dragging: `cursor: col-resize` or `row-resize` applied to `document.body` during drag
- Collapse button: small circle/pill with `◀`/`▶` arrow

## State Management

All in App.tsx component state (not persisted):
- `keysPanelWidth: number` — default 180
- `keysPanelCollapsed: boolean` — default false
- `changeLogHeight: number` — default 200

## Files

| File | Action |
|------|--------|
| `src/sidepanel/components/ResizeHandle.tsx` | Create — reusable resize handle component |
| `src/sidepanel/components/ResizeHandle.module.css` | Create — handle styles |
| `src/sidepanel/components/App.tsx` | Modify — add resize state, pass widths/heights, wire up handlers |
| `src/sidepanel/components/App.module.css` | Modify — update body layout to use dynamic sizing |
| `tests/e2e/extension.spec.ts` | Modify — add resize/collapse E2E tests |

## Test Plan

**E2E tests:**
- Keys panel resize: drag handle, verify panel width changes
- Keys panel collapse: click collapse button, verify panel collapses and re-expands
- ChangeLog resize: drag handle, verify section height changes
- Existing tests still pass (layout changes don't break functionality)

## GitHub Workflow

- **Issue**: "feat: resizable and collapsible panels" (label: `feature`)
- **Branch**: `issue-{N}-resizable-panels`
- **PR**: targets `main`, body includes `Closes #{N}`
- **After merge**: bump to v1.4.0, tag `v1.4.0`
