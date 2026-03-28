import { describe, it, expect } from "vitest";
import { validateJson } from "@/lib/validate";

describe("validateJson", () => {
  it("returns valid for a correct JSON object", () => {
    const result = validateJson('{"a": 1}');
    expect(result.valid).toBe(true);
    expect(result.error).toBeNull();
  });

  it("returns valid for a correct JSON array", () => {
    const result = validateJson("[1, 2, 3]");
    expect(result.valid).toBe(true);
    expect(result.error).toBeNull();
  });

  it("returns invalid with error message for bad JSON", () => {
    const result = validateJson('{"a": }');
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("returns invalid for trailing comma", () => {
    const result = validateJson('{"a": 1,}');
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("returns valid for empty object", () => {
    const result = validateJson("{}");
    expect(result.valid).toBe(true);
    expect(result.error).toBeNull();
  });

  it("returns valid for empty array", () => {
    const result = validateJson("[]");
    expect(result.valid).toBe(true);
    expect(result.error).toBeNull();
  });
});
