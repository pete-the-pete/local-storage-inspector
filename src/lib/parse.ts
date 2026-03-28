export interface ParsedValue {
  isJson: boolean;
  formatted: string;
  parsed: unknown | null;
}

export function parseStorageValue(raw: string): ParsedValue {
  if (raw === "") {
    return { isJson: false, formatted: "", parsed: null };
  }

  const trimmed = raw.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return { isJson: false, formatted: raw, parsed: null };
  }

  try {
    const parsed = JSON.parse(trimmed);
    return {
      isJson: true,
      formatted: JSON.stringify(parsed, null, 2),
      parsed,
    };
  } catch {
    return { isJson: false, formatted: raw, parsed: null };
  }
}
