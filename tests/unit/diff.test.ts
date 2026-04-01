import { describe, it, expect } from "vitest";
import { jsonDiff } from "@/lib/diff";
import type { FieldChange } from "@/lib/diff";

describe("jsonDiff", () => {
  it("returns empty array for identical JSON objects", () => {
    const json = JSON.stringify({ name: "Alice", age: 30 });
    expect(jsonDiff(json, json)).toEqual([]);
  });

  it("returns empty array for identical strings", () => {
    expect(jsonDiff("hello", "hello")).toEqual([]);
  });

  it("returns added when oldValue is null", () => {
    expect(jsonDiff(null, "value")).toEqual([{ path: "", type: "added" }]);
  });

  it("returns removed when newValue is null", () => {
    expect(jsonDiff("value", null)).toEqual([{ path: "", type: "removed" }]);
  });

  it("returns empty array when both are null", () => {
    expect(jsonDiff(null, null)).toEqual([]);
  });

  it("detects top-level field added", () => {
    const oldVal = JSON.stringify({ name: "Alice" });
    const newVal = JSON.stringify({ name: "Alice", age: 30 });
    expect(jsonDiff(oldVal, newVal)).toEqual([{ path: "age", type: "added" }]);
  });

  it("detects top-level field removed", () => {
    const oldVal = JSON.stringify({ name: "Alice", age: 30 });
    const newVal = JSON.stringify({ name: "Alice" });
    expect(jsonDiff(oldVal, newVal)).toEqual([{ path: "age", type: "removed" }]);
  });

  it("detects top-level field modified", () => {
    const oldVal = JSON.stringify({ name: "Alice", age: 30 });
    const newVal = JSON.stringify({ name: "Alice", age: 31 });
    expect(jsonDiff(oldVal, newVal)).toEqual([{ path: "age", type: "modified" }]);
  });

  it("detects nested field changes with dot-notation paths", () => {
    const oldVal = JSON.stringify({ user: { settings: { theme: "light" } } });
    const newVal = JSON.stringify({ user: { settings: { theme: "dark" } } });
    expect(jsonDiff(oldVal, newVal)).toEqual([
      { path: "user.settings.theme", type: "modified" },
    ]);
  });

  it("detects multiple nested changes", () => {
    const oldVal = JSON.stringify({ user: { name: "Alice", age: 30 } });
    const newVal = JSON.stringify({ user: { name: "Bob", age: 30, role: "admin" } });
    const changes = jsonDiff(oldVal, newVal);
    expect(changes).toContainEqual({ path: "user.name", type: "modified" });
    expect(changes).toContainEqual({ path: "user.role", type: "added" });
    expect(changes).toHaveLength(2);
  });

  it("detects array element changes by index", () => {
    const oldVal = JSON.stringify({ items: ["a", "b", "c"] });
    const newVal = JSON.stringify({ items: ["a", "x", "c"] });
    expect(jsonDiff(oldVal, newVal)).toEqual([
      { path: "items.1", type: "modified" },
    ]);
  });

  it("detects array element added", () => {
    const oldVal = JSON.stringify({ items: ["a"] });
    const newVal = JSON.stringify({ items: ["a", "b"] });
    expect(jsonDiff(oldVal, newVal)).toEqual([
      { path: "items.1", type: "added" },
    ]);
  });

  it("detects array element removed", () => {
    const oldVal = JSON.stringify({ items: ["a", "b"] });
    const newVal = JSON.stringify({ items: ["a"] });
    expect(jsonDiff(oldVal, newVal)).toEqual([
      { path: "items.1", type: "removed" },
    ]);
  });

  it("returns single modified entry for non-JSON strings", () => {
    expect(jsonDiff("hello", "world")).toEqual([{ path: "", type: "modified" }]);
  });

  it("returns single modified entry when types differ (string vs JSON)", () => {
    expect(jsonDiff("plain", JSON.stringify({ a: 1 }))).toEqual([
      { path: "", type: "modified" },
    ]);
  });

  it("returns single modified entry for root-level arrays", () => {
    expect(jsonDiff("[1,2]", "[1,3]")).toEqual([{ path: "", type: "modified" }]);
  });
});
