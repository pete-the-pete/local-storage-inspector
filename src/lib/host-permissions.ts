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
