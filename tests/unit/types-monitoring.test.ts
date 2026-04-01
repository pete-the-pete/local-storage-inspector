import { describe, it, expect } from "vitest";
import type {
  StorageChangeEvent,
  StorageChangePortMessage,
  StorageOperation,
  ChangeSource,
} from "@/shared/types";

describe("StorageChangeEvent type", () => {
  it("represents a setItem change", () => {
    const event: StorageChangeEvent = {
      storageType: "localStorage",
      operation: "setItem",
      key: "theme",
      oldValue: "light",
      newValue: "dark",
      timestamp: 1711800000000,
      source: "page",
    };

    expect(event.operation).toBe("setItem");
    expect(event.key).toBe("theme");
    expect(event.oldValue).toBe("light");
    expect(event.newValue).toBe("dark");
    expect(event.source).toBe("page");
  });

  it("represents a removeItem change", () => {
    const event: StorageChangeEvent = {
      storageType: "sessionStorage",
      operation: "removeItem",
      key: "token",
      oldValue: "abc123",
      newValue: null,
      timestamp: 1711800000000,
      source: "extension",
    };

    expect(event.operation).toBe("removeItem");
    expect(event.newValue).toBeNull();
  });

  it("represents a clear change", () => {
    const event: StorageChangeEvent = {
      storageType: "localStorage",
      operation: "clear",
      key: null,
      oldValue: null,
      newValue: null,
      timestamp: 1711800000000,
      source: "page",
    };

    expect(event.operation).toBe("clear");
    expect(event.key).toBeNull();
  });
});

describe("StorageChangePortMessage", () => {
  it("batches multiple changes in a single message", () => {
    const changes: StorageChangeEvent[] = [
      {
        storageType: "localStorage",
        operation: "setItem",
        key: "a",
        oldValue: null,
        newValue: "1",
        timestamp: 1000,
        source: "page",
      },
      {
        storageType: "localStorage",
        operation: "setItem",
        key: "b",
        oldValue: null,
        newValue: "2",
        timestamp: 1001,
        source: "page",
      },
    ];

    const message: StorageChangePortMessage = {
      type: "STORAGE_CHANGE",
      changes,
    };

    expect(message.type).toBe("STORAGE_CHANGE");
    expect(message.changes).toHaveLength(2);
  });
});

describe("StorageOperation and ChangeSource types", () => {
  it("covers all storage operations", () => {
    const operations: StorageOperation[] = ["setItem", "removeItem", "clear"];
    expect(operations).toHaveLength(3);
  });

  it("covers all change sources", () => {
    const sources: ChangeSource[] = ["page", "extension", "unknown"];
    expect(sources).toHaveLength(3);
  });
});
