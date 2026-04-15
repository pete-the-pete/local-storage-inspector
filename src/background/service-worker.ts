import {
  matchPatternToOrigin,
  reconcileRegisteredScripts,
  registerScriptsForOrigin,
  unregisterScriptsForOrigin,
} from "@/lib/host-permissions";

chrome.action.onClicked.addListener((tab) => {
  if (tab.id === undefined) return;
  // Injection happens in the sidepanel's loadEntries — the only job here
  // is to open the panel. See design note in the task header.
  chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onInstalled.addListener(() => {
  void reconcileRegisteredScripts();
});

chrome.runtime.onStartup.addListener(() => {
  void reconcileRegisteredScripts();
});

chrome.permissions.onAdded.addListener((permissions) => {
  const origins = permissions.origins ?? [];
  for (const pattern of origins) {
    const origin = matchPatternToOrigin(pattern);
    if (origin) {
      void registerScriptsForOrigin(origin);
    }
  }
});

chrome.permissions.onRemoved.addListener((permissions) => {
  const origins = permissions.origins ?? [];
  for (const pattern of origins) {
    const origin = matchPatternToOrigin(pattern);
    if (origin) {
      void unregisterScriptsForOrigin(origin);
    }
  }
});
