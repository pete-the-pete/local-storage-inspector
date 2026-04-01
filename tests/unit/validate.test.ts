import { describe, it, expect } from "vitest";
import { validateJson, isValidStorageChangeData } from "@/lib/validate";

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

describe("isValidStorageChangeData", () => {
  const validData = {
    _lsi: "interceptor",
    storageType: "localStorage",
    operation: "setItem",
    key: "testKey",
    oldValue: null,
    newValue: "testValue",
    timestamp: 1711800000000,
    source: "page",
  };

  it("returns true for valid storage change data", () => {
    expect(isValidStorageChangeData(validData)).toBe(true);
  });

  it("returns true for sessionStorage type", () => {
    expect(isValidStorageChangeData({ ...validData, storageType: "sessionStorage" })).toBe(true);
  });

  it("returns true for all valid operations", () => {
    expect(isValidStorageChangeData({ ...validData, operation: "removeItem" })).toBe(true);
    expect(isValidStorageChangeData({ ...validData, operation: "clear" })).toBe(true);
  });

  it("returns true for all valid sources", () => {
    expect(isValidStorageChangeData({ ...validData, source: "extension" })).toBe(true);
    expect(isValidStorageChangeData({ ...validData, source: "unknown" })).toBe(true);
  });

  it("returns false for null", () => {
    expect(isValidStorageChangeData(null)).toBe(false);
  });

  it("returns false for non-object", () => {
    expect(isValidStorageChangeData("string")).toBe(false);
  });

  it("returns false for invalid storageType", () => {
    expect(isValidStorageChangeData({ ...validData, storageType: "badType" })).toBe(false);
  });

  it("returns false for invalid operation", () => {
    expect(isValidStorageChangeData({ ...validData, operation: "badOp" })).toBe(false);
  });

  it("returns false for invalid source", () => {
    expect(isValidStorageChangeData({ ...validData, source: "badSource" })).toBe(false);
  });

  it("returns false for non-number timestamp", () => {
    expect(isValidStorageChangeData({ ...validData, timestamp: "not-a-number" })).toBe(false);
  });

  it("returns false for non-string key", () => {
    expect(isValidStorageChangeData({ ...validData, key: 123 })).toBe(false);
  });

  it("returns true for null key (clear operation)", () => {
    expect(isValidStorageChangeData({ ...validData, key: null })).toBe(true);
  });

  it("returns true for null old/new values", () => {
    expect(isValidStorageChangeData({ ...validData, oldValue: null, newValue: null })).toBe(true);
  });

  it("returns false for non-string newValue", () => {
    expect(isValidStorageChangeData({ ...validData, newValue: 42 })).toBe(false);
  });
});
