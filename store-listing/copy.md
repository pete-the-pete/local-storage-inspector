# Chrome Web Store Listing Copy

> Paste these into the Chrome Web Store developer dashboard when it's available.

## Title

Local Storage Inspector

## Summary (132 characters max)

View, edit, and monitor localStorage and sessionStorage with a JSON editor, real-time change log, and field-level diffs.

_(126 characters)_

## Detailed Description

Local Storage Inspector is a developer tool for Chrome that gives you full visibility into any page's localStorage and sessionStorage — right from the side panel.

**Browse and search**
See every key at a glance in a clean, scrollable list. Filter by name to find what you need instantly. Switch between localStorage and sessionStorage with one click.

**Edit with a real JSON editor**
Values open in a CodeMirror editor with syntax highlighting (One Dark theme), bracket matching, and JSON validation. Edit complex nested objects without copy-pasting into an external tool.

**Monitor changes in real time**
A built-in change log captures every setItem, removeItem, and clear — from the page or from the extension. Each entry shows the operation, source, timestamp, and which fields changed.

**See what actually changed**
Expand any log entry to see a color-highlighted diff. Toggle between inline (old/new stacked) and unified (git-style +/- lines) views. The collapsed summary tells you at a glance: ~ modified, + added, - removed.

**Import and export**
Export all storage entries as JSON. Import from a file to restore state or seed test data. Option to clear existing storage before import.

**Resizable layout**
Drag to resize the key list and history panels. Collapse the key list entirely when you need more room for the editor.

Built with Manifest V3. Minimal permissions — only accesses storage on the active tab when you click the icon.

## Category

Developer Tools

## Language

English

---

## Single Purpose Description (for reviewers)

This extension allows web developers to view, edit, and monitor localStorage and sessionStorage on the active tab. It provides a side panel with a key browser, JSON editor, and real-time change log.

## Permissions Justifications

| Permission | Justification |
|------------|---------------|
| `activeTab` | Required to access the active tab's localStorage/sessionStorage when the user clicks the extension icon. Only grants access to the current tab on explicit user interaction. |
| `scripting` | Required to execute scripts in the page context to read, write, and monitor storage values. Used with `chrome.scripting.executeScript()`. |
| `sidePanel` | Required to display the extension UI in Chrome's side panel rather than a popup. The side panel provides the main interface for browsing, editing, and monitoring storage. |

## Data Usage Disclosures

- **Does this extension collect personal data?** No
- **Does this extension use remote code?** No
- **Data types collected:** None. All data stays local between the page and the extension. No data is transmitted to any server.
- **Certify compliance with Chrome Web Store limited use policy:** Yes

---

## Homepage URL

https://github.com/pete-the-pete/local-storage-inspector

## Support URL

https://github.com/pete-the-pete/local-storage-inspector/issues
