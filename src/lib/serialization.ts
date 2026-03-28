import type { StorageEntry } from "@/shared/types";

export function serializeExport(entries: StorageEntry[]): string {
  const obj: Record<string, string> = {};
  for (const entry of entries) {
    obj[entry.key] = entry.value;
  }
  return JSON.stringify(obj, null, 2);
}

export interface ImportResult {
  success: boolean;
  entries: Record<string, string> | null;
  error: string | null;
}

export function deserializeImport(content: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    const message = e instanceof SyntaxError ? e.message : "Invalid JSON";
    return { success: false, entries: null, error: message };
  }

  if (Array.isArray(parsed)) {
    return {
      success: false,
      entries: null,
      error: "Import file must contain a JSON object, not an array",
    };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return {
      success: false,
      entries: null,
      error: "Import file must contain a JSON object",
    };
  }

  const entries: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    entries[key] = typeof value === "string" ? value : JSON.stringify(value);
  }

  return { success: true, entries, error: null };
}
