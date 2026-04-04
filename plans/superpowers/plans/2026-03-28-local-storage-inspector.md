# Local Storage Inspector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome extension (Manifest V3) that provides a popup UI for viewing and editing localStorage/sessionStorage values with proper JSON editing support.

**Architecture:** Popup (React) communicates with a content script injected on demand via `chrome.scripting.executeScript()`. All business logic lives in pure functions (`src/lib/`). Components are thin wiring between user events and pure functions. Shared TypeScript types enforce contracts between layers.

**Tech Stack:** Bun, TypeScript (strict), Vite + @crxjs/vite-plugin, React 19, CodeMirror 6, CSS Modules, Vitest, Playwright, ESLint + Prettier

**Spec:** `docs/superpowers/specs/2026-03-28-local-storage-inspector-design.md`

---

## File Map

| File | Responsibility |
|------|---------------|
| `package.json` | Dependencies, scripts (dev, build, test, test:e2e, lint, format) |
| `tsconfig.json` | TypeScript strict config for the project |
| `vite.config.ts` | Vite build config with @crxjs/vite-plugin for Chrome extension |
| `manifest.json` | Manifest V3: permissions (activeTab, scripting), popup entry point |
| `.prettierrc` | Prettier config |
| `eslint.config.js` | ESLint flat config |
| `src/shared/types.ts` | Message types (GET_ALL, SET_VALUE, DELETE_KEY, IMPORT), StorageEntry, StorageType |
| `src/shared/messages.ts` | Type-safe message creator functions |
| `src/lib/parse.ts` | `parseStorageValue()` — detect JSON vs raw string, pretty-print |
| `src/lib/validate.ts` | `validateJson()` — validate JSON string, return structured result |
| `src/lib/filter.ts` | `filterEntries()` — filter storage entries by search query |
| `src/lib/serialization.ts` | `serializeExport()`, `deserializeImport()` — import/export formatting |
| `src/content/content.ts` | Message listener: reads/writes localStorage/sessionStorage |
| `src/background/service-worker.ts` | Message relay between popup and content script |
| `src/popup/popup.html` | HTML shell for the popup |
| `src/popup/popup.tsx` | React entry point, renders App |
| `src/popup/components/App.tsx` | Root component: orchestrates state, injects content script, wires children |
| `src/popup/components/App.module.css` | App layout styles |
| `src/popup/components/StorageToggle.tsx` | localStorage/sessionStorage toggle |
| `src/popup/components/StorageToggle.module.css` | Toggle styles |
| `src/popup/components/SearchBar.tsx` | Key search/filter input |
| `src/popup/components/SearchBar.module.css` | Search bar styles |
| `src/popup/components/KeyList.tsx` | Scrollable list of storage keys |
| `src/popup/components/KeyList.module.css` | Key list styles |
| `src/popup/components/ValueEditor.tsx` | CodeMirror editor with save/cancel/copy/delete |
| `src/popup/components/ValueEditor.module.css` | Editor styles |
| `src/popup/components/ImportExport.tsx` | Import/export buttons and import preview |
| `src/popup/components/ImportExport.module.css` | Import/export styles |
| `tests/unit/parse.test.ts` | Tests for parseStorageValue |
| `tests/unit/validate.test.ts` | Tests for validateJson |
| `tests/unit/filter.test.ts` | Tests for filterEntries |
| `tests/unit/serialization.test.ts` | Tests for serializeExport, deserializeImport |
| `tests/e2e/extension.spec.ts` | Playwright E2E: full popup → storage flow |

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `manifest.json`, `.prettierrc`, `eslint.config.js`, `src/popup/popup.html`, `src/popup/popup.tsx`

- [ ] **Step 1: Initialize project with Bun**

```bash
cd /Users/pete/workspace/personal/local-storage-inspector
bun init -y
```

- [ ] **Step 2: Install dependencies**

```bash
bun add react react-dom
bun add -d typescript @types/react @types/react-dom @types/chrome vite @crxjs/vite-plugin @vitejs/plugin-react vitest playwright eslint prettier eslint-config-prettier @eslint/js typescript-eslint globals
```

- [ ] **Step 3: Create tsconfig.json**

Replace the generated `tsconfig.json` with:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*", "tests/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: Create manifest.json**

```json
{
  "manifest_version": 3,
  "name": "Local Storage Inspector",
  "version": "0.1.0",
  "description": "View and edit localStorage and sessionStorage with a proper JSON editor",
  "permissions": ["activeTab", "scripting"],
  "action": {
    "default_popup": "src/popup/popup.html",
    "default_title": "Local Storage Inspector"
  },
  "icons": {}
}
```

- [ ] **Step 5: Create vite.config.ts**

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.json";
import { resolve } from "path";

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});
```

- [ ] **Step 6: Create src/popup/popup.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Local Storage Inspector</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./popup.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Create src/popup/popup.tsx**

```tsx
import { createRoot } from "react-dom/client";

function App() {
  return <div>Local Storage Inspector</div>;
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
```

- [ ] **Step 8: Create .prettierrc**

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100
}
```

- [ ] **Step 9: Create eslint.config.js**

```javascript
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        chrome: "readonly",
      },
    },
  },
  {
    ignores: ["dist/**"],
  },
);
```

- [ ] **Step 10: Add scripts to package.json**

Add these scripts to `package.json`:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "lint": "eslint src/",
    "format": "prettier --write 'src/**/*.{ts,tsx,css}'"
  }
}
```

- [ ] **Step 11: Verify the build works**

```bash
bun run build
```

Expected: Build succeeds, `dist/` directory created with the extension files.

- [ ] **Step 12: Commit**

```bash
git add package.json bun.lock tsconfig.json vite.config.ts manifest.json .prettierrc eslint.config.js src/popup/popup.html src/popup/popup.tsx
git commit -m "feat: scaffold project with Vite, React, TypeScript, Manifest V3"
```

---

## Task 2: Shared Types and Messages

**Files:**
- Create: `src/shared/types.ts`, `src/shared/messages.ts`
- Test: `tests/unit/messages.test.ts`

- [ ] **Step 1: Write the test for message creators**

Create `tests/unit/messages.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun run test -- tests/unit/messages.test.ts
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Create vitest config**

Add to `vite.config.ts` (or create `vitest.config.ts` — we'll add to `vite.config.ts` for simplicity):

Add the `test` property to the existing `defineConfig`:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.json";
import { resolve } from "path";

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  test: {
    globals: false,
    environment: "node",
  },
});
```

- [ ] **Step 4: Create src/shared/types.ts**

```typescript
export type StorageType = "localStorage" | "sessionStorage";

export interface StorageEntry {
  key: string;
  value: string;
}

// Messages from popup → content script

export interface GetAllMessage {
  type: "GET_ALL";
  storageType: StorageType;
}

export interface SetValueMessage {
  type: "SET_VALUE";
  storageType: StorageType;
  key: string;
  value: string;
}

export interface DeleteKeyMessage {
  type: "DELETE_KEY";
  storageType: StorageType;
  key: string;
}

export interface ImportMessage {
  type: "IMPORT";
  storageType: StorageType;
  entries: Record<string, string>;
  clearFirst: boolean;
}

export type StorageMessage = GetAllMessage | SetValueMessage | DeleteKeyMessage | ImportMessage;

// Responses from content script → popup

export interface GetAllResponse {
  type: "GET_ALL_RESPONSE";
  entries: StorageEntry[];
}

export interface SetValueResponse {
  type: "SET_VALUE_RESPONSE";
  success: boolean;
}

export interface DeleteKeyResponse {
  type: "DELETE_KEY_RESPONSE";
  success: boolean;
}

export interface ImportResponse {
  type: "IMPORT_RESPONSE";
  success: boolean;
  count: number;
}

export type StorageResponse = GetAllResponse | SetValueResponse | DeleteKeyResponse | ImportResponse;
```

- [ ] **Step 5: Create src/shared/messages.ts**

```typescript
import type {
  GetAllMessage,
  SetValueMessage,
  DeleteKeyMessage,
  ImportMessage,
  StorageType,
} from "./types";

export function createGetAllMessage(storageType: StorageType): GetAllMessage {
  return { type: "GET_ALL", storageType };
}

export function createSetValueMessage(
  storageType: StorageType,
  key: string,
  value: string,
): SetValueMessage {
  return { type: "SET_VALUE", storageType, key, value };
}

export function createDeleteKeyMessage(
  storageType: StorageType,
  key: string,
): DeleteKeyMessage {
  return { type: "DELETE_KEY", storageType, key };
}

export function createImportMessage(
  storageType: StorageType,
  entries: Record<string, string>,
  clearFirst: boolean,
): ImportMessage {
  return { type: "IMPORT", storageType, entries, clearFirst };
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
bun run test -- tests/unit/messages.test.ts
```

Expected: All 6 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/shared/ tests/unit/messages.test.ts
git commit -m "feat: add shared types and message creators with tests"
```

---

## Task 3: Pure Functions — parse and validate

**Files:**
- Create: `src/lib/parse.ts`, `src/lib/validate.ts`
- Test: `tests/unit/parse.test.ts`, `tests/unit/validate.test.ts`

- [ ] **Step 1: Write parse tests**

Create `tests/unit/parse.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run parse tests to verify they fail**

```bash
bun run test -- tests/unit/parse.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement parseStorageValue**

Create `src/lib/parse.ts`:

```typescript
export interface ParsedValue {
  isJson: boolean;
  formatted: string;
  parsed: unknown | null;
}

export function parseStorageValue(raw: string): ParsedValue {
  if (raw === "") {
    return { isJson: false, formatted: "", parsed: null };
  }

  // Only treat objects and arrays as JSON — not bare primitives like "42" or "true"
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return { isJson: false, formatted: raw, parsed: null };
  }

  try {
    const parsed = JSON.parse(trimmed);
    return {
      isJson: true,
      formatted: JSON.stringify(parsed, null, 2),
      parsed,
    };
  } catch {
    return { isJson: false, formatted: raw, parsed: null };
  }
}
```

- [ ] **Step 4: Run parse tests to verify they pass**

```bash
bun run test -- tests/unit/parse.test.ts
```

Expected: All 7 tests PASS.

- [ ] **Step 5: Write validate tests**

Create `tests/unit/validate.test.ts`:

```typescript
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
```

- [ ] **Step 6: Run validate tests to verify they fail**

```bash
bun run test -- tests/unit/validate.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 7: Implement validateJson**

Create `src/lib/validate.ts`:

```typescript
export interface ValidationResult {
  valid: boolean;
  error: string | null;
}

export function validateJson(value: string): ValidationResult {
  try {
    JSON.parse(value);
    return { valid: true, error: null };
  } catch (e) {
    const message = e instanceof SyntaxError ? e.message : "Invalid JSON";
    return { valid: false, error: message };
  }
}
```

- [ ] **Step 8: Run validate tests to verify they pass**

```bash
bun run test -- tests/unit/validate.test.ts
```

Expected: All 6 tests PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/parse.ts src/lib/validate.ts tests/unit/parse.test.ts tests/unit/validate.test.ts
git commit -m "feat: add parseStorageValue and validateJson with tests"
```

---

## Task 4: Pure Functions — filter and serialization

**Files:**
- Create: `src/lib/filter.ts`, `src/lib/serialization.ts`
- Test: `tests/unit/filter.test.ts`, `tests/unit/serialization.test.ts`

- [ ] **Step 1: Write filter tests**

Create `tests/unit/filter.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run filter tests to verify they fail**

```bash
bun run test -- tests/unit/filter.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement filterEntries**

Create `src/lib/filter.ts`:

```typescript
import type { StorageEntry } from "@/shared/types";

export function filterEntries(entries: StorageEntry[], query: string): StorageEntry[] {
  if (query === "") return entries;
  const lower = query.toLowerCase();
  return entries.filter((entry) => entry.key.toLowerCase().includes(lower));
}
```

- [ ] **Step 4: Run filter tests to verify they pass**

```bash
bun run test -- tests/unit/filter.test.ts
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Write serialization tests**

Create `tests/unit/serialization.test.ts`:

```typescript
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
```

- [ ] **Step 6: Run serialization tests to verify they fail**

```bash
bun run test -- tests/unit/serialization.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 7: Implement serialization functions**

Create `src/lib/serialization.ts`:

```typescript
import type { StorageEntry } from "@/shared/types";

export function serializeExport(entries: StorageEntry[]): string {
  const obj: Record<string, string> = {};
  for (const entry of entries) {
    obj[entry.key] = entry.value;
  }
  return JSON.stringify(obj, null, 2);
}

export interface ImportResult {
  success: boolean;
  entries: Record<string, string> | null;
  error: string | null;
}

export function deserializeImport(content: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    const message = e instanceof SyntaxError ? e.message : "Invalid JSON";
    return { success: false, entries: null, error: message };
  }

  if (Array.isArray(parsed)) {
    return {
      success: false,
      entries: null,
      error: "Import file must contain a JSON object, not an array",
    };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return {
      success: false,
      entries: null,
      error: "Import file must contain a JSON object",
    };
  }

  const entries: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    entries[key] = typeof value === "string" ? value : JSON.stringify(value);
  }

  return { success: true, entries, error: null };
}
```

- [ ] **Step 8: Run serialization tests to verify they pass**

```bash
bun run test -- tests/unit/serialization.test.ts
```

Expected: All 7 tests PASS.

- [ ] **Step 9: Run all tests to verify nothing is broken**

```bash
bun run test
```

Expected: All tests PASS (6 messages + 7 parse + 6 validate + 5 filter + 7 serialization = 31 tests).

- [ ] **Step 10: Commit**

```bash
git add src/lib/filter.ts src/lib/serialization.ts tests/unit/filter.test.ts tests/unit/serialization.test.ts
git commit -m "feat: add filterEntries and import/export serialization with tests"
```

---

## Task 5: Content Script

**Files:**
- Create: `src/content/content.ts`

- [ ] **Step 1: Implement the content script**

Create `src/content/content.ts`:

```typescript
import type { StorageMessage, StorageResponse, StorageEntry } from "@/shared/types";

function getStorage(storageType: "localStorage" | "sessionStorage"): Storage {
  return storageType === "localStorage" ? window.localStorage : window.sessionStorage;
}

function handleGetAll(storageType: "localStorage" | "sessionStorage"): StorageResponse {
  const storage = getStorage(storageType);
  const entries: StorageEntry[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key !== null) {
      entries.push({ key, value: storage.getItem(key) ?? "" });
    }
  }
  return { type: "GET_ALL_RESPONSE", entries };
}

function handleSetValue(
  storageType: "localStorage" | "sessionStorage",
  key: string,
  value: string,
): StorageResponse {
  try {
    const storage = getStorage(storageType);
    storage.setItem(key, value);
    return { type: "SET_VALUE_RESPONSE", success: true };
  } catch {
    return { type: "SET_VALUE_RESPONSE", success: false };
  }
}

function handleDeleteKey(
  storageType: "localStorage" | "sessionStorage",
  key: string,
): StorageResponse {
  try {
    const storage = getStorage(storageType);
    storage.removeItem(key);
    return { type: "DELETE_KEY_RESPONSE", success: true };
  } catch {
    return { type: "DELETE_KEY_RESPONSE", success: false };
  }
}

function handleImport(
  storageType: "localStorage" | "sessionStorage",
  entries: Record<string, string>,
  clearFirst: boolean,
): StorageResponse {
  try {
    const storage = getStorage(storageType);
    if (clearFirst) {
      storage.clear();
    }
    let count = 0;
    for (const [key, value] of Object.entries(entries)) {
      storage.setItem(key, value);
      count++;
    }
    return { type: "IMPORT_RESPONSE", success: true, count };
  } catch {
    return { type: "IMPORT_RESPONSE", success: false, count: 0 };
  }
}

chrome.runtime.onMessage.addListener(
  (message: StorageMessage, _sender, sendResponse: (response: StorageResponse) => void) => {
    switch (message.type) {
      case "GET_ALL":
        sendResponse(handleGetAll(message.storageType));
        break;
      case "SET_VALUE":
        sendResponse(handleSetValue(message.storageType, message.key, message.value));
        break;
      case "DELETE_KEY":
        sendResponse(handleDeleteKey(message.storageType, message.key));
        break;
      case "IMPORT":
        sendResponse(handleImport(message.storageType, message.entries, message.clearFirst));
        break;
    }
    return true; // keep message channel open for sendResponse
  },
);
```

- [ ] **Step 2: Verify the build still works**

```bash
bun run build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/content/content.ts
git commit -m "feat: add content script for reading/writing storage"
```

---

## Task 6: Service Worker

**Files:**
- Create: `src/background/service-worker.ts`
- Modify: `manifest.json`

- [ ] **Step 1: Implement the service worker**

Create `src/background/service-worker.ts`:

```typescript
// Service worker is minimal — it only needs to exist for Manifest V3.
// The popup communicates with the content script via chrome.tabs.sendMessage,
// and the content script is injected on demand from the popup.
// No message relay needed since the popup injects and talks to the content script directly.

export {};
```

- [ ] **Step 2: Update manifest.json to register the service worker**

Add to `manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "Local Storage Inspector",
  "version": "0.1.0",
  "description": "View and edit localStorage and sessionStorage with a proper JSON editor",
  "permissions": ["activeTab", "scripting"],
  "action": {
    "default_popup": "src/popup/popup.html",
    "default_title": "Local Storage Inspector"
  },
  "background": {
    "service_worker": "src/background/service-worker.ts"
  },
  "icons": {}
}
```

- [ ] **Step 3: Verify the build still works**

```bash
bun run build
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/background/service-worker.ts manifest.json
git commit -m "feat: add service worker and register in manifest"
```

---

## Task 7: App Component — Storage Loading and Injection

**Files:**
- Create: `src/popup/components/App.tsx`, `src/popup/components/App.module.css`
- Modify: `src/popup/popup.tsx`

- [ ] **Step 1: Create App.module.css**

Create `src/popup/components/App.module.css`:

```css
.container {
  width: 450px;
  min-height: 300px;
  max-height: 600px;
  display: flex;
  flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 13px;
  color: #1a1a1a;
  background: #ffffff;
}

.header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid #e0e0e0;
}

.body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.error {
  padding: 12px;
  color: #d32f2f;
  text-align: center;
}

.loading {
  padding: 12px;
  color: #666;
  text-align: center;
}
```

- [ ] **Step 2: Create App.tsx**

Create `src/popup/components/App.tsx`:

```tsx
import { useState, useCallback } from "react";
import type { StorageType, StorageEntry, GetAllResponse } from "@/shared/types";
import { createGetAllMessage } from "@/shared/messages";
import { filterEntries } from "@/lib/filter";
import styles from "./App.module.css";

type LoadState = "idle" | "loading" | "ready" | "error";

export function App() {
  const [storageType, setStorageType] = useState<StorageType>("localStorage");
  const [entries, setEntries] = useState<StorageEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const loadEntries = useCallback(async (type: StorageType) => {
    setLoadState("loading");
    setSelectedKey(null);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        setErrorMessage("No active tab found");
        setLoadState("error");
        return;
      }

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["src/content/content.ts"],
      });

      const response: GetAllResponse = await chrome.tabs.sendMessage(
        tab.id,
        createGetAllMessage(type),
      );
      setEntries(response.entries);
      setLoadState("ready");
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "Failed to load storage");
      setLoadState("error");
    }
  }, []);

  const handleStorageTypeChange = useCallback(
    (type: StorageType) => {
      setStorageType(type);
      loadEntries(type);
    },
    [loadEntries],
  );

  const filteredEntries = filterEntries(entries, searchQuery);

  const selectedEntry = selectedKey
    ? entries.find((e) => e.key === selectedKey) ?? null
    : null;

  // Load on first render
  if (loadState === "idle") {
    loadEntries(storageType);
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        {/* StorageToggle and SearchBar will go here */}
        <span>Storage: {storageType}</span>
      </div>
      <div className={styles.body}>
        {loadState === "loading" && <div className={styles.loading}>Loading...</div>}
        {loadState === "error" && <div className={styles.error}>{errorMessage}</div>}
        {loadState === "ready" && (
          <div>
            {filteredEntries.map((entry) => (
              <div key={entry.key}>{entry.key}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update popup.tsx to use App component**

Replace `src/popup/popup.tsx`:

```tsx
import { createRoot } from "react-dom/client";
import { App } from "./components/App";

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
```

- [ ] **Step 4: Verify the build works**

```bash
bun run build
```

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/popup/components/App.tsx src/popup/components/App.module.css src/popup/popup.tsx
git commit -m "feat: add App component with storage loading and content script injection"
```

---

## Task 8: StorageToggle and SearchBar Components

**Files:**
- Create: `src/popup/components/StorageToggle.tsx`, `src/popup/components/StorageToggle.module.css`, `src/popup/components/SearchBar.tsx`, `src/popup/components/SearchBar.module.css`
- Modify: `src/popup/components/App.tsx`

- [ ] **Step 1: Create StorageToggle.module.css**

Create `src/popup/components/StorageToggle.module.css`:

```css
.toggle {
  display: flex;
  border: 1px solid #ccc;
  border-radius: 4px;
  overflow: hidden;
}

.button {
  padding: 4px 8px;
  border: none;
  background: #f5f5f5;
  cursor: pointer;
  font-size: 12px;
  color: #666;
}

.button:first-child {
  border-right: 1px solid #ccc;
}

.active {
  background: #1976d2;
  color: white;
}
```

- [ ] **Step 2: Create StorageToggle.tsx**

Create `src/popup/components/StorageToggle.tsx`:

```tsx
import type { StorageType } from "@/shared/types";
import styles from "./StorageToggle.module.css";

interface StorageToggleProps {
  storageType: StorageType;
  onChange: (type: StorageType) => void;
}

export function StorageToggle({ storageType, onChange }: StorageToggleProps) {
  return (
    <div className={styles.toggle}>
      <button
        className={`${styles.button} ${storageType === "localStorage" ? styles.active : ""}`}
        onClick={() => onChange("localStorage")}
      >
        Local
      </button>
      <button
        className={`${styles.button} ${storageType === "sessionStorage" ? styles.active : ""}`}
        onClick={() => onChange("sessionStorage")}
      >
        Session
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Create SearchBar.module.css**

Create `src/popup/components/SearchBar.module.css`:

```css
.search {
  flex: 1;
}

.input {
  width: 100%;
  padding: 4px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 12px;
  outline: none;
  box-sizing: border-box;
}

.input:focus {
  border-color: #1976d2;
}
```

- [ ] **Step 4: Create SearchBar.tsx**

Create `src/popup/components/SearchBar.tsx`:

```tsx
import styles from "./SearchBar.module.css";

interface SearchBarProps {
  query: string;
  onChange: (query: string) => void;
}

export function SearchBar({ query, onChange }: SearchBarProps) {
  return (
    <div className={styles.search}>
      <input
        className={styles.input}
        type="text"
        placeholder="Filter keys..."
        value={query}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
```

- [ ] **Step 5: Wire StorageToggle and SearchBar into App.tsx**

Replace the header placeholder in `src/popup/components/App.tsx`:

Replace:
```tsx
        {/* StorageToggle and SearchBar will go here */}
        <span>Storage: {storageType}</span>
```

With:
```tsx
        <StorageToggle storageType={storageType} onChange={handleStorageTypeChange} />
        <SearchBar query={searchQuery} onChange={setSearchQuery} />
```

Add imports at the top of App.tsx:
```tsx
import { StorageToggle } from "./StorageToggle";
import { SearchBar } from "./SearchBar";
```

- [ ] **Step 6: Verify the build works**

```bash
bun run build
```

Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/popup/components/StorageToggle.tsx src/popup/components/StorageToggle.module.css src/popup/components/SearchBar.tsx src/popup/components/SearchBar.module.css src/popup/components/App.tsx
git commit -m "feat: add StorageToggle and SearchBar components"
```

---

## Task 9: KeyList Component

**Files:**
- Create: `src/popup/components/KeyList.tsx`, `src/popup/components/KeyList.module.css`
- Modify: `src/popup/components/App.tsx`

- [ ] **Step 1: Create KeyList.module.css**

Create `src/popup/components/KeyList.module.css`:

```css
.list {
  width: 180px;
  border-right: 1px solid #e0e0e0;
  overflow-y: auto;
}

.item {
  padding: 6px 10px;
  cursor: pointer;
  border-bottom: 1px solid #f0f0f0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
}

.item:hover {
  background: #f5f5f5;
}

.selected {
  background: #e3f2fd;
}

.selected:hover {
  background: #bbdefb;
}

.empty {
  padding: 12px;
  color: #999;
  text-align: center;
  font-size: 12px;
}

.addButton {
  padding: 6px 10px;
  border: none;
  border-bottom: 1px solid #e0e0e0;
  background: #f5f5f5;
  cursor: pointer;
  font-size: 12px;
  color: #1976d2;
  text-align: left;
  width: 100%;
}

.addButton:hover {
  background: #e3f2fd;
}
```

- [ ] **Step 2: Create KeyList.tsx**

Create `src/popup/components/KeyList.tsx`:

```tsx
import type { StorageEntry } from "@/shared/types";
import styles from "./KeyList.module.css";

interface KeyListProps {
  entries: StorageEntry[];
  selectedKey: string | null;
  onSelectKey: (key: string) => void;
  onAddNew: () => void;
}

export function KeyList({ entries, selectedKey, onSelectKey, onAddNew }: KeyListProps) {
  return (
    <div className={styles.list}>
      <button className={styles.addButton} onClick={onAddNew}>
        + Add new key
      </button>
      {entries.length === 0 && <div className={styles.empty}>No keys found</div>}
      {entries.map((entry) => (
        <div
          key={entry.key}
          className={`${styles.item} ${entry.key === selectedKey ? styles.selected : ""}`}
          onClick={() => onSelectKey(entry.key)}
          title={entry.key}
        >
          {entry.key}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Wire KeyList into App.tsx**

In `src/popup/components/App.tsx`, replace the body content:

Replace:
```tsx
        {loadState === "ready" && (
          <div>
            {filteredEntries.map((entry) => (
              <div key={entry.key}>{entry.key}</div>
            ))}
          </div>
        )}
```

With:
```tsx
        {loadState === "ready" && (
          <>
            <KeyList
              entries={filteredEntries}
              selectedKey={selectedKey}
              onSelectKey={setSelectedKey}
              onAddNew={() => setSelectedKey(null)}
            />
            <div style={{ flex: 1, padding: 12 }}>
              {selectedEntry
                ? <span>Editor for: {selectedEntry.key}</span>
                : <span style={{ color: "#999" }}>Select a key to edit</span>
              }
            </div>
          </>
        )}
```

Add the import:
```tsx
import { KeyList } from "./KeyList";
```

- [ ] **Step 4: Verify the build works**

```bash
bun run build
```

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/popup/components/KeyList.tsx src/popup/components/KeyList.module.css src/popup/components/App.tsx
git commit -m "feat: add KeyList component with selection and add-new"
```

---

## Task 10: ValueEditor Component

**Files:**
- Create: `src/popup/components/ValueEditor.tsx`, `src/popup/components/ValueEditor.module.css`
- Modify: `src/popup/components/App.tsx`

- [ ] **Step 1: Install CodeMirror dependencies**

```bash
bun add codemirror @codemirror/lang-json @codemirror/view @codemirror/state @codemirror/basic-setup
```

- [ ] **Step 2: Create ValueEditor.module.css**

Create `src/popup/components/ValueEditor.module.css`:

```css
.editor {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-bottom: 1px solid #e0e0e0;
  background: #fafafa;
}

.keyName {
  font-weight: 600;
  font-size: 12px;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toolbarButton {
  padding: 3px 8px;
  border: 1px solid #ccc;
  border-radius: 3px;
  background: #fff;
  cursor: pointer;
  font-size: 11px;
}

.toolbarButton:hover {
  background: #f0f0f0;
}

.saveButton {
  background: #1976d2;
  color: white;
  border-color: #1565c0;
}

.saveButton:hover {
  background: #1565c0;
}

.saveButton:disabled {
  background: #bbb;
  border-color: #aaa;
  cursor: not-allowed;
}

.deleteButton {
  color: #d32f2f;
  border-color: #d32f2f;
}

.deleteButton:hover {
  background: #ffebee;
}

.toggleLabel {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #666;
}

.codemirror {
  flex: 1;
  overflow: auto;
}

.codemirror .cm-editor {
  height: 100%;
}

.validationError {
  padding: 4px 10px;
  background: #ffebee;
  color: #d32f2f;
  font-size: 11px;
  border-top: 1px solid #ffcdd2;
}

.successFlash {
  padding: 4px 10px;
  background: #e8f5e9;
  color: #2e7d32;
  font-size: 11px;
  border-top: 1px solid #c8e6c9;
}

.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: #999;
  font-size: 13px;
}
```

- [ ] **Step 3: Create ValueEditor.tsx**

Create `src/popup/components/ValueEditor.tsx`:

```tsx
import { useState, useRef, useCallback } from "react";
import { EditorView, keymap } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { basicSetup } from "@codemirror/basic-setup";
import { json } from "@codemirror/lang-json";
import { parseStorageValue } from "@/lib/parse";
import { validateJson } from "@/lib/validate";
import styles from "./ValueEditor.module.css";

interface ValueEditorProps {
  storageKey: string;
  value: string;
  onSave: (key: string, value: string) => void;
  onDelete: (key: string) => void;
  onCopy: (value: string) => void;
}

export function ValueEditor({ storageKey, value, onSave, onDelete, onCopy }: ValueEditorProps) {
  const parsed = parseStorageValue(value);
  const [jsonMode, setJsonMode] = useState(parsed.isJson);
  const [draft, setDraft] = useState(jsonMode ? parsed.formatted : value);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  const initEditor = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return;
      if (viewRef.current) {
        viewRef.current.destroy();
      }

      const extensions = [
        basicSetup,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const newValue = update.state.doc.toString();
            setDraft(newValue);
            if (jsonMode) {
              const result = validateJson(newValue);
              setValidationError(result.valid ? null : result.error);
            } else {
              setValidationError(null);
            }
          }
        }),
        keymap.of([
          {
            key: "Mod-s",
            run: () => {
              handleSave();
              return true;
            },
          },
        ]),
      ];

      if (jsonMode) {
        extensions.push(json());
      }

      const state = EditorState.create({
        doc: draft,
        extensions,
      });

      viewRef.current = new EditorView({ state, parent: node });
      editorRef.current = node;
    },
    [jsonMode],
  );

  const handleSave = () => {
    let valueToSave = draft;

    if (jsonMode) {
      const result = validateJson(draft);
      if (!result.valid) return;
      // Compact the JSON for storage (pretty-print is for display only)
      valueToSave = JSON.stringify(JSON.parse(draft));
    }

    onSave(storageKey, valueToSave);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 1500);
  };

  const handleToggleJson = () => {
    const newMode = !jsonMode;
    if (newMode) {
      // Switching to JSON mode — try to parse current draft
      const result = parseStorageValue(draft);
      if (result.isJson) {
        setDraft(result.formatted);
        setValidationError(null);
      } else {
        setValidationError("Value is not valid JSON");
      }
    } else {
      // Switching to raw mode
      setValidationError(null);
    }
    setJsonMode(newMode);
  };

  const handleDelete = () => {
    if (confirmDelete) {
      onDelete(storageKey);
      setConfirmDelete(false);
    } else {
      setConfirmDelete(true);
    }
  };

  const canSave = !jsonMode || validationError === null;

  return (
    <div className={styles.editor}>
      <div className={styles.toolbar}>
        <span className={styles.keyName} title={storageKey}>
          {storageKey}
        </span>
        <label className={styles.toggleLabel}>
          <input type="checkbox" checked={jsonMode} onChange={handleToggleJson} />
          JSON
        </label>
        <button className={styles.toolbarButton} onClick={() => onCopy(draft)}>
          Copy
        </button>
        <button
          className={`${styles.toolbarButton} ${styles.saveButton}`}
          onClick={handleSave}
          disabled={!canSave}
        >
          Save
        </button>
        <button
          className={`${styles.toolbarButton} ${styles.deleteButton}`}
          onClick={handleDelete}
        >
          {confirmDelete ? "Confirm?" : "Delete"}
        </button>
      </div>
      <div className={styles.codemirror} ref={initEditor} />
      {validationError && <div className={styles.validationError}>{validationError}</div>}
      {showSuccess && <div className={styles.successFlash}>Saved</div>}
    </div>
  );
}
```

- [ ] **Step 4: Wire ValueEditor into App.tsx**

In `src/popup/components/App.tsx`, add the messaging functions and wire ValueEditor.

Add these handler functions inside the `App` component, after the existing handlers:

```tsx
  const handleSave = useCallback(
    async (key: string, value: string) => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;
      await chrome.tabs.sendMessage(tab.id, createSetValueMessage(storageType, key, value));
      setEntries((prev) =>
        prev.map((e) => (e.key === key ? { ...e, value } : e)),
      );
    },
    [storageType],
  );

  const handleDelete = useCallback(
    async (key: string) => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;
      await chrome.tabs.sendMessage(tab.id, createDeleteKeyMessage(storageType, key));
      setEntries((prev) => prev.filter((e) => e.key !== key));
      setSelectedKey(null);
    },
    [storageType],
  );

  const handleCopy = useCallback(async (value: string) => {
    await navigator.clipboard.writeText(value);
  }, []);
```

Add the import for `createSetValueMessage` and `createDeleteKeyMessage` (update the existing messages import):

```tsx
import { createGetAllMessage, createSetValueMessage, createDeleteKeyMessage } from "@/shared/messages";
```

Add the import for ValueEditor:

```tsx
import { ValueEditor } from "./ValueEditor";
```

Replace the editor placeholder:

Replace:
```tsx
              {selectedEntry
                ? <span>Editor for: {selectedEntry.key}</span>
                : <span style={{ color: "#999" }}>Select a key to edit</span>
              }
```

With:
```tsx
              {selectedEntry ? (
                <ValueEditor
                  key={selectedEntry.key}
                  storageKey={selectedEntry.key}
                  value={selectedEntry.value}
                  onSave={handleSave}
                  onDelete={handleDelete}
                  onCopy={handleCopy}
                />
              ) : (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#999" }}>
                  Select a key to edit
                </div>
              )}
```

- [ ] **Step 5: Verify the build works**

```bash
bun run build
```

Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/popup/components/ValueEditor.tsx src/popup/components/ValueEditor.module.css src/popup/components/App.tsx
git commit -m "feat: add ValueEditor with CodeMirror, JSON toggle, save, delete, copy"
```

---

## Task 11: Add New Key Flow

**Files:**
- Modify: `src/popup/components/App.tsx`

- [ ] **Step 1: Add "add new key" state and handler to App.tsx**

Add state for adding a new key:

```tsx
const [addingNew, setAddingNew] = useState(false);
const [newKeyName, setNewKeyName] = useState("");
```

Update the `onAddNew` handler in the KeyList props:

Replace:
```tsx
              onAddNew={() => setSelectedKey(null)}
```

With:
```tsx
              onAddNew={() => {
                setSelectedKey(null);
                setAddingNew(true);
                setNewKeyName("");
              }}
```

Replace the "Select a key to edit" placeholder with an add-new form when `addingNew` is true:

Replace:
```tsx
              {selectedEntry ? (
                <ValueEditor
                  key={selectedEntry.key}
                  storageKey={selectedEntry.key}
                  value={selectedEntry.value}
                  onSave={handleSave}
                  onDelete={handleDelete}
                  onCopy={handleCopy}
                />
              ) : (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#999" }}>
                  Select a key to edit
                </div>
              )}
```

With:
```tsx
              {selectedEntry ? (
                <ValueEditor
                  key={selectedEntry.key}
                  storageKey={selectedEntry.key}
                  value={selectedEntry.value}
                  onSave={handleSave}
                  onDelete={handleDelete}
                  onCopy={handleCopy}
                />
              ) : addingNew ? (
                <div style={{ flex: 1, padding: 12 }}>
                  <div style={{ marginBottom: 8 }}>
                    <label style={{ fontSize: 12, fontWeight: 600 }}>Key name:</label>
                    <input
                      style={{ width: "100%", padding: "4px 8px", marginTop: 4, boxSizing: "border-box", border: "1px solid #ccc", borderRadius: 4, fontSize: 12 }}
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      placeholder="Enter key name"
                      autoFocus
                    />
                  </div>
                  {newKeyName && (
                    <ValueEditor
                      key={`new-${newKeyName}`}
                      storageKey={newKeyName}
                      value=""
                      onSave={(key, value) => {
                        handleSave(key, value);
                        setAddingNew(false);
                        setSelectedKey(key);
                        loadEntries(storageType);
                      }}
                      onDelete={() => setAddingNew(false)}
                      onCopy={handleCopy}
                    />
                  )}
                </div>
              ) : (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#999" }}>
                  Select a key to edit
                </div>
              )}
```

Also, when a key is selected from the list, cancel the add-new flow:

Replace:
```tsx
              onSelectKey={setSelectedKey}
```

With:
```tsx
              onSelectKey={(key) => { setSelectedKey(key); setAddingNew(false); }}
```

- [ ] **Step 2: Verify the build works**

```bash
bun run build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/popup/components/App.tsx
git commit -m "feat: add new key creation flow"
```

---

## Task 12: ImportExport Component

**Files:**
- Create: `src/popup/components/ImportExport.tsx`, `src/popup/components/ImportExport.module.css`
- Modify: `src/popup/components/App.tsx`

- [ ] **Step 1: Create ImportExport.module.css**

Create `src/popup/components/ImportExport.module.css`:

```css
.bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-top: 1px solid #e0e0e0;
  background: #fafafa;
}

.button {
  padding: 3px 8px;
  border: 1px solid #ccc;
  border-radius: 3px;
  background: #fff;
  cursor: pointer;
  font-size: 11px;
}

.button:hover {
  background: #f0f0f0;
}

.fileInput {
  display: none;
}

.preview {
  padding: 8px 12px;
  background: #fff3e0;
  border-top: 1px solid #ffe0b2;
  font-size: 11px;
}

.previewTitle {
  font-weight: 600;
  margin-bottom: 4px;
}

.previewKeys {
  max-height: 80px;
  overflow-y: auto;
  margin: 4px 0;
}

.previewKey {
  padding: 1px 0;
  color: #555;
}

.overwrite {
  color: #e65100;
}

.previewActions {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}

.confirmButton {
  padding: 3px 8px;
  border: 1px solid #e65100;
  border-radius: 3px;
  background: #e65100;
  color: white;
  cursor: pointer;
  font-size: 11px;
}

.confirmButton:hover {
  background: #bf360c;
}

.cancelButton {
  padding: 3px 8px;
  border: 1px solid #ccc;
  border-radius: 3px;
  background: #fff;
  cursor: pointer;
  font-size: 11px;
}

.error {
  padding: 4px 10px;
  background: #ffebee;
  color: #d32f2f;
  font-size: 11px;
  border-top: 1px solid #ffcdd2;
}
```

- [ ] **Step 2: Create ImportExport.tsx**

Create `src/popup/components/ImportExport.tsx`:

```tsx
import { useState, useRef } from "react";
import type { StorageEntry } from "@/shared/types";
import { serializeExport, deserializeImport } from "@/lib/serialization";
import styles from "./ImportExport.module.css";

interface ImportExportProps {
  entries: StorageEntry[];
  onImport: (entries: Record<string, string>, clearFirst: boolean) => void;
}

export function ImportExport({ entries, onImport }: ImportExportProps) {
  const [importPreview, setImportPreview] = useState<Record<string, string> | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const existingKeys = new Set(entries.map((e) => e.key));

  const handleExport = () => {
    const content = serializeExport(entries);
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "storage-export.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const content = await file.text();
    const result = deserializeImport(content);

    if (!result.success) {
      setImportError(result.error);
      setImportPreview(null);
    } else {
      setImportPreview(result.entries);
      setImportError(null);
    }

    // Reset file input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleConfirmImport = () => {
    if (!importPreview) return;
    onImport(importPreview, false);
    setImportPreview(null);
  };

  const handleCancelImport = () => {
    setImportPreview(null);
    setImportError(null);
  };

  return (
    <>
      <div className={styles.bar}>
        <button className={styles.button} onClick={handleExport}>
          Export
        </button>
        <button className={styles.button} onClick={() => fileInputRef.current?.click()}>
          Import
        </button>
        <input
          ref={fileInputRef}
          className={styles.fileInput}
          type="file"
          accept=".json"
          onChange={handleFileSelect}
        />
      </div>
      {importError && <div className={styles.error}>{importError}</div>}
      {importPreview && (
        <div className={styles.preview}>
          <div className={styles.previewTitle}>
            Import {Object.keys(importPreview).length} key(s):
          </div>
          <div className={styles.previewKeys}>
            {Object.keys(importPreview).map((key) => (
              <div
                key={key}
                className={`${styles.previewKey} ${existingKeys.has(key) ? styles.overwrite : ""}`}
              >
                {key}
                {existingKeys.has(key) && " (overwrite)"}
              </div>
            ))}
          </div>
          <div className={styles.previewActions}>
            <button className={styles.confirmButton} onClick={handleConfirmImport}>
              Confirm Import
            </button>
            <button className={styles.cancelButton} onClick={handleCancelImport}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 3: Wire ImportExport into App.tsx**

Add the import handler to App.tsx:

```tsx
  const handleImport = useCallback(
    async (importEntries: Record<string, string>, clearFirst: boolean) => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;
      await chrome.tabs.sendMessage(
        tab.id,
        createImportMessage(storageType, importEntries, clearFirst),
      );
      loadEntries(storageType);
    },
    [storageType, loadEntries],
  );
```

Add the import for `createImportMessage` (update the existing messages import):

```tsx
import {
  createGetAllMessage,
  createSetValueMessage,
  createDeleteKeyMessage,
  createImportMessage,
} from "@/shared/messages";
```

Add the import for ImportExport:

```tsx
import { ImportExport } from "./ImportExport";
```

Add `<ImportExport>` at the bottom of the container, after the `.body` div:

```tsx
      {loadState === "ready" && (
        <ImportExport entries={entries} onImport={handleImport} />
      )}
```

- [ ] **Step 4: Verify the build works**

```bash
bun run build
```

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/popup/components/ImportExport.tsx src/popup/components/ImportExport.module.css src/popup/components/App.tsx
git commit -m "feat: add ImportExport component with preview and confirmation"
```

---

## Task 13: Keyboard Shortcuts (Escape to cancel)

**Files:**
- Modify: `src/popup/components/App.tsx`

- [ ] **Step 1: Add Escape key handler to App.tsx**

Add an event handler in the App component (this is one place where a minimal effect is justified — listening to a global key event):

```tsx
  // Escape to deselect — one of the few justified effects
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") {
      setSelectedKey(null);
      setAddingNew(false);
    }
  }, []);

  // Attach once on mount
  if (typeof window !== "undefined") {
    window.addEventListener("keydown", handleKeyDown);
  }
```

Note: Since this is a popup that mounts once and unmounts when closed, we don't need cleanup — the popup's lifecycle handles it. But if the reviewer prefers an effect with cleanup, that's acceptable here.

- [ ] **Step 2: Verify the build works**

```bash
bun run build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/popup/components/App.tsx
git commit -m "feat: add Escape key to deselect current key"
```

---

## Task 14: E2E Test Setup and First Test

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/extension.spec.ts`

- [ ] **Step 1: Install Playwright browsers**

```bash
bunx playwright install chromium
```

- [ ] **Step 2: Create playwright.config.ts**

```typescript
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30000,
  use: {
    headless: false, // Chrome extensions require headed mode
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
      },
    },
  ],
});
```

- [ ] **Step 3: Create the E2E test**

Create `tests/e2e/extension.spec.ts`:

```typescript
import { test, expect, chromium, type BrowserContext } from "@playwright/test";
import path from "path";

const extensionPath = path.resolve(__dirname, "../../dist");

let context: BrowserContext;

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext("", {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });
});

test.afterAll(async () => {
  await context.close();
});

test("extension loads and shows popup", async () => {
  // Navigate to a page so we have storage to inspect
  const page = await context.newPage();
  await page.goto("https://example.com");

  // Set some localStorage values
  await page.evaluate(() => {
    localStorage.setItem("test_string", "hello");
    localStorage.setItem("test_json", '{"name":"alice","age":30}');
  });

  // Get the extension ID from the service worker
  let extensionId = "";
  const serviceWorkers = context.serviceWorkers();
  if (serviceWorkers.length > 0) {
    const url = serviceWorkers[0].url();
    extensionId = url.split("/")[2];
  } else {
    // Wait for service worker
    const sw = await context.waitForEvent("serviceworker");
    extensionId = sw.url().split("/")[2];
  }

  // Open the popup
  const popupPage = await context.newPage();
  await popupPage.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);

  // Verify the popup loaded
  await expect(popupPage.locator("text=Local")).toBeVisible();
  await expect(popupPage.locator("text=Session")).toBeVisible();

  await page.close();
  await popupPage.close();
});
```

- [ ] **Step 4: Build and run the E2E test**

```bash
bun run build && bun run test:e2e
```

Expected: Test passes — extension loads, popup opens, toggle buttons visible.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts tests/e2e/extension.spec.ts
git commit -m "feat: add Playwright E2E test setup with first extension test"
```

---

## Task 15: Run All Tests and Final Verification

**Files:** None — verification only.

- [ ] **Step 1: Run all unit tests**

```bash
bun run test
```

Expected: All 31 unit tests pass.

- [ ] **Step 2: Run lint**

```bash
bun run lint
```

Expected: No errors. Fix any that appear.

- [ ] **Step 3: Run format**

```bash
bun run format
```

Expected: Files formatted. Commit any changes.

- [ ] **Step 4: Build the extension**

```bash
bun run build
```

Expected: Clean build, no errors.

- [ ] **Step 5: Run E2E tests**

```bash
bun run test:e2e
```

Expected: E2E test passes.

- [ ] **Step 6: Manual smoke test**

1. Open Chrome, go to `chrome://extensions`
2. Enable Developer mode
3. Click "Load unpacked" → select the `dist/` folder
4. Navigate to any website
5. Click the extension icon
6. Verify: key list appears, toggle works, can select and edit a value, can save, can add new key, can delete, can import/export

- [ ] **Step 7: Commit any remaining changes**

```bash
git add -A
git commit -m "chore: final formatting and cleanup"
```
