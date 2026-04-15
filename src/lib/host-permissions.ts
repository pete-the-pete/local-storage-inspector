// Pure helpers for converting between tab URLs and Chrome host match patterns,
// plus chrome-API wrappers for requesting, listing, and removing per-origin
// permissions and registering content scripts for granted origins.
//
// This file has two halves. The top half is pure and unit-tested. The bottom
// half wraps chrome.* APIs and is exercised via integration / manual testing.

export function originToMatchPattern(url: string | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  // parsed.host includes the port if present.
  return `*://${parsed.host}/*`;
}

export function matchPatternToOrigin(pattern: string): string | null {
  // We only recognize our own format: `*://<host>/*`. Anything else (including
  // scheme-specific patterns or <all_urls>) returns null — callers treat that
  // as "not a per-origin grant we manage".
  const match = pattern.match(/^\*:\/\/([^/]+)\/\*$/);
  return match ? match[1] : null;
}

export interface ReconciliationPlan {
  toAdd: string[];
  toRemove: string[];
}

/**
 * Given the set of origins the user has currently granted and the set of
 * origins we currently have content scripts registered for, compute the
 * minimal set of register/unregister operations needed to make them match.
 * Pure — no chrome API access. Order of the returned arrays follows the
 * input order of `granted` (for toAdd) and `registered` (for toRemove) so
 * that results are deterministic and easy to assert on.
 */
export function computeReconciliation(
  granted: string[],
  registered: string[],
): ReconciliationPlan {
  const grantedSet = new Set(granted);
  const registeredSet = new Set(registered);
  return {
    toAdd: granted.filter((origin) => !registeredSet.has(origin)),
    toRemove: registered.filter((origin) => !grantedSet.has(origin)),
  };
}

// ---------- chrome.* wrappers ----------

export async function hasOriginPermission(origin: string): Promise<boolean> {
  return chrome.permissions.contains({ origins: [`*://${origin}/*`] });
}

/**
 * Request permission for an origin. MUST be called synchronously from a user
 * gesture (e.g. directly in an onClick handler) — do NOT await anything
 * between the user click and this call, or Chrome will reject the request.
 */
export async function requestOriginPermission(origin: string): Promise<boolean> {
  return chrome.permissions.request({ origins: [`*://${origin}/*`] });
}

export async function removeOriginPermission(origin: string): Promise<boolean> {
  return chrome.permissions.remove({ origins: [`*://${origin}/*`] });
}

export async function listGrantedOrigins(): Promise<string[]> {
  const permissions = await chrome.permissions.getAll();
  const origins = permissions.origins ?? [];
  return origins
    .map((pattern) => matchPatternToOrigin(pattern))
    .filter((origin): origin is string => origin !== null);
}

// ---------- content script registration ----------

function interceptorScriptId(origin: string): string {
  return `lsi-interceptor-${origin}`;
}

function monitorScriptId(origin: string): string {
  return `lsi-monitor-${origin}`;
}

export async function registerScriptsForOrigin(origin: string): Promise<void> {
  const matches = [`*://${origin}/*`];
  await chrome.scripting.registerContentScripts([
    {
      id: interceptorScriptId(origin),
      matches,
      js: ["storage-interceptor.js"],
      runAt: "document_start",
      world: "MAIN",
      allFrames: false,
      persistAcrossSessions: true,
    },
    {
      id: monitorScriptId(origin),
      matches,
      js: ["monitor.js"],
      runAt: "document_idle",
      world: "ISOLATED",
      allFrames: false,
      persistAcrossSessions: true,
    },
  ]);
}

export async function unregisterScriptsForOrigin(origin: string): Promise<void> {
  const ids = [interceptorScriptId(origin), monitorScriptId(origin)];
  try {
    await chrome.scripting.unregisterContentScripts({ ids });
  } catch {
    // Already unregistered — ignore. Unregister errors only on unknown IDs,
    // which is fine for our idempotent use.
  }
}

/**
 * Reconcile registered content scripts against currently-granted origins.
 * Called on service worker install/startup to repair any drift. The
 * set-diff logic lives in the pure `computeReconciliation` helper (unit
 * tested in Task 3); this wrapper is thin chrome glue.
 */
export async function reconcileRegisteredScripts(): Promise<void> {
  const granted = await listGrantedOrigins();
  const registered = await chrome.scripting.getRegisteredContentScripts();

  const registeredOrigins: string[] = [];
  for (const script of registered) {
    if (script.id.startsWith("lsi-interceptor-")) {
      registeredOrigins.push(script.id.slice("lsi-interceptor-".length));
    }
  }

  const { toAdd, toRemove } = computeReconciliation(granted, registeredOrigins);
  for (const origin of toAdd) {
    await registerScriptsForOrigin(origin);
  }
  for (const origin of toRemove) {
    await unregisterScriptsForOrigin(origin);
  }
}
