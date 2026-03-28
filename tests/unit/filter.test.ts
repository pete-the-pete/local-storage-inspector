import { describe, it, expect } from "vitest";
import { filterEntries } from "@/lib/filter";
import type { StorageEntry } from "@/shared/types";

const entries: StorageEntry[] = [
  { key: "user_name", value: "alice" },
  { key: "user_email", value: "alice@example.com" },
  { key: "theme", value: "dark" },
  { key: "auth_token", value: "abc123" },
];

describe("filterEntries", () => {
  it("returns all entries for empty query", () => {
    expect(filterEntries(entries, "")).toEqual(entries);
  });

  it("filters by key substring (case-insensitive)", () => {
    const result = filterEntries(entries, "user");
    expect(result).toEqual([
      { key: "user_name", value: "alice" },
      { key: "user_email", value: "alice@example.com" },
    ]);
  });

  it("is case insensitive", () => {
    const result = filterEntries(entries, "USER");
    expect(result).toEqual([
      { key: "user_name", value: "alice" },
      { key: "user_email", value: "alice@example.com" },
    ]);
  });

  it("returns empty array when nothing matches", () => {
    const result = filterEntries(entries, "zzz");
    expect(result).toEqual([]);
  });

  it("handles empty entries array", () => {
    expect(filterEntries([], "test")).toEqual([]);
  });
});
