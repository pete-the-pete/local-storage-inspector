export interface FieldChange {
  path: string;
  type: "added" | "removed" | "modified";
}

export function jsonDiff(
  oldValue: string | null,
  newValue: string | null,
): FieldChange[] {
  if (oldValue === null && newValue !== null)
    return [{ path: "", type: "added" }];
  if (oldValue !== null && newValue === null)
    return [{ path: "", type: "removed" }];
  if (oldValue === null || newValue === null) return [];
  if (oldValue === newValue) return [];

  const oldParsed = tryParseObject(oldValue);
  const newParsed = tryParseObject(newValue);

  if (oldParsed !== null && newParsed !== null) {
    return compareValues(oldParsed, newParsed, "");
  }

  return [{ path: "", type: "modified" }];
}

function tryParseObject(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // not valid JSON
  }
  return null;
}

function compareValues(
  oldVal: unknown,
  newVal: unknown,
  prefix: string,
): FieldChange[] {
  if (isPlainObject(oldVal) && isPlainObject(newVal)) {
    return compareObjects(
      oldVal as Record<string, unknown>,
      newVal as Record<string, unknown>,
      prefix,
    );
  }

  if (Array.isArray(oldVal) && Array.isArray(newVal)) {
    return compareArrays(oldVal, newVal, prefix);
  }

  if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
    return [{ path: prefix, type: "modified" }];
  }

  return [];
}

function compareObjects(
  oldObj: Record<string, unknown>,
  newObj: Record<string, unknown>,
  prefix: string,
): FieldChange[] {
  const changes: FieldChange[] = [];
  const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

  for (const key of allKeys) {
    const path = prefix ? `${prefix}.${key}` : key;
    const hasOld = key in oldObj;
    const hasNew = key in newObj;

    if (!hasOld) {
      changes.push({ path, type: "added" });
    } else if (!hasNew) {
      changes.push({ path, type: "removed" });
    } else {
      changes.push(...compareValues(oldObj[key], newObj[key], path));
    }
  }

  return changes;
}

function compareArrays(
  oldArr: unknown[],
  newArr: unknown[],
  prefix: string,
): FieldChange[] {
  const changes: FieldChange[] = [];
  const maxLen = Math.max(oldArr.length, newArr.length);

  for (let i = 0; i < maxLen; i++) {
    const path = prefix ? `${prefix}.${i}` : `${i}`;
    if (i >= oldArr.length) {
      changes.push({ path, type: "added" });
    } else if (i >= newArr.length) {
      changes.push({ path, type: "removed" });
    } else {
      changes.push(...compareValues(oldArr[i], newArr[i], path));
    }
  }

  return changes;
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}
