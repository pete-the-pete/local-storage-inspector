export interface ValidationResult {
  valid: boolean;
  error: string | null;
}

export function validateJson(value: string): ValidationResult {
  try {
    JSON.parse(value);
    return { valid: true, error: null };
  } catch (e) {
    const message = e instanceof SyntaxError ? e.message : "Invalid JSON";
    return { valid: false, error: message };
  }
}

export function isValidStorageChangeData(data: unknown): boolean {
  if (typeof data !== "object" || data === null) return false;

  const d = data as Record<string, unknown>;

  const validStorageTypes = ["localStorage", "sessionStorage"];
  const validOperations = ["setItem", "removeItem", "clear"];
  const validSources = ["page", "extension", "unknown"];

  return (
    typeof d.storageType === "string" &&
    validStorageTypes.includes(d.storageType) &&
    typeof d.operation === "string" &&
    validOperations.includes(d.operation) &&
    typeof d.source === "string" &&
    validSources.includes(d.source) &&
    typeof d.timestamp === "number" &&
    (typeof d.key === "string" || d.key === null) &&
    (typeof d.oldValue === "string" || d.oldValue === null) &&
    (typeof d.newValue === "string" || d.newValue === null)
  );
}
