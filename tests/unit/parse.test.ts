import { describe, it, expect } from "vitest";
import { parseStorageValue } from "@/lib/parse";

describe("parseStorageValue", () => {
  it("detects and pretty-prints a JSON object", () => {
    const result = parseStorageValue('{"name":"alice","age":30}');
    expect(result.isJson).toBe(true);
    expect(result.formatted).toBe('{\n  "name": "alice",\n  "age": 30\n}');
    expect(result.parsed).toEqual({ name: "alice", age: 30 });
  });

  it("detects and pretty-prints a JSON array", () => {
    const result = parseStorageValue("[1,2,3]");
    expect(result.isJson).toBe(true);
    expect(result.formatted).toBe("[\n  1,\n  2,\n  3\n]");
    expect(result.parsed).toEqual([1, 2, 3]);
  });

  it("returns raw string for non-JSON value", () => {
    const result = parseStorageValue("hello world");
    expect(result.isJson).toBe(false);
    expect(result.formatted).toBe("hello world");
    expect(result.parsed).toBeNull();
  });

  it("returns raw string for a plain number", () => {
    const result = parseStorageValue("42");
    expect(result.isJson).toBe(false);
    expect(result.formatted).toBe("42");
    expect(result.parsed).toBeNull();
  });

  it("returns raw string for a boolean", () => {
    const result = parseStorageValue("true");
    expect(result.isJson).toBe(false);
    expect(result.formatted).toBe("true");
    expect(result.parsed).toBeNull();
  });

  it("handles empty string", () => {
    const result = parseStorageValue("");
    expect(result.isJson).toBe(false);
    expect(result.formatted).toBe("");
    expect(result.parsed).toBeNull();
  });

  it("handles nested JSON", () => {
    const input = '{"user":{"name":"alice","prefs":{"theme":"dark"}}}';
    const result = parseStorageValue(input);
    expect(result.isJson).toBe(true);
    expect(result.parsed).toEqual({
      user: { name: "alice", prefs: { theme: "dark" } },
    });
  });
});
