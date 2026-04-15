import { describe, it, expect } from "vitest";
import { originToMatchPattern, matchPatternToOrigin, computeReconciliation } from "@/lib/host-permissions";

describe("originToMatchPattern", () => {
  it("converts an https URL to a scheme-agnostic host match pattern", () => {
    expect(originToMatchPattern("https://app.example.com/foo/bar?q=1")).toBe("*://app.example.com/*");
  });

  it("converts an http URL to the same scheme-agnostic pattern", () => {
    expect(originToMatchPattern("http://app.example.com/")).toBe("*://app.example.com/*");
  });

  it("preserves a non-default port", () => {
    expect(originToMatchPattern("http://localhost:3000/")).toBe("*://localhost:3000/*");
  });

  it("returns null for chrome:// URLs", () => {
    expect(originToMatchPattern("chrome://extensions")).toBeNull();
  });

  it("returns null for chrome-extension:// URLs", () => {
    expect(originToMatchPattern("chrome-extension://abc/popup.html")).toBeNull();
  });

  it("returns null for file:// URLs", () => {
    expect(originToMatchPattern("file:///Users/pete/foo.html")).toBeNull();
  });

  it("returns null for about:blank", () => {
    expect(originToMatchPattern("about:blank")).toBeNull();
  });

  it("returns null for data: URLs", () => {
    expect(originToMatchPattern("data:text/html,<p>hi</p>")).toBeNull();
  });

  it("returns null for malformed URLs", () => {
    expect(originToMatchPattern("not a url")).toBeNull();
  });

  it("returns null for undefined / empty", () => {
    expect(originToMatchPattern(undefined)).toBeNull();
    expect(originToMatchPattern("")).toBeNull();
  });
});

describe("matchPatternToOrigin", () => {
  it("extracts the host from a scheme-agnostic match pattern", () => {
    expect(matchPatternToOrigin("*://app.example.com/*")).toBe("app.example.com");
  });

  it("preserves the port when present", () => {
    expect(matchPatternToOrigin("*://localhost:3000/*")).toBe("localhost:3000");
  });

  it("returns null for unrecognized patterns", () => {
    expect(matchPatternToOrigin("<all_urls>")).toBeNull();
    expect(matchPatternToOrigin("https://example.com/*")).toBeNull();
    expect(matchPatternToOrigin("")).toBeNull();
  });
});

describe("originToMatchPattern + matchPatternToOrigin round-trip", () => {
  const urls = [
    "https://example.com/",
    "https://app.example.com/",
    "http://localhost:3000/",
    "http://127.0.0.1:8080/foo",
  ];

  it.each(urls)("round-trips %s", (url) => {
    const pattern = originToMatchPattern(url);
    expect(pattern).not.toBeNull();
    const origin = matchPatternToOrigin(pattern!);
    expect(origin).toBe(new URL(url).host);
  });
});

describe("computeReconciliation", () => {
  it("returns nothing to add or remove when the sets match", () => {
    expect(computeReconciliation(["a.com", "b.com"], ["a.com", "b.com"])).toEqual({
      toAdd: [],
      toRemove: [],
    });
  });

  it("detects origins to add (granted but not registered)", () => {
    expect(computeReconciliation(["a.com", "b.com"], ["a.com"])).toEqual({
      toAdd: ["b.com"],
      toRemove: [],
    });
  });

  it("detects origins to remove (registered but not granted)", () => {
    expect(computeReconciliation(["a.com"], ["a.com", "b.com"])).toEqual({
      toAdd: [],
      toRemove: ["b.com"],
    });
  });

  it("handles simultaneous adds and removes", () => {
    expect(computeReconciliation(["a.com", "c.com"], ["a.com", "b.com"])).toEqual({
      toAdd: ["c.com"],
      toRemove: ["b.com"],
    });
  });

  it("handles empty inputs", () => {
    expect(computeReconciliation([], [])).toEqual({ toAdd: [], toRemove: [] });
    expect(computeReconciliation(["a.com"], [])).toEqual({ toAdd: ["a.com"], toRemove: [] });
    expect(computeReconciliation([], ["a.com"])).toEqual({ toAdd: [], toRemove: ["a.com"] });
  });

  it("is order-insensitive for input lists", () => {
    expect(computeReconciliation(["b.com", "a.com"], ["a.com", "b.com"])).toEqual({
      toAdd: [],
      toRemove: [],
    });
  });
});
