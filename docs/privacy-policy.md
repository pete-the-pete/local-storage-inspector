# Privacy Policy — Local Storage Inspector

_Last updated: April 4, 2026_

## What this extension does

Local Storage Inspector is a developer tool that lets you view, edit, and monitor localStorage and sessionStorage on the active browser tab.

## Data collection

**This extension does not collect, store, or transmit any personal data.**

- No data is sent to external servers
- No analytics or tracking of any kind
- No cookies or persistent storage used by the extension itself
- All operations happen locally between the extension and the active tab

## Data access

The extension accesses localStorage and sessionStorage on the active tab **only when you click the extension icon**. This access uses Chrome's `activeTab` permission, which means:

- The extension cannot access any tab you haven't explicitly activated it on
- Access is revoked when you navigate away or close the tab
- No background access to any page's storage

## Storage change monitoring

The change monitoring feature captures storage mutations (setItem, removeItem, clear) on the active tab. These events are displayed in the extension's side panel and are stored only in memory. They are lost when the side panel is closed. No change data is persisted or transmitted.

## Permissions

| Permission | Why it's needed |
|------------|----------------|
| `activeTab` | Access the current tab's storage when you click the icon |
| `scripting` | Read and write storage values in the page context |
| `sidePanel` | Display the extension UI in Chrome's side panel |

## Third-party services

This extension does not use any third-party services, APIs, or SDKs.

## Changes to this policy

If this policy changes, the updated version will be posted here with a new "last updated" date.

## Contact

For questions about this privacy policy, open an issue at:
https://github.com/pete-the-pete/local-storage-inspector/issues
