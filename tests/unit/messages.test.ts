import { describe, it, expect } from "vitest";
import { createGetAllMessage, createSetValueMessage, createDeleteKeyMessage, createImportMessage } from "@/shared/messages";

describe("message creators", () => {
  it("creates GET_ALL message", () => {
    const msg = createGetAllMessage("localStorage");
    expect(msg).toEqual({ type: "GET_ALL", storageType: "localStorage" });
  });

  it("creates GET_ALL message for sessionStorage", () => {
    const msg = createGetAllMessage("sessionStorage");
    expect(msg).toEqual({ type: "GET_ALL", storageType: "sessionStorage" });
  });

  it("creates SET_VALUE message", () => {
    const msg = createSetValueMessage("localStorage", "myKey", '{"a":1}');
    expect(msg).toEqual({
      type: "SET_VALUE",
      storageType: "localStorage",
      key: "myKey",
      value: '{"a":1}',
    });
  });

  it("creates DELETE_KEY message", () => {
    const msg = createDeleteKeyMessage("sessionStorage", "myKey");
    expect(msg).toEqual({
      type: "DELETE_KEY",
      storageType: "sessionStorage",
      key: "myKey",
    });
  });

  it("creates IMPORT message without clear", () => {
    const entries = { a: "1", b: "2" };
    const msg = createImportMessage("localStorage", entries, false);
    expect(msg).toEqual({
      type: "IMPORT",
      storageType: "localStorage",
      entries,
      clearFirst: false,
    });
  });

  it("creates IMPORT message with clear", () => {
    const entries = { a: "1" };
    const msg = createImportMessage("localStorage", entries, true);
    expect(msg).toEqual({
      type: "IMPORT",
      storageType: "localStorage",
      entries,
      clearFirst: true,
    });
  });
});
