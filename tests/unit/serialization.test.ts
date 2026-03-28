import { describe, it, expect } from "vitest";
import { serializeExport, deserializeImport } from "@/lib/serialization";
import type { StorageEntry } from "@/shared/types";

describe("serializeExport", () => {
  it("serializes entries to a JSON string", () => {
    const entries: StorageEntry[] = [
      { key: "a", value: "1" },
      { key: "b", value: '{"nested": true}' },
    ];
    const result = serializeExport(entries);
    const parsed = JSON.parse(result);
    expect(parsed).toEqual({ a: "1", b: '{"nested": true}' });
  });

  it("produces pretty-printed JSON", () => {
    const entries: StorageEntry[] = [{ key: "x", value: "y" }];
    const result = serializeExport(entries);
    expect(result).toBe('{\n  "x": "y"\n}');
  });

  it("handles empty entries", () => {
    const result = serializeExport([]);
    expect(result).toBe("{}");
  });
});

describe("deserializeImport", () => {
  it("parses a valid JSON string into entries", () => {
    const input = '{"a": "1", "b": "2"}';
    const result = deserializeImport(input);
    expect(result.success).toBe(true);
    expect(result.entries).toEqual({ a: "1", b: "2" });
    expect(result.error).toBeNull();
  });

  it("returns error for invalid JSON", () => {
    const result = deserializeImport("not json");
    expect(result.success).toBe(false);
    expect(result.entries).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it("returns error for non-object JSON (array)", () => {
    const result = deserializeImport("[1, 2, 3]");
    expect(result.success).toBe(false);
    expect(result.entries).toBeNull();
    expect(result.error).toBe("Import file must contain a JSON object, not an array");
  });

  it("converts non-string values to strings", () => {
    const input = '{"count": 42, "active": true, "data": {"nested": 1}}';
    const result = deserializeImport(input);
    expect(result.success).toBe(true);
    expect(result.entries).toEqual({
      count: "42",
      active: "true",
      data: '{"nested":1}',
    });
  });
});
