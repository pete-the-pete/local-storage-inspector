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

export interface DiffLine {
  text: string;
  type: "added" | "removed" | "unchanged";
}

const MAX_SUMMARY_ITEMS = 3;

const SUMMARY_PREFIX: Record<FieldChange["type"], string> = {
  added: "+",
  removed: "-",
  modified: "~",
};

export function formatChangeSummary(changes: FieldChange[]): string {
  if (changes.length === 0) return "";

  if (changes.length === 1 && changes[0].path === "") {
    switch (changes[0].type) {
      case "added":
        return "(new)";
      case "removed":
        return "(deleted)";
      case "modified":
        return "value changed";
    }
  }

  const shown = changes.slice(0, MAX_SUMMARY_ITEMS);
  const parts = shown.map((c) => `${SUMMARY_PREFIX[c.type]} ${c.path}`);
  const remaining = changes.length - MAX_SUMMARY_ITEMS;
  if (remaining > 0) {
    parts.push(`+${remaining} more`);
  }
  return parts.join(", ");
}

export function diffLines(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");

  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const result: DiffLine[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({ text: oldLines[i - 1], type: "unchanged" });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ text: newLines[j - 1], type: "added" });
      j--;
    } else {
      result.unshift({ text: oldLines[i - 1], type: "removed" });
      i--;
    }
  }

  return result;
}
