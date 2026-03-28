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
